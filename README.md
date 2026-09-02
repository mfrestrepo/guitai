# 🎸 GuitAI

[![CI](https://github.com/mfrestrepo/guitai/actions/workflows/ci.yml/badge.svg)](https://github.com/mfrestrepo/guitai/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tests](https://img.shields.io/badge/tests-66%20passing-34D399)](#testing)
[![Web Audio](https://img.shields.io/badge/built%20on-Web%20Audio%20API-F472B6)](#architecture)

**GuitAI — AI-assisted guitar practice companion.**

Module 1 (this repo): a **real-time chromatic tuner** that runs in your browser,
listens through the microphone and tells you — in cents — how far each string is
from pitch, with a big, calm needle gauge instead of a wall of numbers.

✨ **Highlights**

- **YIN pitch detection** — robust to strong harmonics and weak fundamentals
  (the normal case for a guitar), with parabolic sub-sample accuracy.
- **Real-time & stable** — ~30 Hz analysis, ~93 ms window, spike rejection and
  cents-domain smoothing: the needle tracks fast but never dances.
- **Cents-accurate tuning logic** — ±5¢ "in tune" band, data-driven tunings
  (adding Drop D is one entry in a table).
- **Clean, extensible TypeScript** — mic, detection, smoothing, music theory and
  UI are separated so future GuitAI modules (chords, rhythm, exercises…) reuse
  the same building blocks.
- **Tested without a microphone** — 66 tests including synthesized guitar audio
  run through the full detection pipeline, plus a jsdom test of the real UI.

Planned / future modules (not implemented yet):

- Real-time tuning ✅ *(this module)*
- Chord recognition / chord & note identification from audio
- Rhythm & timing feedback, practice exercises, progress tracking
- Personalized practice recommendations, song practice assistance
- AI-based feedback on playing technique

The architecture keeps every module behind a clean boundary so future features
reuse the same audio input, pitch detection, and music-theory building blocks
(see [Architecture](#architecture)).

---

## Module 1 — Real-time tuner

A browser app that listens through your computer's microphone and shows, for
the note you play on a standard-tuned guitar:

- which string you are playing and the target pitch (E2 A2 D3 G3 B3 E4)
- the detected frequency and the deviation **in cents**
- a large needle gauge with a clear **flat / nearly in tune / in tune /
  nearly sharp / sharp** verdict
- a signal meter, plus the option to lock a string manually by clicking it

### Run it

```bash
npm install
npm run dev        # → open http://localhost:5173 (or the printed URL)
```

Click **Start microphone**, allow access, and pluck one string at a time.

> Microphone access requires a *secure context*. `localhost` / `127.0.0.1`
> count as secure, but accessing the app from another device over a LAN IP
> (plain `http://`) will make the browser refuse the mic.

### Scripts

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Vite dev server with hot reload                           |
| `npm run test`       | Run the unit/DOM test suite once (Vitest)                 |
| `npm run test:watch` | Run tests in watch mode                                   |
| `npm run typecheck`  | `tsc -b` — strict TypeScript check                        |
| `npm run build`      | Typecheck + production build into `dist/`                 |
| `npm run preview`    | Serve the production build locally                        |

---

## Architecture

**Stack decision.** Plain **TypeScript + Vite** (vanilla DOM UI), no framework.
The tuner is a single-page instrument: a framework would add indirection
without value, and the signal-processing core is pure functions/classes that
only need `Float32Array`. Vite gives fast dev/HMR, a real build and a test
runner (Vitest) with minimal ceremony. Type safety is `strict` everywhere.

**Layering.** Each box below is one folder; arrows show data flow. Everything
left of the engine is DOM-free and microphone-free, which is why it is fully
unit-testable (including with synthesized audio).

```
┌────────────┐   frames    ┌───────────────┐  f0  ┌───────────────┐   ┌───────────────┐
│ audio/     │ ──────────▶ │ pitch/yin.ts  │ ───▶ │ pitch/        │ ─▶│ tuner/        │
│ input.ts   │  (Float32)  │ YIN detector  │      │ smoother.ts   │   │ evaluator.ts  │
│ mic + node │             └───────────────┘      │ stability     │   │ cents/verdict │
└────────────┘                                    └───────────────┘   └──────┬────────┘
                                              tunings data                    │ Reading
                                        ┌──────────────┐  matched string     ▼
                                        │ theory/      │ ◀────────────── ┌─────────────┐
                                        │ tunings.ts   │                 │ tuner/      │
                                        │ (EADGBE…)    │                 │ engine.ts   │
                                        └──────────────┘                 │ pipeline    │
                                        ┌──────────────┐                 └──────┬──────┘
                                        │ theory/      │  music math             │
                                        │ music.ts     │  (cents, midi)          ▼
                                        └──────────────┘                 ┌─────────────┐
                                                                        │ ui/view.ts  │
                                                                        │ + style.css │
                                                                        └─────────────┘
```

### Why these boundaries

- **`audio/input.ts`** — the *only* module that touches `getUserMedia` and the
  Web Audio graph. Swappable (later: file input, Bluetooth mic) without
  touching pitch code.
- **`pitch/yin.ts`** — pure pitch estimator. Tested against synthesized
  guitar-like signals, including harmonic traps.
- **`pitch/smoother.ts`** — turns raw per-frame estimates into a stable pitch
  (spike rejection, note-change tracking, silence handling).
- **`theory/`** — **reusable by every future GuitAI feature**: music math
  (cents/MIDI/note names) and **data-driven tunings**. Frequencies are never
  hard-coded in the UI or engine.
- **`tuner/evaluator.ts`** — pure mapping “pitch → string + cents + verdict”.
- **`tuner/engine.ts`** — the only place that knows the cadence (≈30 Hz) and
  the silence/periodicity gates; coordinates everything and emits a `Reading`.
- **`ui/view.ts`** — the only module that touches the DOM; renders a `Reading`.
  Could be replaced by any UI (or a headless consumer) unchanged.

### Adding another tuning (e.g. Drop D, Open G)

Edit **only** `src/theory/tunings.ts` — the engine, evaluator, tests and the
picker pick it up automatically:

```ts
{
  id: 'drop-d',
  name: 'Drop D',
  strings: [
    { number: 6, name: 'D2', midi: 38 }, // only the low E changes
    { number: 5, name: 'A2', midi: 45 },
    { number: 4, name: 'D3', midi: 50 },
    { number: 3, name: 'G3', midi: 55 },
    { number: 2, name: 'B3', midi: 59 },
    { number: 1, name: 'E4', midi: 64 },
  ],
},
```

---

## Testing

Core logic is kept free of the microphone and DOM so it is testable directly:

| File                        | Covers                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `src/theory/music.test.ts`  | MIDI ↔ Hz, note names, cents math incl. the −20.6¢ example    |
| `src/theory/tunings.test.ts`| Standard tuning data, string identification, boundaries       |
| `src/tuner/evaluator.test.ts`| ±5¢ in-tune band, ±15¢ nearly-band, verdict boundaries, lock |
| `src/pitch/yin.test.ts`     | Detector accuracy, harmonic/octave traps, noise/silence       |
| `src/pitch/smoother.test.ts`| Jitter averaging, spike rejection, note-change, silence       |
| `src/pitch/pipeline.test.ts`| **Synthesized guitar audio** → detect → smooth → evaluate     |
| `src/ui/view.test.ts`       | Renders real `index.html` (jsdom): verdicts, needle, meter    |

> The “does the pitch chain actually work?” question is answered in
> `pipeline.test.ts` without a microphone: it synthesizes plucked-string-like
> audio (harmonic series with a dominant 2nd harmonic + noise + decay) and
> feeds it through the same detector/smoother/evaluator the engine uses.

Run everything with `npm test` (66 tests).

---

## How the pitch detection works (summary)

Full rationale and math: [`docs/pitch-detection.md`](docs/pitch-detection.md).

The detector is **YIN** (de Cheveigné & Kawahara, *JASA* 2002): it searches for
the lag where the waveform correlates with itself shifted by one period, which
is robust to the fundamental being weaker than its harmonics — the normal case
for a guitar. Results are smoothed in the cents domain (exponential tracking
with spike rejection and explicit note-change detection) and compared to the
target in cents:

```
cents = 1200 · log₂(detectedHz / targetHz)
```

| verdict        | cents range     |
| -------------- | --------------- |
| in tune        | −5 … +5         |
| nearly in tune | ±5 … ±15        |
| flat / sharp   | beyond ±15      |

---

## Roadmap (suggested next steps)

1. Try it with a real guitar + real mic; tune the silence gate and the
   smoothing responsiveness to your setup (constants are centralized).
2. Add alternative tunings (Drop D is one line of data).
3. Module 2 candidates: chord recognition (reuse `pitch/yin.ts` + `theory/`),
   or a practice timer (reuse `audio/input.ts` for level metering).
4. Extract the audio analysis into an `AudioWorklet` if CPU use matters on
   slower laptops (currently YIN runs on the main thread at ≈30 Hz on a
   4096-sample window; see the docs for the cost model).
5. Wire a real device test: an end-to-end browser test needs a headless
   browser with microphone emulation (Playwright + Chromium flags).

## Known limitations

- **Monophonic by design**: pitch estimation assumes one note at a time, as a
  tuner should. Chords produce unstable estimates, which the smoother rejects.
- **Octave ambiguity on even-only spectra** is inherent to correlation-based
  methods (a signal with only even harmonics is literally periodic at half the
  period). Open guitar strings always contain odd harmonics, so in practice
  this is rare; see the docs.
- Browser audio processing is requested raw (AGC/echo-cancellation disabled)
  for pitch fidelity — levels are therefore sensitive to mic distance, hence
  the signal meter.
