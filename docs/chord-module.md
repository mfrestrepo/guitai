# GuitAI — Chord learning module: design & validation rationale

This document explains *why* the chord module works the way it does, for the
person who will keep developing GuitAI. Code lives in `src/chords/` (logic) and
`src/ui/chordView.ts` / `chordDiagram.ts` (presentation). The UI copy is
Spanish and is generated in `src/chords/copy.ts`.

## 1. Pedagogical model

Chords are not taught in alphabetical order. The curriculum
(`src/chords/curriculum.ts`) follows how beginner hand mechanics develop:

| Level | Content | Why |
| --- | --- | --- |
| 1 | **Em → E → Am → A → D** | Em is the easiest shape; **E** = Em + one finger; **Am** reuses Em's shape shifted to string 5; **A** = Am's row + one finger; **D** introduces a different shape but is forgiving. |
| 2 | **C → G** | The two open chords that stretch the hand most; best attempted once the basics feel natural. |
| 3 | **A–D–E, G–C–D, Em–C–G–D** | No new chords — practicing *changes* between real progressions, which is what playing songs requires. |

Progress (which chords were played cleanly to the end) is stored in
`localStorage` (`src/chords/progress.ts`) and shown as ✓ badges. A chord counts
as "dominado" when the learner finishes **without skipping any string** — wrong
attempts that get corrected do not block progress, because correcting mistakes
*is* the learning.

## 2. Why per-string (arpeggio) validation — and not strum detection

The original request was "validate that the person is playing the chord right".
The honest engineering answer is that **validating a 6-note strum from a single
microphone is a hard multi-pitch estimation problem**:

- correlation-based pitch detectors (including YIN) are monophonic by design;
- on a strum, the strings ring together and their harmonics overlap (the 3rd
  harmonic of the low E falls almost exactly on open B), so attributing each
  spectral peak to a specific string is ambiguous;
- commercial apps solve this either with per-string pickups or with heavy
  spectral models that are still error-prone for beginners whose strings are
  slightly muted / out of tune.

Instead, this module validates **the way beginners actually practice**: place
the chord, then play the strings one at a time (low → high). Each pluck is a
single note, so the tuner-grade YIN detector (already ±cents accurate) decides:

- **ok** — within ±45¢ of the expected note (a slightly detuned guitar still
  passes; a wrong note is ≥1 semitone = 100¢ away, so it clearly fails);
- **almost** — ±45…80¢: very close, almost certainly the *guitar* is a bit out
  of tune;
- **wrong** — the copy helper detects when the heard note actually belongs to
  *another string of the same chord* and says so ("parece que tocaste la 4ª
  cuerda").

This gives beginners corrective feedback that is both precise and actionable,
at the cost of a slightly slower ritual than a strum — a fine trade-off for a
learning tool.

### 2.b — The sustained-strum check (rasgueo mode, added later)

Because a strum is what players actually *do*, the module now also offers a
**Rasgueo** mode built on a real FFT analysis of the sustained chord
(`src/chords/spectral.ts` + `strumCheck.ts`, session in `strumSession.ts`).
It checks, per frame (~370 ms window, updated ~10×/s):

1. **presence** — band energy at every sounding string's expected fundamental
   (±55¢). A missing band ⇒ a muted string ("La 3ª no suena — quizá la tapa un
   dedo"). To protect naturally quieter high strings, a string counts as
   present when its band *mean* or its band *peak* clears the reference.
2. **muting** — energy where "x" strings should be silent. Reliable for the low
   strings of these open chords (nothing lower rings to alias onto them).
3. **foreign notes** — strong spectral peaks in 82–400 Hz that are neither a
   string band nor a chord tone ⇒ wrong fret / bad tuning. The 400 Hz cap is
   safe for these chords: harmonics of *correctly* ringing strings stay inside
   the chord's pitch classes up to ~400 Hz (verified empirically), so an
   out-of-chord peak down there is genuinely wrong.

Readability: raw frames flicker, so results pass through a verdict gate (`chords/strumGate.ts`) that only publishes a verdict after ~1–2 s of consistent sound and holds it on screen a few seconds — the UI never flips faster than a human can read. The microphone session is `strumSession.ts`.

Honest limits (validated in `strumCheck.test.ts`): the low open E's own 2nd
harmonic sits *exactly* on E3, so in E-family chords a mis-fretted E3 string is
masked — the app then reports the foreign note (F) instead of "string 4 is
wrong". Similar octave-alias pairs (e.g. E2's 3rd harmonic ≈ open B3) can make
a missing B3 look present. The strum check therefore answers *"does it sound
like the chord?"* with reliable, actionable hints — while exact per-string
attribution remains the per-string mode's job.

## 3. Note events instead of a pitch meter

The microphone produces ~30 pitch readings per second of the *same ringing
string*. Validation needs **events** ("the learner plucked a string now"):

- `src/chords/events.ts` — state machine that confirms an onset only after a
  few consistent voiced frames (rejects pick noise), then ignores the ringing
  until the string is silenced **or** a clearly different pitch is sustained
  (the learner plucked the next string without fully muting).
- `src/chords/micSession.ts` — owns the mic loop and feeds analyzed frames
  into the event detector; per-chord state lives in the pure class
  `src/chords/practice.ts`, which is tested without any audio.

The UI also offers a manual fallback ("Ya la toqué → comprobar") for cases
where the onset logic is too strict for a particular playing style.

## 4. One source of truth: chord data

`src/chords/catalog.ts` stores each chord **only** as frets + fingers:

```ts
{ id: 'em', displayName: 'Em', spanishName: 'Mi menor', kind: 'minor',
  rootPitchClass: 4,
  strings: [
    { number: 6, fret: 0 },            // open
    { number: 5, fret: 2, finger: 2 }, // fretted, finger 2
    { number: 4, fret: 2, finger: 3 },
    …,
  ] }
```

From that one declaration the app derives:

- the **SVG diagram** (`ui/chordDiagram.ts`), the **"cómo se hace"** steps and
  the corrective wording (`chords/copy.ts`),
- the **expected note** of every string (open-string MIDI + fret),
- the **per-string validation** targets (`chords/evaluate.ts`),
- which strings are muted ("x") and therefore never requested.

A load-time invariant (`assertValidChordShape`) verifies that the sounded pitch
classes actually spell the chord (root included) — a typo in the table fails
fast, exactly like the tuner's note-name check.

**Adding a chord** (say F major barre) is then just another entry in
`catalog.ts` plus an optional level/drill reference in `curriculum.ts`.

## 5. Roadmap of this module (ideas, in order of value)

1. **F / barre chords level** — the data model already supports frets anywhere
   on the neck; the diagram generator already draws frets from a base row when
   needed.
2. **Strum-driven change drills** — auto-advance in Level-3 drills on a clean
   strum, plus a "changes per minute" timer.
3. **Song mode**: drive drills from real song progressions.
4. Tune the strum thresholds against a real guitar + real mic (constants in
   `chords/strumCheck.ts`); consider per-octave loudness normalization to make
   presence checks less sensitive to which string the mic picks up best.

## 6. Visual design notes (the didactic UI)

The chord screens follow a "show, don't tell" principle: the fretboard diagram
is the hero everywhere, and words are reduced to short chips.

- **Home** is a *learning path*: numbered level blocks, chord cards that draw
  their own mini diagram, a circular progress ring, and drills shown as chord
  chains (A → D → E).
- **Lesson** shows one large diagram, fact chips (tipo, cuerdas, traste
  máximo), and hides "cómo se hace" and tips behind collapsible toggles.
- **Validation is visual**: during *cuerda a cuerda* the diagram lights the
  string being asked (and turns strings green/red as they pass/fail); the only
  prompt is a tiny label like "5ª → B2". During *rasgueo*, verdicts are short
  ("✓ Em", "Casi Em") with per-issue chips and string lights.
- Note labels in diagrams/lights use international letters (E2), never solfeo.
  Diagram colors come from CSS variables (see `ui/chordDiagram.ts` highlight),
  which is also what lets tests assert state classes.
