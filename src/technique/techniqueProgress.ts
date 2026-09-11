/**
 * Technique progress persistence (localStorage): best tempo, best accuracy,
 * pass/fail streaks and how many passes were completed per exercise.
 */

import type { ProgressStorage } from '../chords/progress';

export const TECHNIQUE_PROGRESS_KEY = 'guitai.technique.progress.v1';

export interface TechniqueRecord {
  /** Highest tempo with a clean pass. */
  bestBpm: number;
  /** Tempo the learner was working at (resume point across sessions). */
  currentBpm: number;
  /** Best accuracy achieved at `bestBpm` (0…1). */
  bestAccuracy: number;
  /** Best (lowest) timing dispersion achieved. */
  bestTimingStdMs: number | null;
  /** Consecutive clean passes so far (tempo policy). */
  passStreak: number;
  /** Consecutive failed passes so far. */
  failStreak: number;
  /** Total passes attempted. */
  passesCompleted: number;
  /** Last time this exercise was practised (ms since epoch). */
  updatedAtMs: number;
}

export function emptyRecord(): TechniqueRecord {
  return {
    bestBpm: 0,
    currentBpm: 0,
    bestAccuracy: 0,
    bestTimingStdMs: null,
    passStreak: 0,
    failStreak: 0,
    passesCompleted: 0,
    updatedAtMs: 0,
  };
}

export function loadTechniqueRecords(storage: ProgressStorage): Record<string, TechniqueRecord> {
  const raw = storage.getItem(TECHNIQUE_PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, TechniqueRecord> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = sanitizeRecord(value);
      if (record) result[id] = record;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveTechniqueRecord(
  storage: ProgressStorage,
  exerciseId: string,
  record: TechniqueRecord,
): void {
  const records = loadTechniqueRecords(storage);
  records[exerciseId] = record;
  storage.setItem(TECHNIQUE_PROGRESS_KEY, JSON.stringify(records));
}

export function techniqueRecord(
  storage: ProgressStorage,
  exerciseId: string,
): TechniqueRecord {
  return loadTechniqueRecords(storage)[exerciseId] ?? emptyRecord();
}

/** Store adapter for the session. */
export interface TechniqueProgressStore {
  get(exerciseId: string): TechniqueRecord;
  set(exerciseId: string, record: TechniqueRecord): void;
}

export function techniqueProgressStore(storage: ProgressStorage): TechniqueProgressStore {
  return {
    get: (exerciseId) => techniqueRecord(storage, exerciseId),
    set: (exerciseId, record) => saveTechniqueRecord(storage, exerciseId, record),
  };
}

function sanitizeRecord(value: unknown): TechniqueRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const number = (key: string, fallback: number) => {
    const n = raw[key];
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  };
  const bestTiming = raw.bestTimingStdMs;
  return {
    bestBpm: Math.max(0, Math.round(number('bestBpm', 0))),
    currentBpm: Math.max(0, Math.round(number('currentBpm', 0))),
    bestAccuracy: Math.min(1, Math.max(0, number('bestAccuracy', 0))),
    bestTimingStdMs:
      typeof bestTiming === 'number' && Number.isFinite(bestTiming) ? bestTiming : null,
    passStreak: Math.max(0, Math.round(number('passStreak', 0))),
    failStreak: Math.max(0, Math.round(number('failStreak', 0))),
    passesCompleted: Math.max(0, Math.round(number('passesCompleted', 0))),
    updatedAtMs: Math.max(0, number('updatedAtMs', 0)),
  };
}
