# 🎸 GuitAI

[![CI](https://github.com/mfrestrepo/guitai/actions/workflows/ci.yml/badge.svg)](https://github.com/mfrestrepo/guitai/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tests](https://img.shields.io/badge/tests-130%20passing-34D399)](#testing)
[![Web Audio](https://img.shields.io/badge/built%20on-Web%20Audio%20API-F472B6)](#architecture)

**GuitAI — AI-assisted guitar practice companion.** (interfaz en español)

Two modules live in this repository (switch with the tabs at the top):

1. **Afinador** — a real-time chromatic tuner (module 1).
2. **Aprende acordes** — a progressive beginner course (module 2): each chord
   shows *cómo se hace* (diagram, fingers, tips in Spanish) and the app
   **validates live** whether you play it correctly, string by string.

✨ **Highlights**

- **YIN pitch detection** — robust to strong harmonics and weak fundamentals
  (the normal case for a guitar), with parabolic sub-sample accuracy.
- **Real-time & stable** — ~30 Hz analysis, ~93 ms window, spike rejection and
  cents-domain smoothing: the needle tracks fast but never dances.
- **Chord lessons for beginners, data-driven** — every chord is declared once
  (frets + fingers); diagrams, "cómo se hace" text, expected notes and
  per-string validation are all derived from that data.
- **Live per-string validation** — the app asks you for each string in order,
  listens, and tells you exactly what to fix (wrong string, muted note, chord
  tone that belongs elsewhere) using the same cents-accurate detector as the
  tuner.
- **Progressive curriculum** — Em → E → Am → A → D → C → G in three levels,
  then real change drills (A–D–E, G–C–D, Em–C–G–D), with progress saved locally.
- **Clean, extensible TypeScript** — mic, detection, smoothing, music theory,
  chord data and UI are separated; future GuitAI features reuse the same blocks.

Roadmap (not implemented yet):

- Real-time tuning ✅ *(module 1)*
- Beginner chord course with validation ✅ *(module 2)*
- Chord recognition of arbitrary strummed chords (polyphonic), barre chords (F…)
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

The UI is in **Spanish**. Switch modules with the tabs at the top
(**🎛️ Afinador** / **🎸 Aprende acordes**).

> Microphone access requires a *secure context*. `localhost` / `127.0.0.1`
> count as secure, but accessing the app from another device over a LAN IP
> (plain `http://`) will make the browser refuse the mic.

---

## Module 2 — Aprende acordes (beginners)

A progressive course for absolute beginners:

- **Nivel 1 · Primeros acordes**: Em → E → Am → A → D (shapes that share
  fingerings).
- **Nivel 2 · C y G**: the two "hard" open chords.
- **Nivel 3 · Cambios**: real change drills — A–D–E, G–C–D, Em–C–G–D.

Every chord opens a **lesson card**: an SVG diagram of the frets/fingers, a
step-by-step *cómo se hace* and tips in Spanish, the notes that should sound,
and a big **Empezar a tocar** button.

Validation is **per string** (arpeggio): the app asks for each string in order,
listens with the same YIN detector as the tuner, and tells you exactly what to
fix — e.g. *"Suena Mi (E3), pero la 5ª cuerda debe sonar Si (B2). Parece que
tocaste la 4ª cuerda."* Muted strings ("x") are never requested. Chord progress
is saved locally (✓ badges on the chord chips).

Design rationale, limits and how to add chords: see
[`docs/chord-module.md`](docs/chord-module.md).

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
                    ┌───────────────────────────────────────────────┐
                    │ audio/input.ts  (mic + AnalyserNode)         │
                    └───────────────────────┬───────────────────────┘
                                            │ newest frame (Float32Array)
                                            ▼
                    audio/frameAnalysis.ts  (RMS gate + YIN)  ◀── shared
                                            │ pitch + rms + level
           ┌────────────────────────────────┴───────────────────────────────┐
           ▼                                                                ▼
   TUNER pipeline                                                  CHORDS pipeline
   pitch/smoother.ts   (stability)                      chords/events.ts     (note onsets)
   tuner/evaluator.ts  (cents/verdict)                  chords/practice.ts   (validation machine)
   tuner/engine.ts  ──▶ Reading                         chords/micSession.ts ──▶ snapshot
           │                                                                │
           ▼                                                                ▼
   ui/view.ts  (Afinador)                             ui/chordView.ts (Aprende acordes)
                                                      ui/chordDiagram.ts (SVG)

   Data (one source of truth, no logic):
     theory/music.ts · theory/tunings.ts              chords/catalog.ts · chords/curriculum.ts
                                                      chords/copy.ts (Spanish wording) · chords/progress.ts
```

### Why these boundaries

- **`audio/input.ts`** — the *only* module that touches `getUserMedia` and the
  Web Audio graph. Swappable (later: file input, Bluetooth mic) without
  touching pitch code.
- **`audio/frameAnalysis.ts`** — the *single* shared "is this frame silent /
  voiced / pitched?" analyzer (RMS gate + YIN). Both the tuner and the chord
  session consume it, so thresholds are identical everywhere.
- **`pitch/yin.ts`** — pure pitch estimator. Tested against synthesized
  guitar-like signals, including harmonic traps.
- **`pitch/smoother.ts`** — turns raw per-frame estimates into a stable pitch
  (spike rejection, note-change tracking, silence handling).
- **`theory/`** — **reusable by every future GuitAI feature**: music math
  (cents/MIDI/note names) and **data-driven tunings**. Frequencies are never
  hard-coded in the UI or engine.
- **`tuner/evaluator.ts`** — pure mapping “pitch → string + cents + verdict”.
- **`tuner/engine.ts`** — the tuner pipeline: cadence (≈30 Hz), smoothing,
  evaluation; emits a `Reading` for the view.
- **`chords/catalog.ts`** — chord library declared as data (frets + fingers),
  with a load-time sanity check that each shape really spells its chord.
  **`chords/curriculum.ts`** — levels and change drills.
- **`chords/events.ts`** — turns the pitch stream into discrete "a note
  started" events (the pluck detection state machine).
- **`chords/practice.ts`** — pure per-string validation state machine
  (mic-free, fully tested).
- **`chords/micSession.ts`** — mic loop for chord practice (the only
  microphone-touching code in the module).
- **`chords/copy.ts`** — every Spanish sentence is generated here from chord
  data; the UI never hard-codes wording.
- **`ui/*`** — the only DOM-touching code (`view.ts`, `chordView.ts`,
  `chordDiagram.ts`). Replaceable by any UI without touching logic.

### Adding another chord (e.g. F or another shape)

Edit `src/chords/catalog.ts` and append an entry — diagram, instructions,
expected notes and validation all derive from the data. The load-time invariant
checker will tell you if the fingering doesn't spell the chord you named.

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

Core logic is kept free of the microphone and DOM so it is testable directly.
**130 tests in 17 files** — `npm test`:

| Area | Covers |
| --------------------------- | ------------------------------------------------------------- |
| `theory/`                   | MIDI ↔ Hz, note names, cents math, tuning data & identification |
| `pitch/yin.test.ts`         | Detector accuracy, harmonic/octave traps, noise/silence       |
| `pitch/smoother.test.ts`    | Jitter averaging, spike rejection, note-change, silence       |
| `pitch/pipeline.test.ts`    | **Synthesized guitar audio** → detect → smooth → evaluate     |
| `tuner/evaluator.test.ts`   | ±5¢ in-tune band, ±15¢ nearly-band, verdict boundaries, lock  |
| `chords/catalog.test.ts`    | Shapes spell the right chord; expected notes per string       |
| `chords/curriculum.test.ts` | Levels/drills reference existing chords, teaching order       |
| `chords/evaluate.test.ts`   | Per-string ok/almost/wrong bands, muted-string guard          |
| `chords/events.test.ts`     | Note-onset state machine (blips, ringing, retrigger)          |
| `chords/practice.test.ts`   | Per-string validation flow: advance, wrong, skip, master      |
| `chords/syntheticSession.test.ts` | **Synthesized audio** through analyzer → events → practice |
| `chords/copy.test.ts`       | Spanish wording built from data (diagram/how-to/feedback)     |
| `chords/progress.test.ts`   | localStorage progress + corrupt-data recovery                 |
| `ui/chordDiagram.test.ts`   | SVG diagram content (dots, rings, crosses, fingers)           |
| `ui/view.test.ts`           | Real `index.html` (jsdom): tuner verdicts, needle, meter      |
| `ui/chordView.test.ts`      | Real `index.html` (jsdom): levels, lesson, drills, mic error  |

> The "does the audio actually work?" question is answered without a
> microphone: `pitch/pipeline.test.ts` and `chords/syntheticSession.test.ts`
> synthesize plucked-string-like audio (harmonics + noise + decay) and feed it
> through the same analyzers the engines use.

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

1. Try both modules with a real guitar + real mic; tune the silence gate and
   the smoothing responsiveness to your setup (constants are centralized in
   `audio/frameAnalysis.ts`, `pitch/smoother.ts`).
2. Expand the chord course: barre chords (F…), more levels and drills — each
   chord/drill is data in `chords/catalog.ts` / `chords/curriculum.ts`.
3. Sustained-strum validation (polyphonic spectral check) as a complement to
   the per-string mode — see `docs/chord-module.md` for the honest trade-offs.
4. Alternative tunings (Drop D is one line in `theory/tunings.ts`) and
   per-tab progress.
5. Extract the audio analysis into an `AudioWorklet` if CPU matters on slower
   laptops (currently analysis runs on the main thread at ≈30 Hz on a
   4096-sample window).
6. Wire a real device test: an end-to-end browser test needs a headless
   browser with microphone emulation (Playwright + Chromium flags).

## Known limitations

- **Monophonic analysis by design.** One note at a time. That is exactly what a
  tuner needs and what the chord *arpeggio* mode asks for; strummed chords
  (several notes at once) are not recognized yet — see
  [`docs/chord-module.md`](docs/chord-module.md).
- **Octave ambiguity on even-only spectra** is inherent to correlation-based
  methods (a signal with only even harmonics is literally periodic at half the
  period). Open guitar strings always contain odd harmonics, so in practice
  this is rare; see the pitch docs.
- Browser audio processing is requested raw (AGC/echo-cancellation disabled)
  for pitch fidelity — levels are therefore sensitive to mic distance, hence
  the signal meters.
