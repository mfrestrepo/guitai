/**
 * Chord catalog — data-driven chord shapes for the learning module.
 *
 * Design goals:
 *  - A chord is described ONLY by its fingering on a standard-tuned guitar
 *    (which fret each string is pressed on, and which finger to use). Every
 *    note, name and diagram derives from that data — nothing is duplicated in
 *    the UI or the validation logic.
 *  - Shapes are plain data, so adding a chord (or a barre shape like F) never
 *    requires touching detection/UI code.
 *  - A load-time invariant check validates each shape: sounding strings must
 *    actually spell the chord (correct pitch classes incl. the root). This
 *    catches typos in the table, like the tuner does for note names.
 */

import { tuningById, type TuningStringDef } from '../theory/tunings';
import { midiToNoteName } from '../theory/music';

export type Finger = 1 | 2 | 3 | 4;
export type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface ChordString {
  /** Physical string: 1 = thinnest (high e) … 6 = thickest (low E). */
  readonly number: StringNumber;
  /** Fret to press: 0 = open (play it), `null` = muted ("x", don't play it). */
  readonly fret: number | null;
  /** Finger to use (1 = index … 4 = pinky); undefined for open strings. */
  readonly finger?: Finger;
}

export interface ChordDef {
  /** Stable id, e.g. "em". */
  readonly id: string;
  /** Short display name, e.g. "Em". */
  readonly displayName: string;
  /** Spanish full name, e.g. "Mi menor". */
  readonly spanishName: string;
  readonly kind: 'major' | 'minor';
  /** Root pitch class (0 = C … 11 = B), used by the invariant checker. */
  readonly rootPitchClass: number;
  /** All six strings, ordered low → high (6 … 1). */
  readonly strings: readonly ChordString[];
  /** Curated plain-language tips for beginners (Spanish). */
  readonly tipsEs?: readonly string[];
}

export interface ChordCatalog {
  readonly byId: ReadonlyMap<string, ChordDef>;
  readonly ids: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Helpers over a chord shape                                          */
/* ------------------------------------------------------------------ */

/** Open-string MIDI notes of a standard-tuned guitar, keyed by string number. */
const OPEN_MIDI_BY_STRING: Readonly<Record<StringNumber, number>> = (() => {
  const standard = tuningById('standard');
  if (!standard) throw new Error('chord catalog requires the standard tuning');
  const map = {} as Record<StringNumber, number>;
  for (const s of standard.strings as readonly (TuningStringDef & { number: StringNumber })[]) {
    map[s.number] = s.midi;
  }
  return map;
})();

/** Strings that should sound (open or fretted) — excludes muted ("x") ones. */
export function soundingStrings(chord: ChordDef): readonly ChordString[] {
  return chord.strings.filter((s) => s.fret !== null);
}

/** Strings that must stay silent ("x" in the chart). */
export function mutedStrings(chord: ChordDef): readonly ChordString[] {
  return chord.strings.filter((s) => s.fret === null);
}

/** MIDI note the given string should sound when the chord is played. */
export function expectedMidi(chord: ChordDef, stringNumber: StringNumber): number | null {
  const string = chord.strings.find((s) => s.number === stringNumber);
  if (!string) return null;
  return string.fret === null ? null : OPEN_MIDI_BY_STRING[stringNumber] + string.fret;
}

/** Frequency (Hz) the given string should sound (null if muted). */
export function expectedFrequency(chord: ChordDef, stringNumber: StringNumber): number | null {
  const midi = expectedMidi(chord, stringNumber);
  return midi === null ? null : 440 * 2 ** ((midi - 69) / 12);
}

/** Scientific note name the string should sound, e.g. "E2" (null if muted). */
export function expectedNoteName(chord: ChordDef, stringNumber: StringNumber): string | null {
  const midi = expectedMidi(chord, stringNumber);
  return midi === null ? null : midiToNoteName(midi);
}

/** Unique pitch classes (0–11) sounded by the chord. */
export function chordPitchClasses(chord: ChordDef): Set<number> {
  const set = new Set<number>();
  for (const string of soundingStrings(chord)) {
    const midi = expectedMidi(chord, string.number);
    if (midi !== null) set.add(midi % 12);
  }
  return set;
}

const MAJOR_OFFSETS = [0, 4, 7]; // root, major 3rd, perfect 5th
const MINOR_OFFSETS = [0, 3, 7]; // root, minor 3rd, perfect 5th

/** Throw if a chord shape does not spell its own name (data sanity check). */
export function assertValidChordShape(chord: ChordDef): void {
  const sounding = soundingStrings(chord);
  if (sounding.length < 3) {
    throw new Error(`Chord "${chord.id}": needs at least 3 sounding strings.`);
  }
  const offsets = chord.kind === 'major' ? MAJOR_OFFSETS : MINOR_OFFSETS;
  const chordTones = new Set(offsets.map((offset) => (chord.rootPitchClass + offset) % 12));
  const pcs = chordPitchClasses(chord);
  for (const pc of pcs) {
    if (!chordTones.has(pc)) {
      throw new Error(
        `Chord "${chord.id}": pitch class ${pc} is not part of ${chord.spanishName}.`,
      );
    }
  }
  if (!pcs.has(chord.rootPitchClass)) {
    throw new Error(`Chord "${chord.id}": the root (${chord.rootPitchClass}) never sounds.`);
  }
}

/* ------------------------------------------------------------------ */
/* The starter library (open-position chords for absolute beginners)   */
/* ------------------------------------------------------------------ */

export const CHORDS: readonly ChordDef[] = [
  {
    id: 'em',
    displayName: 'Em',
    spanishName: 'Mi menor',
    kind: 'minor',
    rootPitchClass: 4,
    strings: [
      { number: 6, fret: 0 },
      { number: 5, fret: 2, finger: 2 },
      { number: 4, fret: 2, finger: 3 },
      { number: 3, fret: 0 },
      { number: 2, fret: 0 },
      { number: 1, fret: 0 },
    ],
    tipsEs: [
      'Coloca el dedo 2 (corazón) y el 3 (anular) juntos, en el traste 2 de las cuerdas 5ª y 4ª.',
      'Las demás cuerdas van al aire: no las toques con la mano izquierda.',
      'Es el acorde más fácil: perfecto para empezar.',
    ],
  },
  {
    id: 'e',
    displayName: 'E',
    spanishName: 'Mi mayor',
    kind: 'major',
    rootPitchClass: 4,
    strings: [
      { number: 6, fret: 0 },
      { number: 5, fret: 2, finger: 2 },
      { number: 4, fret: 2, finger: 3 },
      { number: 3, fret: 1, finger: 1 },
      { number: 2, fret: 0 },
      { number: 1, fret: 0 },
    ],
    tipsEs: [
      'Es el Em con un dedo más: añade el dedo 1 (índice) en el traste 1 de la 3ª cuerda.',
      'Los tres dedos quedan casi en diagonal; no tapes la 5ª ni la 4ª.',
    ],
  },
  {
    id: 'am',
    displayName: 'Am',
    spanishName: 'La menor',
    kind: 'minor',
    rootPitchClass: 9,
    strings: [
      { number: 6, fret: null },
      { number: 5, fret: 0 },
      { number: 4, fret: 2, finger: 2 },
      { number: 3, fret: 2, finger: 3 },
      { number: 2, fret: 1, finger: 1 },
      { number: 1, fret: 0 },
    ],
    tipsEs: [
      'La 6ª cuerda (la más gruesa) NO se toca: apóyala suavemente para que no suene.',
      'Es la misma forma de Em pero desplazada: dedos 2 y 3 en el traste 2, índice en el 1.',
    ],
  },
  {
    id: 'a',
    displayName: 'A',
    spanishName: 'La mayor',
    kind: 'major',
    rootPitchClass: 9,
    strings: [
      { number: 6, fret: null },
      { number: 5, fret: 0 },
      { number: 4, fret: 2, finger: 2 },
      { number: 3, fret: 2, finger: 3 },
      { number: 2, fret: 2, finger: 4 },
      { number: 1, fret: 0 },
    ],
    tipsEs: [
      'Tres dedos (2, 3 y 4) en fila, traste 2 de las cuerdas 4ª, 3ª y 2ª.',
      'La 6ª cuerda NO se toca. Rasga desde la 5ª.',
      'Si te cuesta, también vale usar los dedos 1, 2 y 3.',
    ],
  },
  {
    id: 'd',
    displayName: 'D',
    spanishName: 'Re mayor',
    kind: 'major',
    rootPitchClass: 2,
    strings: [
      { number: 6, fret: null },
      { number: 5, fret: null },
      { number: 4, fret: 0 },
      { number: 3, fret: 2, finger: 1 },
      { number: 2, fret: 3, finger: 3 },
      { number: 1, fret: 2, finger: 2 },
    ],
    tipsEs: [
      'Triángulo de dedos: 1 en traste 2 (3ª), 3 en traste 3 (2ª), 2 en traste 2 (1ª).',
      'Las cuerdas 6ª y 5ª NO se tocan: rasga solo desde la 4ª.',
    ],
  },
  {
    id: 'c',
    displayName: 'C',
    spanishName: 'Do mayor',
    kind: 'major',
    rootPitchClass: 0,
    strings: [
      { number: 6, fret: null },
      { number: 5, fret: 3, finger: 3 },
      { number: 4, fret: 2, finger: 2 },
      { number: 3, fret: 0 },
      { number: 2, fret: 1, finger: 1 },
      { number: 1, fret: 0 },
    ],
    tipsEs: [
      'Empieza colocando el dedo 1 (índice) en el traste 1 de la 2ª cuerda.',
      'Luego añade el 2 en el traste 2 de la 4ª y el 3 en el traste 3 de la 5ª.',
      'La 6ª cuerda NO se toca.',
    ],
  },
  {
    id: 'g',
    displayName: 'G',
    spanishName: 'Sol mayor',
    kind: 'major',
    rootPitchClass: 7,
    strings: [
      { number: 6, fret: 3, finger: 3 },
      { number: 5, fret: 2, finger: 1 },
      { number: 4, fret: 0 },
      { number: 3, fret: 0 },
      { number: 2, fret: 0 },
      { number: 1, fret: 3, finger: 4 },
    ],
    tipsEs: [
      'Un clásico "difícil": dedo 1 en el traste 2 de la 5ª, dedo 3 en el traste 3 de la 6ª y dedo 4 (meñique) en el traste 3 de la 1ª.',
      'Suenan TODAS las cuerdas. Comprueba que el meñique no tape la 2ª.',
    ],
  },
];

export const CHORD_CATALOG: ChordCatalog = (() => {
  const byId = new Map<string, ChordDef>();
  for (const chord of CHORDS) {
    assertValidChordShape(chord);
    byId.set(chord.id, chord);
  }
  return { byId, ids: CHORDS.map((c) => c.id) };
})();

export function chordById(id: string): ChordDef | undefined {
  return CHORD_CATALOG.byId.get(id);
}
