# GuitAI — Pitch detection & tuning logic

This document explains *why* the tuner works the way it does: algorithm choice,
the math, the tuning of every threshold, and the known limits. Code lives in
`src/pitch/` (detection & smoothing) and `src/tuner/` (evaluation).

---

## 1. The problem

A real-time guitar tuner must estimate the fundamental frequency (f0) of a
plucked string from microphone samples, and keep doing so smoothly and quickly.
Guitar audio makes this harder than it looks:

1. **Strong harmonics.** A plucked string produces a rich spectrum; the
   fundamental is frequently *not* the strongest partial. Any method that
   simply picks the largest spectral peak (or the naive autocorrelation peak)
   will lock onto the wrong octave.
2. **Low notes need long analysis windows.** Low E = 82.41 Hz → period ≈ 12.1 ms.
   A reliable pitch estimate needs several periods inside the window.
3. **Noise.** Room tone, fingers, pick scrapes and breathing produce frames
   with no pitch at all; those must be rejected, not displayed.
4. **Polyphony risk.** The user may brush a second string. Estimation is
   inherently monophonic (see §7); the display must not thrash when it happens.
5. **Stability vs. latency.** Per-frame estimates jitter several cents even on
   a perfectly steady string; the tuner must average without feeling laggy.

## 2. Why YIN (and not X)

| Approach | Idea | Guitar verdict |
| --- | --- | --- |
| Naive autocorrelation | pick the lag maximizing `Σ x[j]·x[j+τ]` | ❌ biased toward the *strongest* harmonic content; octave errors |
| Zero-crossing counting | count sign changes | ❌ cheap but wrecked by harmonics/noise, poor resolution |
| Spectral peak / HPS | FFT peak, harmonic product spectrum | ❌ HPS helps but is fragile with decay + inharmonicity; FFT resolution poor at 82 Hz without huge windows |
| **McLeod Pitch Method (MPM)** | normalized square difference function (NSDF), pick best “keyness” peak | 🟡 good (correctly octave-robust), but peak-picking has more tuning surface; complex to get right |
| **YIN** (de Cheveigné & Kawahara, JASA 2002) | **difference function** `d(τ) = Σ (x[j] − x[j+τ])²`, cumulatively normalized | ✅ chosen |

YIN was chosen for three concrete reasons:

1. **It is minimization-based, not peak-picking based.** At the true period the
   waveform lines up with itself, so the difference collapses to ~0 *regardless
   of the harmonic balance*. A dominant 2nd harmonic therefore *helps* YIN find
   the fundamental rather than tricking it into an octave-up answer. (The
   harmonic content only cancels perfectly at the fundamental’s period.)
2. **It needs no windowing or FFT** and its math is short enough to audit line
   by line — important for a personal project you will keep modifying.
3. **It carries its own voiced/unvoiced test** (see §5), which we use to reject
   noise frames.

MPM is a fine alternative (same family of ideas — the NSDF is YIN’s difference
function with different normalization); YIN simply has fewer magic numbers and
is easier to verify, which matched this project’s priorities.

## 3. The algorithm (as implemented in `src/pitch/yin.ts`)

Given a frame `x[0..N)` and a sample rate `f_s`:

**Step 0 — preconditioning.** Remove the DC offset (subtract the mean) and bail
out on digital silence.

**Step 1 — lag bounds.** We only search fundamentals in
`[minFrequency, maxFrequency] = [60 Hz, 500 Hz]` (60 Hz is below a badly
detuned low E; 500 Hz covers E4 at 329.6 Hz with slack). In samples:

```
τ_min = ⌊ f_s / 500 ⌋          τ_max = ⌈ f_s / 60 ⌉
```

(e.g. τ ∈ [88, 735] at 44.1 kHz). This both saves compute and makes the search
range explicit.

**Step 2 — difference function** (YIN eq. 6):

```
d(τ) = Σ_{j=0}^{N−τ−1} (x[j] − x[j+τ])²        for τ = 1 … τ_max
```

At `τ = 1/f0` the shifted waveform aligns and `d` is small; at other lags it is
large. This is an O(N·τ_max) computation (~2.7M multiply-adds for N = 4096 at
44.1 kHz), which is why the engine cadence is ~30 Hz rather than 60 (see §6).

**Step 3 — cumulative-mean normalization** (YIN eq. 8):

```
d′(τ) = d(τ) · τ / Σ_{k=1..τ} d(k)
```

Without this, `d` drifts with τ and a fixed threshold is meaningless. The
cumulative mean also *flattens* the function for aperiodic input (noise), which
is what turns “is this pitched?” into a clean threshold test.

**Step 4 — choose the period.** YIN’s rule: take the **first valley of d′ below
the absolute threshold** (default `threshold = 0.15`; §5 discusses it). The
implementation walks to the *bottom* of that valley — grabbing only the first
sample below the threshold would bias the estimate because that sample sits on
the slope, not the minimum (this exact bug was found by the test suite). If no
valley dips below the threshold, fall back to the global minimum of `d′`.

**Step 5 — parabolic interpolation** (YIN eq. 9) around the chosen integer lag
for sub-sample accuracy:

```
δ = ½ · (d′[τ−1] − d′[τ+1]) / (d′[τ−1] − 2·d′[τ] + d′[τ+1])
f0 = f_s / (τ + δ)
```

Without it, a 12 ms period quantized to whole samples is wrong by up to ±4¢ at
82 Hz — far above the ±5¢ in-tune band.

**Step 6 — voiced/unvoiced gate.** Return `null` unless the valley is deep
enough (`d′[τ] ≤ 0.5`). White noise keeps its normalized difference near 1.0,
so this reliably discards unvoiced frames; the engine applies an additional RMS
gate first (below).

## 4. Frame size

The analyser delivers frames of **N = 4096** samples:

| Sample rate | Window | Low-E periods inside (82.41 Hz, 12.14 ms) |
| --- | --- | --- |
| 44.1 kHz | 92.9 ms | ≈ 7.7 |
| 48 kHz | 85.3 ms | ≈ 7.0 |

YIN needs roughly 2–3 periods to be reliable; ≈7 periods gives a big margin for
the fundamental to assert itself against harmonics and noise. Windows are read
as “the newest 4096 samples” on every tick, so successive analyses overlap by
~60 ms — effectively continuous coverage with ~93 ms of audio latency, which is
imperceptible while tuning.

## 5. Voicing gates and why these numbers

A frame only becomes a pitch candidate if *all* gates pass:

| Gate | Where | Value | Meaning |
| --- | --- | --- | --- |
| RMS level | `engine.ts` | `SILENCE_RMS = 0.0025` (≈ −52 dBFS) | digital silence / far-away mic |
| Periodicity | `yin.ts` | `d′[τ] ≤ 0.5` | noise-like frames are unpitched |
| YIN threshold | `yin.ts` | dip below `0.15` preferred | standard YIN value; slightly loosened from the paper’s 0.1 to tolerate mic noise, while 0.15 still rejects sub-octave dips |
| Note stability | `smoother.ts` | see §6 | single frames may pass all of the above and still be wrong |

If the YIN dip is between 0.15 and 0.5 we still estimate (global minimum) but
flag it as low-periodicity; if above 0.5 we return nothing.

## 6. Smoothing / stability (the display layer)

Raw YIN output jitters by a few cents per frame. `PitchSmoother` converts the
~30 Hz stream into a display pitch with three behaviors:

- **Tracking.** Estimates within **50¢** (half a semitone) of the current note
  are accepted with exponential smoothing in the **cents domain**
  (`responsiveness = 0.35`/frame ⇒ ~100 ms attack). Averaging in cents treats a
  ±5¢ wobble at 82 Hz and at 330 Hz identically — correct, because cents are
  the perceptual scale.
- **Spike rejection.** A frame farther than 50¢ away, or a silent frame, is
  held: the previous pitch keeps being emitted for up to **3 frames (~100 ms)**.
  One burst of noise therefore cannot yank the needle.
- **Note change.** If the disagreement persists ~100 ms, the smoother retunes:
  sustained silence → idle; sustained new pitch → adopt it. Switching from the
  A string to the low E (a ~500¢ jump) therefore re-locks in ~100 ms, while
  still ignoring one-frame glitches.

Combined with the ±5¢ “in tune” band, the needle stays steady on a well-tuned
string (verified in `smoother.test.ts` with ±8¢ jitter: output stays inside
±5¢).

## 7. Tuning logic & verdict bands

Deviation is the standard cents formula:

```
cents = 1200 · log₂(detectedHz / targetHz)      (+ = sharp, − = flat)
```

- **String identification** = nearest open-string pitch in cents (strings are
  ~500¢ = a fourth apart, so even a badly detuned string is unambiguous). The
  user may also click a string to lock it as the target (useful when a string
  is detuned so far it approaches its neighbour’s pitch).
- **In tune: ±5¢.** Rationale: ~0.3% of frequency — below the threshold most
  guitarists can reliably hear, and an accuracy real tuners deliver. Wider
  bands leave audible beats; narrower bands make the display dance on
  measurement jitter.
- **Clearly off: beyond ±15¢.** Between 5 and 15¢ the verdict is *nearly in
  tune* (amber): keep fine-tuning. Beyond 15¢ (⅓ semitone) it is *flat/sharp*
  (clearly wrong direction, decisive peg turn needed).
- The needle travel clamps at **±50¢** (still inside one semitone) so the
  gauge always shows a sensible deflection.

## 8. Cost model & where the CPU goes

Per tick the dominant cost is YIN step 2: roughly `N·τ_max ≈ 2.7M` fused
multiply–subtract–adds ≈ a few ms in V8. At ~30 ticks/s that is ~10–20% of one
core while a note is sounding (near zero while silent, because the RMS gate
short-circuits). If that ever matters on a slow laptop, the natural fixes are
the ones kept out of this version to avoid premature complexity:

1. Move the analysis to an `AudioWorklet` (off the main thread),
2. compute `d(τ)` from an FFT-based autocorrelation (O(N log N)), or
3. shorten the window adaptively for the higher strings.

## 9. Known limitations (honest ones)

- **Monophonic.** Any correlation-based f0 estimator assumes one note. Two
  strings together produce beating, unstable estimates; the smoother holds the
  last stable pitch and then goes idle rather than thrashing. A future chord
  module needs a different (polyphonic) front end, not this detector.
- **Even-only spectra are octave-ambiguous.** If a signal contained *only* even
  harmonics it would literally repeat at half the period, so the difference
  function has equally valid minima at f0 and 2·f0. Real plucked strings always
  contain odd partials, so YIN resolves to f0; playing an artificial tone or a
  strong harmonic can still read an octave up — same behavior as commercial
  clip-on tuners.
- **AGC is disabled** (requested raw audio) because automatic gain changes
  during the note decay corrupt pitch; the trade-off is that the signal meter
  depends on mic distance. Very quiet setups may need the mic closer.
- **Drift of `context.sampleRate`** is handled (bounds and the period are
  derived from the live sample rate), but devices that resample internally are
  out of our control.

## References

- de Cheveigné, A. & Kawahara, H. (2002). *YIN, a fundamental frequency
  estimator for speech and music.* J. Acoust. Soc. Am. 111, 1917.
- McLeod, P. & Wyvill, G. (2005). *A Smarter Way to Find Pitch.* ICMC — the
  MPM alternative considered above.
- Web Audio API — `AnalyserNode.getFloatTimeDomainData`,
  `AudioContext`/`getUserMedia` (MDN).
