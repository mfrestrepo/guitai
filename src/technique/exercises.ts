/**
 * Technique exercise catalog — the data behind the guided practice module.
 *
 * Everything is declared as **expected notes** (MIDI + string + fret) so the
 * app can:
 *  - draw the sequence on a fretboard diagram;
 *  - compare what the learner plays against the expected note sequence
 *    (pitch, cents) and against the metronome grid (timing);
 *  - apply explicit exit criteria (tempo policy) and offer concrete tips.
 *
 * Content follows the research in `docs/research/technique_research.md`:
 * the first drills are chromatic 1-2-3-4 and repeated notes with strict finger
 * alternation (right hand first), then one-octave scales in first position.
 *
 * Pure data + helpers; validated at load time and unit tested.
 */

import { midiToNoteName } from '../theory/music';
import type { StringNumber } from '../chords/catalog';

export type TechniqueKind = 'chromatic' | 'repeated-note' | 'scale';
export type TechniqueLevel = 'inicial' | 'basico' | 'intermedio';
export type NoteVerification = 'pitch-sequence' | 'regularity';
export type Subdivision = 'quarter' | 'eighth';

export interface ExerciseNote {
  readonly midi: number;
  readonly stringNumber: StringNumber;
  readonly fret: number;
  /**
   * Left-hand finger (1 = índice … 4 = meñique). Undefined for open strings and
   * when the exercise does not prescribe a fingering.
   */
  readonly finger?: 1 | 2 | 3 | 4;
}

export interface ExerciseCriteria {
  /** Fraction of expected notes that must be correct (0…1). */
  readonly minAccuracy: number;
  /** Median absolute cents deviation allowed. */
  readonly maxMedianCents: number;
  /** Standard deviation of timing error allowed (ms). */
  readonly maxTimingStdMs: number;
  /** Clean passes in a row → suggest +5 BPM. */
  readonly cleanPassesToIncrease: number;
  /** Failed passes in a row → suggest −5 BPM. */
  readonly failsToDecrease: number;
}

export interface TechniqueExercise {
  readonly id: string;
  readonly title: string;
  readonly kind: TechniqueKind;
  readonly level: TechniqueLevel;
  readonly descriptionEs: string;
  readonly notes: readonly ExerciseNote[];
  readonly startBpm: number;
  readonly targetBpm: number;
  readonly subdivision: Subdivision;
  readonly verification: NoteVerification;
  readonly criteria: ExerciseCriteria;
  readonly tipsEs: readonly string[];
}

export const TECHNIQUE_LEVELS: readonly { id: TechniqueLevel; label: string }[] = [
  { id: 'inicial', label: 'Inicial' },
  { id: 'basico', label: 'Básico' },
  { id: 'intermedio', label: 'Intermedio temprano' },
];

/* ------------------------------------------------------------------ */
/* Fretboard helpers                                                    */
/* ------------------------------------------------------------------ */

const OPEN_MIDI: Readonly<Record<StringNumber, number>> = {
  6: 40, // E2
  5: 45, // A2
  4: 50, // D3
  3: 55, // G3
  2: 59, // B3
  1: 64, // E4
};

export function midiForPosition(stringNumber: StringNumber, fret: number): number {
  return OPEN_MIDI[stringNumber] + fret;
}

export function noteAt(
  stringNumber: StringNumber,
  fret: number,
  finger?: 1 | 2 | 3 | 4,
): ExerciseNote {
  return { midi: midiForPosition(stringNumber, fret), stringNumber, fret, finger };
}

/** "C3", "F#4"… for an exercise note. */
export function exerciseNoteLabel(note: ExerciseNote): string {
  return midiToNoteName(note.midi);
}

/* ------------------------------------------------------------------ */
/* Sequence builders                                                    */
/* ------------------------------------------------------------------ */

/**
 * Chromatic 1-2-3-4 on the given strings (frets 1..4), one string at a time.
 * The finger matches the fret: 1-índice, 2-medio, 3-anular, 4-meñique.
 */
function chromaticOn(strings: readonly StringNumber[]): ExerciseNote[] {
  const notes: ExerciseNote[] = [];
  for (const stringNumber of strings) {
    for (const fret of [1, 2, 3, 4] as const) notes.push(noteAt(stringNumber, fret, fret));
  }
  return notes;
}

/** A scale given as (string, fret, finger) up, then mirrored back down. */
function scaleUpAndDown(
  positions: readonly [StringNumber, number, (1 | 2 | 3 | 4)?][],
): ExerciseNote[] {
  const notes = positions.map(([stringNumber, fret, finger]) => noteAt(stringNumber, fret, finger));
  const back = [...notes].reverse().slice(1);
  return [...notes, ...back];
}

/** Repeated single note (for alternation/regularity drills). */
function repeated(stringNumber: StringNumber, fret: number, count: number): ExerciseNote[] {
  return Array.from({ length: count }, () => noteAt(stringNumber, fret));
}

const CHROMATIC_CRITERIA: ExerciseCriteria = {
  minAccuracy: 0.9,
  maxMedianCents: 20,
  maxTimingStdMs: 90,
  cleanPassesToIncrease: 3,
  failsToDecrease: 2,
};

const REGULARITY_CRITERIA: ExerciseCriteria = {
  minAccuracy: 0.95,
  maxMedianCents: 15,
  maxTimingStdMs: 60,
  cleanPassesToIncrease: 3,
  failsToDecrease: 2,
};

const SCALE_CRITERIA: ExerciseCriteria = {
  minAccuracy: 0.9,
  maxMedianCents: 20,
  maxTimingStdMs: 80,
  cleanPassesToIncrease: 3,
  failsToDecrease: 2,
};

/* ------------------------------------------------------------------ */
/* Catalog                                                              */
/* ------------------------------------------------------------------ */

export const TECHNIQUE_EXERCISES: readonly TechniqueExercise[] = [
  {
    id: 'chromatic-low-strings',
    title: 'Cromático 1-2-3-4 · cuerdas 6-5-4',
    kind: 'chromatic',
    level: 'inicial',
    descriptionEs: 'Pon los dedos 1-2-3-4 en los trastes 1-2-3-4 de las cuerdas 6ª, 5ª y 4ª, una cuerda cada vez.',
    notes: chromaticOn([6, 5, 4]),
    startBpm: 50,
    targetBpm: 80,
    subdivision: 'quarter',
    verification: 'pitch-sequence',
    criteria: CHROMATIC_CRITERIA,
    tipsEs: [
      'Mantén los dedos curvados y pisa junto al traste.',
      'Presión mínima: la nota limpia con el menor esfuerzo.',
      'Deja cada dedo plantado hasta que le toque moverse.',
    ],
  },
  {
    id: 'chromatic-high-strings',
    title: 'Cromático 1-2-3-4 · cuerdas 3-2-1',
    kind: 'chromatic',
    level: 'inicial',
    descriptionEs: 'Lo mismo en las cuerdas 3ª, 2ª y 1ª: aquí cuestan más el anular y el meñique.',
    notes: chromaticOn([3, 2, 1]),
    startBpm: 50,
    targetBpm: 80,
    subdivision: 'quarter',
    verification: 'pitch-sequence',
    criteria: CHROMATIC_CRITERIA,
    tipsEs: [
      'El meñique suele colapsar: revísalo en un espejo.',
      'No muevas la mano entera: solo los dedos.',
    ],
  },
  {
    id: 'chromatic-all-strings',
    title: 'Cromático 1-2-3-4 · todas las cuerdas',
    kind: 'chromatic',
    level: 'basico',
    descriptionEs: 'De la 6ª cuerda a la 1ª sin parar: 24 notas con los dedos 1-2-3-4.',
    notes: chromaticOn([6, 5, 4, 3, 2, 1]),
    startBpm: 50,
    targetBpm: 90,
    subdivision: 'quarter',
    verification: 'pitch-sequence',
    criteria: CHROMATIC_CRITERIA,
    tipsEs: [
      'Busca que el cruce de cuerda no rompa el tempo.',
      'Cuenta en voz alta: 1-2-3-4 por cuerda.',
    ],
  },
  {
    id: 'repeated-note-i-m',
    title: 'Nota repetida · índice y medio (i-m)',
    kind: 'repeated-note',
    level: 'inicial',
    descriptionEs: 'Toca 8 veces la 2ª cuerda al aire alternando índice y medio (i-m).',
    notes: repeated(2, 0, 8),
    startBpm: 60,
    targetBpm: 100,
    subdivision: 'quarter',
    verification: 'regularity',
    criteria: REGULARITY_CRITERIA,
    tipsEs: [
      'Alternancia estricta: i-m-i-m… sin repetir dedo.',
      'Todas las notas con el mismo volumen y duración.',
      'Relaja el pulgar: no participa en este ejercicio.',
    ],
  },
  {
    id: 'repeated-note-i-a',
    title: 'Nota repetida · índice y anular (i-a)',
    kind: 'repeated-note',
    level: 'basico',
    descriptionEs: 'Toca 8 veces la 1ª cuerda al aire alternando índice y anular (i-a).',
    notes: repeated(1, 0, 8),
    startBpm: 55,
    targetBpm: 90,
    subdivision: 'quarter',
    verification: 'regularity',
    criteria: REGULARITY_CRITERIA,
    tipsEs: [
      'Si el anular suena más flojo, baja el tempo y busca igualdad.',
      'Movimiento desde la articulación del dedo, no desde la muñeca.',
    ],
  },
  {
    id: 'scale-c-major-1oct',
    title: 'Escala de Do mayor · 1 octava',
    kind: 'scale',
    level: 'basico',
    descriptionEs: 'Sube y baja una octava de Do mayor desde el traste 3 de la 5ª cuerda.',
    notes: scaleUpAndDown([
      [5, 3, 3], // C3 · dedo 3 (anular)
      [4, 0], // D3 · al aire
      [4, 2, 2], // E3 · dedo 2 (medio)
      [4, 3, 3], // F3 · dedo 3 (anular)
      [3, 0], // G3 · al aire
      [3, 2, 2], // A3 · dedo 2 (medio)
      [2, 0], // B3 · al aire
      [2, 1, 1], // C4 · dedo 1 (índice)
    ]),
    startBpm: 50,
    targetBpm: 80,
    subdivision: 'quarter',
    verification: 'pitch-sequence',
    criteria: SCALE_CRITERIA,
    tipsEs: [
      'Alternancia i-m estricta en la mano derecha.',
      'Al bajar, no aceleres: el descenso es donde se pierde el tempo.',
      'Escucha la afinación: si una nota desafina, suele ser exceso de presión.',
    ],
  },
  {
    id: 'scale-g-major-1oct',
    title: 'Escala de Sol mayor · 1 octava',
    kind: 'scale',
    level: 'basico',
    descriptionEs: 'Sube y baja una octava de Sol mayor, con el fa# en el traste 2 de la 1ª cuerda.',
    notes: scaleUpAndDown([
      [3, 0], // G3 · al aire
      [3, 2, 2], // A3 · dedo 2
      [2, 0], // B3 · al aire
      [2, 1, 1], // C4 · dedo 1
      [2, 3, 3], // D4 · dedo 3
      [1, 0], // E4 · al aire
      [1, 2, 2], // F#4 · dedo 2
      [1, 3, 3], // G4 · dedo 3
    ]),
    startBpm: 50,
    targetBpm: 75,
    subdivision: 'quarter',
    verification: 'pitch-sequence',
    criteria: SCALE_CRITERIA,
    tipsEs: [
      'El dedo 1 se queda cerca del traste 1 como referencia.',
      'Mantén el contacto visual con la mano izquierda, no con la derecha.',
    ],
  },
  {
    id: 'scale-a-minor-1oct',
    title: 'Escala de La menor · 1 octava',
    kind: 'scale',
    level: 'intermedio',
    descriptionEs: 'Sube y baja una octava de La menor, con una extensión hasta el traste 5.',
    notes: scaleUpAndDown([
      [3, 2, 2], // A3 · dedo 2
      [2, 0], // B3 · al aire
      [2, 1, 1], // C4 · dedo 1
      [2, 3, 3], // D4 · dedo 3
      [1, 0], // E4 · al aire
      [1, 1, 1], // F4 · dedo 1
      [1, 3, 3], // G4 · dedo 3
      [1, 5, 4], // A4 · dedo 4
    ]),
    startBpm: 50,
    targetBpm: 75,
    subdivision: 'quarter',
    verification: 'pitch-sequence',
    criteria: SCALE_CRITERIA,
    tipsEs: [
      'La extensión al traste 5 exige soltar la tensión del pulgar.',
      'Si el meñique colapsa, reduce el tempo antes que forzar.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

export function techniqueExerciseById(id: string): TechniqueExercise | undefined {
  return TECHNIQUE_EXERCISES.find((exercise) => exercise.id === id);
}

export function techniqueExercisesByLevel(level: TechniqueLevel): readonly TechniqueExercise[] {
  return TECHNIQUE_EXERCISES.filter((exercise) => exercise.level === level);
}

/** Milliseconds per expected note for a tempo. */
export function stepMsFor(exercise: TechniqueExercise, bpm: number): number {
  const beatMs = 60000 / Math.max(1, bpm);
  return exercise.subdivision === 'eighth' ? beatMs / 2 : beatMs;
}

/** Total duration of one pass (the time of the last expected note + its step). */
export function passDurationMs(exercise: TechniqueExercise, bpm: number): number {
  return exercise.notes.length * stepMsFor(exercise, bpm);
}

/** Time (relative to the pass start) at which note `index` should sound. */
export function expectedTimeMs(exercise: TechniqueExercise, bpm: number, index: number): number {
  return index * stepMsFor(exercise, bpm);
}

/** Distinct notes of an exercise (for the fretboard diagram / unique-note count). */
export function uniqueNoteCount(exercise: TechniqueExercise): number {
  return new Set(exercise.notes.map((note) => note.midi)).size;
}

/* Load-time validation: bad data must fail fast. */
for (const exercise of TECHNIQUE_EXERCISES) {
  if (exercise.notes.length === 0) {
    throw new Error(`Technique exercise "${exercise.id}" has no notes.`);
  }
  for (const note of exercise.notes) {
    if (note.stringNumber < 1 || note.stringNumber > 6) {
      throw new Error(`Technique exercise "${exercise.id}": invalid string ${note.stringNumber}.`);
    }
    if (note.fret < 0 || note.fret > 15) {
      throw new Error(`Technique exercise "${exercise.id}": invalid fret ${note.fret}.`);
    }
    if (note.finger !== undefined && (note.finger < 1 || note.finger > 4)) {
      throw new Error(`Technique exercise "${exercise.id}": invalid finger ${note.finger}.`);
    }
    if (note.fret === 0 && note.finger !== undefined) {
      throw new Error(`Technique exercise "${exercise.id}": open strings cannot have a finger.`);
    }
    const expected = midiForPosition(note.stringNumber, note.fret);
    if (note.midi !== expected) {
      throw new Error(
        `Technique exercise "${exercise.id}": note ${midiToNoteName(note.midi)} does not match string ` +
          `${note.stringNumber} fret ${note.fret} (${midiToNoteName(expected)}).`,
      );
    }
  }
  if (exercise.startBpm < 40 || exercise.startBpm > 140) {
    throw new Error(`Technique exercise "${exercise.id}": startBpm out of range.`);
  }
  if (exercise.targetBpm < exercise.startBpm) {
    throw new Error(`Technique exercise "${exercise.id}": targetBpm < startBpm.`);
  }
  if (exercise.tipsEs.length === 0) {
    throw new Error(`Technique exercise "${exercise.id}": needs at least one tip.`);
  }
  const c = exercise.criteria;
  if (c.minAccuracy <= 0 || c.minAccuracy > 1 || c.maxMedianCents <= 0 || c.maxTimingStdMs <= 0) {
    throw new Error(`Technique exercise "${exercise.id}": invalid exit criteria.`);
  }
}
