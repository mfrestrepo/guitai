/**
 * Lightweight progress persistence (localStorage) for the chord lessons.
 *
 * A tiny storage-adapter interface keeps this unit-testable in Node, where
 * localStorage does not exist (see `progress.test.ts`, which uses memory).
 */

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROGRESS_KEY = 'guitai.chords.learned.v1';

const NULL_STORAGE: ProgressStorage = {
  getItem: () => null,
  setItem: () => undefined,
};

/** Wrap localStorage with a safe fallback (private mode / file:// etc.). */
export function browserProgressStorage(): ProgressStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw (storage disabled); fall back to a no-op.
  }
  return NULL_STORAGE;
}

export function loadLearnedChordIds(storage: ProgressStorage): Set<string> {
  const raw = storage.getItem(PROGRESS_KEY);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === 'string'));
  } catch {
    // Corrupt value → start clean.
  }
  return new Set();
}

export function isChordLearned(storage: ProgressStorage, chordId: string): boolean {
  return loadLearnedChordIds(storage).has(chordId);
}

export function markChordLearned(storage: ProgressStorage, chordId: string): Set<string> {
  const learned = loadLearnedChordIds(storage);
  learned.add(chordId);
  storage.setItem(PROGRESS_KEY, JSON.stringify([...learned].sort()));
  return learned;
}

export function learnedCount(storage: ProgressStorage, allIds: readonly string[]): number {
  const learned = loadLearnedChordIds(storage);
  return allIds.filter((id) => learned.has(id)).length;
}
