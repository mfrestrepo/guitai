/**
 * YIN — a robust monophonic pitch detector.
 *
 * We chose YIN (de Cheveigné & Kawahara, "YIN, a fundamental frequency
 * estimator for speech and music", JASA 2002) over plain autocorrelation and
 * over the McLeod Pitch Method. The reasons are explained in detail in
 * `docs/pitch-detection.md`; in short:
 *
 *  - Guitar notes are harmonic-rich and the fundamental is frequently NOT the
 *    strongest partial. YIN's difference function is minimised at the true
 *    period regardless of the harmonic balance, which makes it naturally
 *    robust against octave errors and "strong 2nd harmonic" cases.
 *  - It needs no windowing, no FFT and only O(N·τ_max) time, which is easy to
 *    reason about and verify.
 *
 * This module is deliberately free of any DOM / audio-graph dependency: it
 * only turns a buffer of float samples into a frequency, so it is unit
 * testable with synthesized signals (see `yin.test.ts`).
 */

export interface YinOptions {
  /**
   * Lowest fundamental we care about (Hz). Guitar standard low E is 82.41 Hz,
   * but a badly detuned string can sit below that, so we default to 60 Hz.
   */
  minFrequency?: number;
  /** Highest fundamental we care about (Hz). Default 500 Hz covers E4 + slack. */
  maxFrequency?: number;
  /**
   * Absolute-threshold parameter τ of the YIN paper (default 0.15): the first
   * dip of the cumulative-mean-normalized difference function below this value
   * is taken as the period. Larger = more tolerant of noise, but risks
   * sub-octave errors; 0.15 works well for plucked strings.
   */
  threshold?: number;
}

export interface YinResult {
  /** Estimated fundamental frequency in Hz (after parabolic refinement). */
  readonly frequency: number;
  /**
   * Periodicity in [0, 1): the depth of the winning dip in the normalized
   * difference function. ~0 → very periodic (clear pitch); close to 1 →
   * noise-like. Used by the engine to reject unpitched frames.
   */
  readonly periodicity: number;
  /** Winning lag in samples, before parabolic refinement (diagnostics). */
  readonly tau: number;
}

/**
 * Largest normalized-difference minimum that we still call "pitched".
 * Pure white noise keeps its cumulative-mean difference near 1.0, while real
 * pitched frames dip far below 0.5. Frames above this return `null`.
 */
export const MAX_UNVOICED_DIFFERENCE = 0.5;

/**
 * Estimate the fundamental frequency of a monophonic frame.
 *
 * @param samples   Raw float PCM samples in [-1, 1]. A frame length of 4096
 *                  (~93 ms at 44.1 kHz) gives ≈7.7 periods of the low E,
 *                  comfortably above the ~3 periods YIN needs to be reliable.
 * @param sampleRate Samples per second of `samples`.
 * @returns A {@link YinResult} for pitched frames, or `null` when the frame
 *          looks unpitched (silence, DC-only, or noise).
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: YinOptions = {},
): YinResult | null {
  const {
    minFrequency = 60,
    maxFrequency = 500,
    threshold = 0.15,
  } = options;

  const n = samples.length;
  if (n < 4) return null;

  // 1) Remove the DC component and detect (near) silence.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;

  const x = new Float64Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i] - mean;
    x[i] = v;
    energy += v * v;
  }
  if (energy < 1e-12) return null; // digital silence / pure DC → no pitch

  // 2) Lag bounds derived from the frequency range of interest.
  const tauMin = Math.max(1, Math.floor(sampleRate / maxFrequency));
  const tauMax = Math.min(n - 2, Math.ceil(sampleRate / minFrequency));
  if (tauMax <= tauMin + 1) return null;

  // 3) Difference function d(τ) = Σⱼ (x[j] − x[j+τ])²   (YIN eq. 6)
  //    Each row compares the frame against itself shifted by τ samples; at the
  //    true period the shifted waveform aligns and the difference collapses.
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    const limit = n - tau;
    for (let j = 0; j < limit; j++) {
      const diff = x[j] - x[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 4) Cumulative-mean normalized difference d'(τ) (YIN eq. 8).
  //    Normalising removes the bias toward high τ and flattens the function
  //    for aperiodic (noise) input, which is what makes the 0.15 threshold a
  //    reliable "is this pitched?" test.
  const dPrime = new Float64Array(tauMax + 1);
  dPrime[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += d[tau];
    dPrime[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
  }

  // 5) Pick the period: the first *valley* that dips below the absolute
  //    threshold (YIN step 3). We must land on the local minimum of that dip,
  //    not merely on the first sample below the threshold — otherwise the raw
  //    lag sits partway down the slope and the frequency is biased.
  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    const isEnteringDip = dPrime[t] < threshold && (t === tauMin || dPrime[t] <= dPrime[t - 1]);
    if (!isEnteringDip) continue;
    // Walk to the bottom of the dip.
    let bottom = t;
    while (bottom < tauMax && dPrime[bottom + 1] <= dPrime[bottom]) bottom++;
    tau = bottom;
    break;
  }
  // ... or, when nothing dips that far (e.g. faint signal), the global minimum.
  if (tau === -1) {
    let bestTau = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) {
      if (dPrime[t] < dPrime[bestTau]) bestTau = t;
    }
    tau = bestTau;
  }

  const periodicity = Math.min(1, Math.max(0, dPrime[tau]));
  if (periodicity > MAX_UNVOICED_DIFFERENCE) return null;

  // 6) Parabolic interpolation around the dip for sub-sample accuracy
  //    (YIN eq. 9). Without it, low notes (long periods) quantize to several
  //    cents of error — unacceptable for tuning.
  let refinedTau = tau;
  if (tau > tauMin && tau < tauMax) {
    const y0 = dPrime[tau - 1];
    const y1 = dPrime[tau];
    const y2 = dPrime[tau + 1];
    const denominator = y0 - 2 * y1 + y2;
    if (Math.abs(denominator) > 1e-12) {
      const delta = (0.5 * (y0 - y2)) / denominator;
      if (Number.isFinite(delta) && Math.abs(delta) < 1) {
        refinedTau = tau + delta;
      }
    }
  }

  if (refinedTau <= 0) return null;
  const frequency = sampleRate / refinedTau;
  if (!Number.isFinite(frequency) || frequency <= 0) return null;

  return { frequency, periodicity, tau };
}
