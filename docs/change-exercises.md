# GuitAI — Chord-change exercises (module 3)

This document explains what the change drills are, where they come from, how
they are implemented, and how to extend them.

## 1. What the research says (and what we implemented)

The exercises are not invented: they follow the drills that beginner-guitar
pedagogy recommends most often.

| Drill | Source / rationale | In GuitAI |
| --- | --- | --- |
| **One-minute changes** — switch between two chords for 60 s, strumming once per change, and count *clean* changes. Reported anchors: **< 30 = building**, **30–50 = functional**, **50–70 = solid**, **70+ = fast**. | [Guitar Wiz — How to switch chords faster](https://guitarwiz.app/articles/switching-chords-faster/); Justinguitar's *One Minute Changes* exercise | `kind: 'one-minute'` exercises with `durationSeconds: 60` and `targetChanges` |
| **Pivot / anchor finger** — keep a finger that both chords share planted, so only the other fingers travel (e.g. Am↔C keeps the index on the 2nd string, 1st fret). | Same source | `kind: 'pivot'` + `sharedFingers()` computes the anchor **from the chord data** and the UI prints the exact tip |
| **Air changes** — form the shape *off* the strings, lift ~1 cm, land it as a block. Trains fingers to move together instead of one at a time. | Same source; Justinguitar's *Air Changes* | `kind: 'air-changes'` (marked `silent: true`, so microphone validation is disabled) |
| **Four-chord loops with a metronome** — e.g. G→C→D→Em at 50 BPM, 4 beats per chord; only raise the tempo (+5 BPM) when it is effortless. | Same source | `kind: 'loop'` with `startBpm` → `targetBpm` |
| **Random changes** — draw chords at random so you don't just memorise one move. | Same source | `kind: 'random'` with a chord pool and a seedable RNG |
| **Common mistakes to avoid**: don't stop the strumming hand (a mute beats a rhythm break); if the changes are sloppy at 100 BPM, drop to 60; practise the *weakest* pair. | Same source | The runner's tips per exercise + the metronome defaults (slow start) |

Difficulty grouping in the UI:

- **Muy fáciles** — shapes that share fingers (Em↔Am, Em↔E, Am↔C, E↔Am, A↔Am…).
- **Fáciles** — short moves between known shapes (Em↔G, D↔A, Am↔D) + a first 1-minute drill.
- **Medios** — the "famous" hard ones (G↔D, C↔G) and 4-chord loops.
- **Difíciles** — fast loops (Em→C→G→D at up to 100 BPM), changes **every 2 beats**, G↔D against the clock and random changes.

> Barre chords (F…) are not in the catalog yet: they will get their own level
> once the barre module exists.

## 2. Implementation map

| Concern | Module |
| --- | --- |
| Exercise catalog (levels, chords, BPM, targets, tips) | `src/chords/exercises.ts` |
| Anchor-finger detection | `sharedFingers()` / `anchorFingerTip()` in the same file |
| Optional metronome (look-ahead scheduler, synthesized click, accent) | `src/audio/metronome.ts` |
| Drill state machine (sequence, beats, counters, countdown, best score) | `src/chords/exerciseSession.ts` |
| Best-score persistence (localStorage) | `src/chords/exerciseProgress.ts` |
| Screen: list + runner | `src/ui/changesView.ts` |

The catalog validates itself at load time (unknown chords, bad
`beatsPerChord`, target BPM below start BPM, random pools with fewer than two
chords, empty tips → the module throws), so a typo cannot ship silently.

## 3. The runner

**Optional metronome.** Off by default, toggled with ⏱; tempo selectable from
40 to 140 BPM in steps of 5, remembered per exercise and globally. The tempo
logic uses the standard Web Audio *look-ahead* scheduler (a 25 ms timer
schedules the clicks ~120 ms ahead on the audio clock), so the beat stays steady
even while the main thread runs pitch analysis. The first beat of the bar is
higher and louder; the UI shows dot indicators that pulse with each click,
green on the accent. The metronome has its own `AudioContext`, so it works with
no microphone at all.

**How the chords change.** The learner chooses *"la app cambia cada N tiempos"*
(1, 2 or 4). Every N metronome beats the expected chord advances; in `loop`
drills it cycles through the progression and in `random` drills it draws from
the pool without repeating the current chord.

**Counters and records.** `cambios` counts completed changes; `limpios` counts
the changes whose chord the microphone confirmed; `récord` is the best score
ever for that exercise (stored locally). Timed drills show a countdown and a
summary at the end, with a fanfare when the target is reached.

**Optional microphone validation (🎤).** When enabled (and the drill is not
silent), the runner opens the same strum session used in the chords module for
the chord currently expected and switches it on every change. A change counts
as *clean* only when the spectral check says the chord really sounds right, and
the chord diagram lights up live — **green strings sound, red strings are the
problem** — so the learner sees exactly what to fix while practising changes.

## 4. Adding exercises

Add an entry to `CHORD_EXERCISES` in `src/chords/exercises.ts`:

```ts
{
  id: 'loop-c-am-em-g',
  title: 'Bucle: C → Am → Em → G',
  level: 'medio',
  kind: 'loop',
  descriptionEs: 'Progresión pop clásica.',
  chordIds: ['c', 'am', 'em', 'g'],
  beatsPerChord: 4,
  startBpm: 50,
  targetBpm: 85,
  tipsEs: ['Sube +5 BPM solo cuando salga limpio.'],
}
```

The list, runner, metronome and best-score tracking pick it up automatically;
`anchorFingerTip()` may add an automatic anchor hint if two of the chords share
a finger placement.

## 5. Next steps for this module

1. **Barre-chord level** (F, Bm…) once those shapes exist in the catalog.
2. **Per-exercise history**: a small chart of changes-per-minute over sessions.
3. **Strumming patterns**: exercises that combine changes with a rhythm pattern
   (down/up strums) instead of one strum per change.
4. **Auto-advance in level 3 of the chord course** using this same runner.
