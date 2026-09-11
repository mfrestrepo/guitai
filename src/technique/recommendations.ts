/**
 * Rule-based recommendations: turn a pass's metrics into ONE concrete next
 * action, in Spanish. Deliberately explainable and simple (no ML): the research
 * insists that a bad metric must map to an actionable practice instruction, not
 * to a score.
 */

import type { TechniqueExercise } from './exercises';

export interface PracticeMetrics {
  readonly accuracy: number;
  readonly medianAbsCents: number | null;
  readonly timingStdMs: number | null;
  readonly pauses: number;
  readonly extraNotes: number;
  readonly rushing: boolean;
  readonly dragging: boolean;
  readonly levelStd: number | null;
}

export type RecommendationAction =
  | 'increase-tempo'
  | 'decrease-tempo'
  | 'repeat'
  | 'slow-and-count'
  | 'check-pressure'
  | 'even-attacks'
  | 'take-break';

export interface Recommendation {
  readonly action: RecommendationAction;
  readonly headlineEs: string;
  readonly detailEs: string;
  /** Tempo the session suggests next (undefined = keep). */
  readonly nextBpm?: number;
}

export interface RecommendationInput {
  readonly metrics: PracticeMetrics;
  readonly exercise: TechniqueExercise;
  readonly bpm: number;
  readonly passStreak: number;
  readonly failStreak: number;
  /** Minutes practised in this sitting (optional, for break advice). */
  readonly sessionMinutes?: number;
}

const MAX_LEVEL_STD = 0.05;

export function recommend(input: RecommendationInput): Recommendation {
  const { metrics, exercise, bpm, passStreak, failStreak } = input;
  const criteria = exercise.criteria;

  // 1) Long sitting with repeated failures → rest before more repetitions.
  if ((input.sessionMinutes ?? 0) >= 30 && failStreak >= 3) {
    return {
      action: 'take-break',
      headlineEs: 'Descansa 5 minutos',
      detailEs: 'Llevas un rato largo y varios intentos fallidos: suelta las manos y vuelve más fresco.',
    };
  }

  // 2) A pause is the most audible problem: it means the sequence was not
  //    automatic yet, so slow down and count out loud.
  if (metrics.pauses > 0) {
    return {
      action: 'slow-and-count',
      headlineEs: 'Sin parar: cuenta en voz alta',
      detailEs:
        metrics.pauses === 1
          ? 'Se quedó una nota sin sonar. Baja el tempo, cuenta "1 y 2 y…" y no dejes huecos.'
          : `Se quedaron ${metrics.pauses} huecos. Baja el tempo y toca solo 4 notas seguidas hasta que salgan sin parar.`,
    };
  }

  // 3) The right notes but out of tune (≤ a semitone off) → pressure/tuning.
  //    (A whole semitone or more away is a *wrong note*, handled below.)
  if (
    (metrics.medianAbsCents ?? 0) > criteria.maxMedianCents &&
    (metrics.medianAbsCents ?? 0) <= 60
  ) {
    return {
      action: 'check-pressure',
      headlineEs: 'Revisa la presión y la afinación',
      detailEs: `Desviación media ${Math.round(metrics.medianAbsCents ?? 0)} ¢. Pisa junto al traste con la presión mínima y comprueba la afinación de la guitarra.`,
    };
  }

  // 4) Not enough correct notes yet.
  if (metrics.accuracy < criteria.minAccuracy) {
    if (bpm > exercise.startBpm) {
      return {
        action: 'decrease-tempo',
        headlineEs: 'Bajamos el tempo',
        detailEs: `Aciertos ${Math.round(metrics.accuracy * 100)} %. Repite a ${Math.max(exercise.startBpm, bpm - 5)} BPM y recupera la limpieza.`,
        nextBpm: Math.max(exercise.startBpm, bpm - 5),
      };
    }
    return {
      action: 'repeat',
      headlineEs: 'Aísla el fragmento',
      detailEs: 'Toca solo 4 notas a la vez, muy lento, hasta que salgan todas correctas; luego únelas.',
    };
  }

  // 5) Timing dispersion / tendency.
  if (
    metrics.rushing ||
    metrics.dragging ||
    (metrics.timingStdMs ?? 0) > criteria.maxTimingStdMs
  ) {
    return {
      action: 'slow-and-count',
      headlineEs: metrics.rushing ? 'No corras' : 'No te quedes atrás',
      detailEs: metrics.rushing
        ? 'Vas por delante del metrónomo. Espera el clic y toca con él: cuenta en voz alta.'
        : 'Vas por detrás del metrónomo. Anticipa un poco el siguiente traste y escucha el clic.',
    };
  }

  // 6) Regularity drills (repeated notes): uneven attack.
  if (exercise.verification === 'regularity' && (metrics.levelStd ?? 0) > MAX_LEVEL_STD) {
    return {
      action: 'even-attacks',
      headlineEs: 'Iguala el volumen',
      detailEs: 'Las notas no suenan todas igual: alterna los dedos sin repetir y busca el mismo volumen en cada una.',
    };
  }

  // 7) Clean pass: apply the tempo policy.
  if (
    metrics.accuracy >= criteria.minAccuracy &&
    passStreak + 1 >= criteria.cleanPassesToIncrease
  ) {
    if (bpm < exercise.targetBpm) {
      const nextBpm = Math.min(exercise.targetBpm, bpm + 5);
      return {
        action: 'increase-tempo',
        headlineEs: '¡Bien! Subimos +5 BPM',
        detailEs: `Tres pasadas limpias seguidas: prueba a ${nextBpm} BPM.`,
        nextBpm,
      };
    }
    return {
      action: 'repeat',
      headlineEs: '🏆 Objetivo alcanzado',
      detailEs: `Ya tocas a ${bpm} BPM (objetivo del ejercicio). Mantenlo y pasa a otro ejercicio.`,
    };
  }

  // 8) Repeated failures below the target → lower the tempo.
  if (failStreak >= criteria.failsToDecrease && bpm > exercise.startBpm) {
    return {
      action: 'decrease-tempo',
      headlineEs: 'Volvemos −5 BPM',
      detailEs: 'Dos intentos con errores: consolida el tempo anterior antes de volver a subir.',
      nextBpm: Math.max(exercise.startBpm, bpm - 5),
    };
  }

  // 9) Nothing wrong, just needs consolidation.
  return {
    action: 'repeat',
    headlineEs: 'Repite para consolidar',
    detailEs: `Vas en el tempo correcto (${bpm} BPM). Repite el pase intentando reducir la desviación de tiempo.`,
  };
}
