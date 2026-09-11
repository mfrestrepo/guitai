/**
 * Beginner-friendly instructions: turns a musical position (string/fret/finger)
 * into the words a first-week guitarist understands, e.g.
 *
 *   "Dedo 1 (índice) · traste 1 · cuerda 1"
 *
 * Note names are kept as *secondary* information, because a beginner does not
 * know where F#3 is — but does know "cuerda 1, traste 2, dedo 2".
 */

import { midiToNoteName } from '../theory/music';
import type { StringNumber } from '../chords/catalog';
import type { ExerciseNote } from './exercises';

export const FINGER_NAMES: Readonly<Record<1 | 2 | 3 | 4, string>> = {
  1: 'índice',
  2: 'medio',
  3: 'anular',
  4: 'meñique',
};

/** "1ª", "2ª"… with a hint for the two extreme strings. */
export const STRING_LABELS: Readonly<Record<StringNumber, string>> = {
  1: '1ª (la más fina)',
  2: '2ª',
  3: '3ª',
  4: '4ª',
  5: '5ª',
  6: '6ª (la más gruesa)',
};

export interface NoteInstruction {
  /** Main instruction, in beginner language. */
  readonly primary: string;
  /** Secondary line with the musical note name. */
  readonly secondary: string;
  /** Very short version for chips: "1ª · T1 · D1" / "2ª · aire". */
  readonly short: string;
  /** Left-hand finger name, or null for open strings. */
  readonly fingerName: string | null;
}

export function fingerName(finger: 1 | 2 | 3 | 4 | undefined): string | null {
  return finger === undefined ? null : FINGER_NAMES[finger];
}

export function stringLabel(stringNumber: StringNumber): string {
  return STRING_LABELS[stringNumber];
}

/** Build the instruction for one expected note of an exercise. */
export function instructionForNote(note: ExerciseNote): NoteInstruction {
  const noteName = midiToNoteName(note.midi);

  if (note.fret === 0) {
    return {
      primary: `Cuerda ${stringLabel(note.stringNumber)} al aire (sin pisar)`,
      secondary: `Nota ${noteName}`,
      short: `${note.stringNumber}ª · aire`,
      fingerName: null,
    };
  }

  if (note.finger !== undefined) {
    return {
      primary: `Dedo ${note.finger} (${FINGER_NAMES[note.finger]}) · traste ${note.fret} · cuerda ${stringLabel(note.stringNumber)}`,
      secondary: `Nota ${noteName}`,
      short: `${note.stringNumber}ª · T${note.fret} · D${note.finger}`,
      fingerName: FINGER_NAMES[note.finger],
    };
  }

  return {
    primary: `Traste ${note.fret} · cuerda ${stringLabel(note.stringNumber)}`,
    secondary: `Nota ${noteName}`,
    short: `${note.stringNumber}ª · T${note.fret}`,
    fingerName: null,
  };
}

/* ------------------------------------------------------------------ */
/* "How to start" guide                                                */
/* ------------------------------------------------------------------ */

export interface GuideStep {
  readonly icon: string;
  readonly titleEs: string;
  readonly detailEs: string;
}

/**
 * The four things a beginner must know before the first note. Shown as a
 * visual card until the first pass starts.
 */
export const TECHNIQUE_START_GUIDE: readonly GuideStep[] = [
  {
    icon: '🎸',
    titleEs: 'Coge la guitarra',
    detailEs: 'Siéntate cómodo. Tocarás una sola cuerda cada vez, con la yema del dedo.',
  },
  {
    icon: '▶️',
    titleEs: 'Pulsa Empezar',
    detailEs: 'Se encenderá el micrófono (la primera vez el navegador pedirá permiso).',
  },
  {
    icon: '⏱️',
    titleEs: 'Espera 4 clics',
    detailEs: 'Son los tiempos de preparación: verás el número en grande sobre el mástil.',
  },
  {
    icon: '🎯',
    titleEs: 'Empieza en «¡ya!»',
    detailEs: 'Toca la nota que marca el dibujo justo cuando aparezca «¡ya!».',
  },
];

/** Legend used under the fretboard. */
export const STRING_LEGEND_ES =
  'Cuerda 1 = la más fina (abajo, mirando la guitarra) · cuerda 6 = la más gruesa.';
