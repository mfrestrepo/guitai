/**
 * Chord-change exercises — data-driven catalog for beginners.
 *
 * The content follows the drills recommended in beginner guitar pedagogy
 * (see `docs/change-exercises.md` for the sources and reasoning):
 *
 *  - **Cambios en 1 minuto** (one-minute changes): switch between two chords for
 *    60 s and count *clean* changes. Landing 30–50 in a minute is "functional".
 *  - **Dedo ancla / pivote**: keep a finger that both chords share — it halves
 *    the fingers that have to travel.
 *  - **Cambios al aire** (air changes): form the shape off the strings, land it
 *    as a block. Trains fingers to move together, not one by one.
 *  - **Bucles de 4 acordes** with a metronome: start slow (≈50 BPM) and only
 *    raise the tempo by 5 BPM when the changes are effortless.
 *  - **Cambios aleatorios**: random pairs, so you don't only memorise one move.
 *
 * Everything here is plain data + pure helpers, so the UI and the exercise
 * session can reuse it and the tests can validate it.
 */

import { type ChordDef, chordById } from './catalog';
import type { StringNumber } from './catalog';

export type ExerciseLevel = 'muy-facil' | 'facil' | 'medio' | 'dificil';

export type ExerciseKind = 'one-minute' | 'pivot' | 'air-changes' | 'loop' | 'random';

export interface ChordExercise {
  readonly id: string;
  readonly title: string;
  readonly level: ExerciseLevel;
  readonly kind: ExerciseKind;
  /** One-line explanation (Spanish) for the exercise card. */
  readonly descriptionEs: string;
  /** Chords in play order (2+). For `random`, the first two are the start pair. */
  readonly chordIds: readonly string[];
  /** Beats each chord stays when the metronome is on. */
  readonly beatsPerChord: number;
  /** Suggested starting tempo (BPM). */
  readonly startBpm: number;
  /** Tempo to reach before moving on (metronome drills). */
  readonly targetBpm?: number;
  /** For one-minute drills: clean changes to beat. */
  readonly targetChanges?: number;
  /** Duration of timed drills in seconds (default: 60). */
  readonly durationSeconds?: number;
  /** Pool for random-change drills. */
  readonly randomPoolChordIds?: readonly string[];
  /** Silent drill (no strumming): the microphone cannot validate it. */
  readonly silent?: boolean;
  /** Short, practical tips shown under the exercise. */
  readonly tipsEs: readonly string[];
}

export const EXERCISE_LEVELS: readonly { id: ExerciseLevel; label: string; hint: string }[] = [
  { id: 'muy-facil', label: 'Muy fáciles', hint: 'Acordes que comparten dedos: casi no hay que moverse.' },
  { id: 'facil', label: 'Fáciles', hint: 'Cambios cortos entre formas conocidas.' },
  { id: 'medio', label: 'Medios', hint: 'Los cambios "famosos" que cuestan: C↔G, G↔D…' },
  { id: 'dificil', label: 'Difíciles', hint: 'Bucles de 4 acordes, cambios cada 2 tiempos y pares al azar.' },
];

export const CHORD_EXERCISES: readonly ChordExercise[] = [
  /* ---------------- muy fáciles ---------------- */
  {
    id: 'em-am',
    title: 'Em ↔ Am',
    level: 'muy-facil',
    kind: 'pivot',
    descriptionEs: 'Los dedos 2 y 3 casi no se mueven: solo se desplazan una cuerda.',
    chordIds: ['em', 'am'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 80,
    tipsEs: [
      'Deja los dedos 2 y 3 apoyados: son tu ancla entre los dos acordes.',
      'Piensa "una cuerda abajo" en lugar de levantar toda la mano.',
    ],
  },
  {
    id: 'em-e',
    title: 'Em ↔ E',
    level: 'muy-facil',
    kind: 'pivot',
    descriptionEs: 'Misma forma: solo entra y sale el dedo índice.',
    chordIds: ['em', 'e'],
    beatsPerChord: 4,
    startBpm: 55,
    targetBpm: 90,
    tipsEs: [
      'Los dedos 2 y 3 no se mueven nunca.',
      'El índice se coloca en el traste 1 de la 3ª cuerda: mínimo esfuerzo.',
    ],
  },
  {
    id: 'am-c',
    title: 'Am ↔ C (dedo ancla)',
    level: 'muy-facil',
    kind: 'pivot',
    descriptionEs: 'El índice se queda quieto en el traste 1: reordena los otros dedos a su alrededor.',
    chordIds: ['am', 'c'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 80,
    tipsEs: [
      'El dedo 1 (índice) no se mueve: es el pivote.',
      'Mueve 2 y 3 como bloque, no uno después del otro.',
    ],
  },
  {
    id: 'e-am',
    title: 'E ↔ Am',
    level: 'muy-facil',
    kind: 'pivot',
    descriptionEs: 'Dos formas parecidas: el índice vuelve a ser el ancla.',
    chordIds: ['e', 'am'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 80,
    tipsEs: ['Aprovecha que el índice se mantiene en el traste 1.'],
  },
  {
    id: 'a-am',
    title: 'A ↔ Am',
    level: 'muy-facil',
    kind: 'pivot',
    descriptionEs: 'Solo un dedo cambia de traste: el cambio más económico que existe.',
    chordIds: ['a', 'am'],
    beatsPerChord: 4,
    startBpm: 55,
    targetBpm: 90,
    tipsEs: ['Mantén la fila de dedos y mueve únicamente el dedo 1.'],
  },
  {
    id: 'one-minute-em-am',
    title: '1 minuto: Em ↔ Am',
    level: 'muy-facil',
    kind: 'one-minute',
    descriptionEs: '60 segundos cambiando sin parar. Cuenta tus cambios limpios.',
    chordIds: ['em', 'am'],
    beatsPerChord: 1,
    startBpm: 60,
    targetChanges: 30,
    durationSeconds: 60,
    tipsEs: [
      'Estruma una vez por cambio y cuenta solo los que suenan limpios.',
      'Menos de 30 es normal al principio: apunta el número y supéralo mañana.',
    ],
  },

  /* ---------------- fáciles ---------------- */
  {
    id: 'em-g',
    title: 'Em ↔ G',
    level: 'facil',
    kind: 'pivot',
    descriptionEs: 'El anular viaja del traste 3 de la 2ª cuerda al de la 1ª.',
    chordIds: ['em', 'g'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 80,
    tipsEs: [
      'El meñique entra en el traste 3 de la 1ª cuerda: no lo dejes para el final.',
      'Mira tu mano izquierda, no la derecha.',
    ],
  },
  {
    id: 'd-a',
    title: 'D ↔ A',
    level: 'facil',
    kind: 'pivot',
    descriptionEs: 'Dos formas de tres dedos con movimientos cortos.',
    chordIds: ['d', 'a'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 85,
    tipsEs: ['Levanta los tres dedos a la vez, no de uno en uno.'],
  },
  {
    id: 'am-d',
    title: 'Am ↔ D',
    level: 'facil',
    kind: 'pivot',
    descriptionEs: 'Cambio entre trastes 1-2 y 2-3: buena gimnasia de dedos.',
    chordIds: ['am', 'd'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 80,
    tipsEs: ['Forma la figura nueva en el aire antes de apoyarla (hover).'],
  },
  {
    id: 'one-minute-am-c',
    title: '1 minuto: Am ↔ C',
    level: 'facil',
    kind: 'one-minute',
    descriptionEs: 'Cambio con dedo ancla, ahora contra el reloj.',
    chordIds: ['am', 'c'],
    beatsPerChord: 1,
    startBpm: 60,
    targetChanges: 40,
    durationSeconds: 60,
    tipsEs: ['Objetivo: 40 cambios limpios. Si pasas de 50, ya es sólido.'],
  },
  {
    id: 'air-em-c',
    title: 'Cambios al aire: Em ↔ C',
    level: 'facil',
    kind: 'air-changes',
    silent: true,
    descriptionEs: 'Sin tocar: forma la figura, sepárala 1 cm y vuelve a aterrizar como bloque.',
    chordIds: ['em', 'c'],
    beatsPerChord: 2,
    startBpm: 50,
    targetBpm: 80,
    durationSeconds: 45,
    tipsEs: [
      'Este ejercicio entrena que los dedos se muevan juntos.',
      'No suena nada: céntrate solo en la forma de la mano.',
    ],
  },

  /* ---------------- medios ---------------- */
  {
    id: 'g-d',
    title: 'G ↔ D',
    level: 'medio',
    kind: 'pivot',
    descriptionEs: 'El cambio con más movimiento de dedos entre los acordes abiertos.',
    chordIds: ['g', 'd'],
    beatsPerChord: 4,
    startBpm: 45,
    targetBpm: 75,
    tipsEs: [
      'Baja el pulgar hacia el centro del mástil para ganar alcance.',
      'Pulsa solo lo necesario: si aprietas de más, tardas más en soltar.',
    ],
  },
  {
    id: 'c-g',
    title: 'C ↔ G',
    level: 'medio',
    kind: 'pivot',
    descriptionEs: 'Cambio total de forma: el clásico que bloquea a los principiantes.',
    chordIds: ['c', 'g'],
    beatsPerChord: 4,
    startBpm: 45,
    targetBpm: 75,
    tipsEs: [
      'Visualiza la forma siguiente mientras aún suena la actual (hover).',
      'Si a 100 BPM suena sucio, baja a 60: la velocidad sigue a la precisión.',
    ],
  },
  {
    id: 'one-minute-g-c',
    title: '1 minuto: G ↔ C',
    level: 'medio',
    kind: 'one-minute',
    descriptionEs: 'El reto clásico contra el reloj con el cambio más difícil del nivel.',
    chordIds: ['g', 'c'],
    beatsPerChord: 1,
    startBpm: 55,
    targetChanges: 30,
    durationSeconds: 60,
    tipsEs: [
      'No pares la mano derecha aunque la izquierda llegue tarde: mejor un mute que cortar el ritmo.',
      'Registra tu marca y repítelo cada día.',
    ],
  },
  {
    id: 'loop-a-d-e',
    title: 'Bucle: A → D → E',
    level: 'medio',
    kind: 'loop',
    descriptionEs: 'Progresión de miles de canciones. 4 tiempos por acorde con metrónomo.',
    chordIds: ['a', 'd', 'e'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 90,
    tipsEs: [
      'Sube solo +5 BPM cuando el bucle salga limpio y sin dudar.',
      'El bajo del acorde siguiente es lo primero que debe llegar.',
    ],
  },
  {
    id: 'loop-g-c-d-em',
    title: 'Bucle: G → C → D → Em',
    level: 'medio',
    kind: 'loop',
    descriptionEs: 'Cuatro acordes que aparecen en muchísimas canciones.',
    chordIds: ['g', 'c', 'd', 'em'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 80,
    tipsEs: [
      'Empieza a 50 BPM aunque te parezca lento: primero limpio, luego rápido.',
      'Mantén el pulso con el pie para no perder el tiempo.',
    ],
  },

  /* ---------------- difíciles ---------------- */
  {
    id: 'loop-em-c-g-d',
    title: 'Bucle rápido: Em → C → G → D',
    level: 'dificil',
    kind: 'loop',
    descriptionEs: 'El bucle de cuatro acordes a tempo de canción.',
    chordIds: ['em', 'c', 'g', 'd'],
    beatsPerChord: 4,
    startBpm: 60,
    targetBpm: 100,
    tipsEs: [
      'Objetivo: 100 BPM sin parar el ritmo.',
      'Estudia el par que peor te salga y practícalo aislado.',
    ],
  },
  {
    id: 'two-beats-g-c-d-em',
    title: 'Cambios cada 2 tiempos',
    level: 'dificil',
    kind: 'loop',
    descriptionEs: 'La misma progresión, pero con la mitad de tiempo para cada cambio.',
    chordIds: ['g', 'c', 'd', 'em'],
    beatsPerChord: 2,
    startBpm: 50,
    targetBpm: 70,
    tipsEs: [
      'Anticipa la forma: el cambio empieza antes del tiempo fuerte.',
      'Aquí se nota el dedo ancla: búscalo en cada pareja.',
    ],
  },
  {
    id: 'one-minute-g-d',
    title: '1 minuto: G ↔ D',
    level: 'dificil',
    kind: 'one-minute',
    descriptionEs: 'El cambio más exigente contra el reloj: 60 cambios limpios es nivel avanzado.',
    chordIds: ['g', 'd'],
    beatsPerChord: 1,
    startBpm: 60,
    targetChanges: 60,
    durationSeconds: 60,
    tipsEs: ['Usa el silencio como muleta: si falla, mejor mutear que parar la mano.'],
  },
  {
    id: 'random-seven',
    title: 'Cambios al azar',
    level: 'dificil',
    kind: 'random',
    descriptionEs: 'La app elige un acorde al azar cada 4 tiempos entre los 7 del curso.',
    chordIds: ['em', 'c'],
    randomPoolChordIds: ['em', 'e', 'am', 'a', 'd', 'c', 'g'],
    beatsPerChord: 4,
    startBpm: 50,
    targetBpm: 70,
    tipsEs: [
      'Evita memorizar una progresión: aquí entrenas cambios reales.',
      'Si un par te bloquea, apúntalo y practícalo aparte.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function exerciseById(id: string): ChordExercise | undefined {
  return CHORD_EXERCISES.find((exercise) => exercise.id === id);
}

export function exercisesByLevel(level: ExerciseLevel): readonly ChordExercise[] {
  return CHORD_EXERCISES.filter((exercise) => exercise.level === level);
}

/** Is this drill about switching between exactly two chords? */
export function isTwoChordDrill(exercise: ChordExercise): boolean {
  return exercise.kind === 'pivot' && exercise.chordIds.length === 2;
}

export interface SharedFinger {
  readonly stringNumber: StringNumber;
  readonly fret: number;
  readonly finger: number;
}

/**
 * Fingers that are identical (same string, fret and finger) in both chords:
 * the "anchor" a learner should keep planted while the other fingers move.
 * Computed from the fingering data, so the tip is always correct.
 */
export function sharedFingers(a: ChordDef, b: ChordDef): SharedFinger[] {
  const shared: SharedFinger[] = [];
  for (const stringA of a.strings) {
    if (stringA.fret === null || stringA.fret === 0 || !stringA.finger) continue;
    const stringB = b.strings.find((s) => s.number === stringA.number);
    if (!stringB || stringB.fret === null || stringB.fret === 0) continue;
    if (stringB.fret === stringA.fret && stringB.finger === stringA.finger) {
      shared.push({
        stringNumber: stringA.number,
        fret: stringA.fret,
        finger: stringA.finger,
      });
    }
  }
  return shared;
}

/** Spanish hint about the anchor finger of an exercise (when it has one). */
export function anchorFingerTip(exercise: ChordExercise): string | null {
  if (exercise.chordIds.length === 0) return null;
  const [firstId, ...rest] = exercise.chordIds;
  const first = chordById(firstId);
  if (!first) return null;
  for (const otherId of rest) {
    const other = chordById(otherId);
    if (!other) continue;
    const shared = sharedFingers(first, other);
    if (shared.length > 0) {
      const fingers = [...new Set(shared.map((f) => f.finger))].sort((a, b) => a - b);
      const list = fingers.length === 1 ? `el dedo ${fingers[0]}` : `los dedos ${fingers.join(' y ')}`;
      return `Dedo ancla: mantén apoyados ${list} (${first.displayName} y ${other.displayName} los comparten).`;
    }
  }
  return null;
}

/* Load-time validation: the catalog must always be playable. */
for (const exercise of CHORD_EXERCISES) {
  if (exercise.chordIds.length < 2) {
    throw new Error(`Exercise "${exercise.id}": needs at least two chords.`);
  }
  for (const chordId of exercise.chordIds) {
    if (!chordById(chordId)) {
      throw new Error(`Exercise "${exercise.id}": unknown chord "${chordId}".`);
    }
  }
  for (const chordId of exercise.randomPoolChordIds ?? []) {
    if (!chordById(chordId)) {
      throw new Error(`Exercise "${exercise.id}": unknown pool chord "${chordId}".`);
    }
  }
  if (exercise.kind === 'random' && (exercise.randomPoolChordIds?.length ?? 0) < 2) {
    throw new Error(`Exercise "${exercise.id}": random drills need a pool of at least 2 chords.`);
  }
  if (![1, 2, 4, 8].includes(exercise.beatsPerChord)) {
    throw new Error(`Exercise "${exercise.id}": beatsPerChord must be 1, 2, 4 or 8.`);
  }
  if (exercise.targetBpm !== undefined && exercise.targetBpm < exercise.startBpm) {
    throw new Error(`Exercise "${exercise.id}": targetBpm must be ≥ startBpm.`);
  }
  if (exercise.tipsEs.length === 0) {
    throw new Error(`Exercise "${exercise.id}": needs at least one tip.`);
  }
}
