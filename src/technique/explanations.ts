/**
 * Plain-language explanations for every technique exercise, plus the glossary of
 * the terms the module uses.
 *
 * Kept separate from the exercise catalog so the "what/why/how" text can evolve
 * without touching the musical data, and so it can be unit tested: every
 * exercise must have an explanation, and every jargon term must be defined.
 */

import type { TechniqueExercise } from './exercises';

export type Alternation = 'i-m' | 'i-a' | 'm-a' | null;
export type LeftHandPattern = 'chromatic' | 'scale' | 'repeat';

export interface ExerciseExplanation {
  /** What the exercise trains, in one short phrase. */
  readonly goalEs: string;
  /** 2–4 short steps in plain language. */
  readonly howEs: readonly string[];
  /** Right-hand fingers that alternate (null = free/unchosen). */
  readonly alternation: Alternation;
  /** Shape of the left-hand movement, used by the diagrams. */
  readonly leftHand: LeftHandPattern;
}

const EXPLANATIONS: Readonly<Record<string, ExerciseExplanation>> = {
  'chromatic-low-strings': {
    goalEs: 'Que cada dedo se mueva solo, sin arrastrar a los demás.',
    howEs: [
      'Un dedo por traste: 1 = índice, 2 = medio, 3 = anular, 4 = meñique.',
      'Toca las 4 notas de la 6ª cuerda y pasa a la 5ª sin parar.',
      'Pisa justo detrás del traste, con la presión mínima que suene limpio.',
    ],
    alternation: 'i-m',
    leftHand: 'chromatic',
  },
  'chromatic-high-strings': {
    goalEs: 'Fortalecer el anular y el meñique en las cuerdas agudas.',
    howEs: [
      'Mismo patrón 1-2-3-4, ahora en las cuerdas 3ª, 2ª y 1ª.',
      'Vigila que el meñique no se aplaste: mantenlo curvado.',
      'Cambia de cuerda cuando termine la 4ª nota, sin pausa.',
    ],
    alternation: 'i-m',
    leftHand: 'chromatic',
  },
  'chromatic-all-strings': {
    goalEs: 'Recorrer todo el mástil manteniendo el pulso.',
    howEs: [
      '24 notas: 4 por cuerda, de la 6ª a la 1ª.',
      'El cruce de cuerda no debe romper el tempo.',
      'Cuenta en voz alta "1-2-3-4" en cada cuerda.',
    ],
    alternation: 'i-m',
    leftHand: 'chromatic',
  },
  'repeated-note-i-m': {
    goalEs: 'Alternar índice y medio con sonido y volumen iguales.',
    howEs: [
      'i = índice, m = medio. Toca i-m-i-m… sin repetir dedo.',
      'Todas las notas con el mismo volumen y la misma duración.',
      'El pulgar no participa: déjalo relajado.',
    ],
    alternation: 'i-m',
    leftHand: 'repeat',
  },
  'repeated-note-i-a': {
    goalEs: 'Entrenar el anular, que suele sonar más flojo.',
    howEs: [
      'i = índice, a = anular. Alterna i-a-i-a…',
      'Muévete desde el dedo, no desde la muñeca.',
      'Si una nota suena más floja, baja el tempo y busca igualdad.',
    ],
    alternation: 'i-a',
    leftHand: 'repeat',
  },
  'scale-c-major-1oct': {
    goalEs: 'Tocar una escala con notas parejas y sin parar.',
    howEs: [
      'Sube y baja una octava de Do mayor en primera posición.',
      'La mano derecha alterna índice y medio en cada nota.',
      'Al bajar no aceleres: ahí se pierde el tempo.',
    ],
    alternation: 'i-m',
    leftHand: 'scale',
  },
  'scale-g-major-1oct': {
    goalEs: 'Primer accidente: el fa# con el dedo medio.',
    howEs: [
      'Sol mayor, una octava, subiendo y bajando.',
      'El dedo 1 se queda cerca del traste 1 como referencia.',
      'Escucha la afinación: si desafina, suele ser exceso de presión.',
    ],
    alternation: 'i-m',
    leftHand: 'scale',
  },
  'scale-a-minor-1oct': {
    goalEs: 'Extensión hasta el traste 5 sin tensar la mano.',
    howEs: [
      'La menor natural, una octava, subiendo y bajando.',
      'Para llegar al traste 5, acerca el codo al cuerpo y suelta el pulgar.',
      'Si el meñique colapsa, baja el tempo antes que forzar.',
    ],
    alternation: 'i-m',
    leftHand: 'scale',
  },
};

const FALLBACK: ExerciseExplanation = {
  goalEs: 'Trabajar la técnica con calma y sin tensión.',
  howEs: ['Toca una nota por clic.', 'Busca sonido limpio y tempo estable.'],
  alternation: 'i-m',
  leftHand: 'scale',
};

export function explanationFor(exercise: TechniqueExercise): ExerciseExplanation {
  return EXPLANATIONS[exercise.id] ?? FALLBACK;
}

/** All exercise ids that have a curated explanation (checked by tests). */
export function explainedExerciseIds(): readonly string[] {
  return Object.keys(EXPLANATIONS);
}

/* ------------------------------------------------------------------ */
/* Glossary: every jargon term used by the module, explained plainly    */
/* ------------------------------------------------------------------ */

export interface GlossaryTerm {
  readonly id: string;
  /** The term as shown in the UI. */
  readonly termEs: string;
  /** One short, plain-language meaning. */
  readonly meaningEs: string;
  readonly icon: string;
}

export const TECHNIQUE_GLOSSARY: readonly GlossaryTerm[] = [
  {
    id: 'bpm',
    termEs: 'BPM',
    meaningEs: 'Clics por minuto. Más BPM = más rápido. Empezamos lento y subimos de 5 en 5.',
    icon: '⏱️',
  },
  {
    id: 'beat',
    termEs: 'Tiempo / clic',
    meaningEs: 'Cada golpe del metrónomo. En estos ejercicios tocas una nota por clic.',
    icon: '👏',
  },
  {
    id: 'pass',
    termEs: 'Pase',
    meaningEs: 'Una vuelta completa al ejercicio, de la primera nota a la última.',
    icon: '🔁',
  },
  {
    id: 'im',
    termEs: 'i-m / i-a',
    meaningEs: 'i = índice, m = medio, a = anular. Alternar dedos evita repetir y sonar desigual.',
    icon: '✋',
  },
  {
    id: 'chromatic',
    termEs: 'Cromático 1-2-3-4',
    meaningEs: 'Cuatro trastes seguidos con los cuatro dedos: 1 índice, 2 medio, 3 anular, 4 meñique.',
    icon: '🪜',
  },
  {
    id: 'scale',
    termEs: 'Escala',
    meaningEs: 'Las notas de una tonalidad en orden. Aquí, una octava subiendo y bajando.',
    icon: '🎼',
  },
  {
    id: 'accuracy',
    termEs: 'Aciertos',
    meaningEs: 'Porcentaje de notas que sonaron en la nota correcta.',
    icon: '🎯',
  },
  {
    id: 'cents',
    termEs: 'Cents',
    meaningEs: 'Centésimas de semitono. 0 ¢ = afinado; ±10 ¢ ya se nota; ±20 ¢ se oye desafinado.',
    icon: '🎚️',
  },
  {
    id: 'stability',
    termEs: 'Estabilidad',
    meaningEs: 'Cuánto te desvías del clic (en milisegundos). Menos es mejor: quiere decir tempo regular.',
    icon: '📏',
  },
  {
    id: 'pause',
    termEs: 'Pausa',
    meaningEs: 'Una nota esperada que no sonó: la secuencia se cortó.',
    icon: '⛔',
  },
  {
    id: 'clean',
    termEs: 'Pase limpio',
    meaningEs: 'Cumple los objetivos del ejercicio y no tiene pausas. Tres limpios seguidos suben el tempo.',
    icon: '✅',
  },
];

export function glossaryTermById(id: string): GlossaryTerm | undefined {
  return TECHNIQUE_GLOSSARY.find((term) => term.id === id);
}
