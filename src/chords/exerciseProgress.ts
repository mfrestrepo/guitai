/**
 * Best-score persistence for the chord-change exercises (localStorage).
 * Mirrors the chord-course progress module: a tiny storage adapter keeps it
 * testable in Node, and corrupt data never breaks the UI.
 */

import type { ExerciseBestStore } from './exerciseSession';
import type { ProgressStorage } from './progress';

export const EXERCISE_BEST_KEY = 'guitai.changes.best.v1';

export function loadExerciseBests(storage: ProgressStorage): Record<string, number> {
  const raw = storage.getItem(EXERCISE_BEST_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          result[key] = value;
        }
      }
      return result;
    }
  } catch {
    // corrupt → start clean
  }
  return {};
}

export function saveExerciseBest(storage: ProgressStorage, exerciseId: string, value: number): void {
  const bests = loadExerciseBests(storage);
  bests[exerciseId] = value;
  storage.setItem(EXERCISE_BEST_KEY, JSON.stringify(bests));
}

/** Store adapter for {@link ExerciseSession}. */
export function exerciseBestStore(storage: ProgressStorage): ExerciseBestStore {
  return {
    getBest: (exerciseId) => loadExerciseBests(storage)[exerciseId],
    setBest: (exerciseId, value) => saveExerciseBest(storage, exerciseId, value),
  };
}
