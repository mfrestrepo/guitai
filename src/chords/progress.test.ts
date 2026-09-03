import { describe, expect, it } from 'vitest';
import {
  PROGRESS_KEY,
  browserProgressStorage,
  isChordLearned,
  learnedCount,
  loadLearnedChordIds,
  markChordLearned,
  type ProgressStorage,
} from './progress';

function memoryStorage(): ProgressStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('chord progress', () => {
  it('starts empty and marks chords as learned', () => {
    const store = memoryStorage();
    expect(isChordLearned(store, 'em')).toBe(false);
    markChordLearned(store, 'em');
    markChordLearned(store, 'g');
    expect(isChordLearned(store, 'em')).toBe(true);
    expect(isChordLearned(store, 'g')).toBe(true);
    expect(isChordLearned(store, 'c')).toBe(false);
    expect(loadLearnedChordIds(store)).toEqual(new Set(['em', 'g']));
  });

  it('persists across storage instances (same backend)', () => {
    const backend = new Map<string, string>();
    const store: ProgressStorage = {
      getItem: (k) => backend.get(k) ?? null,
      setItem: (k, v) => {
        backend.set(k, v);
      },
    };
    markChordLearned(store, 'a');
    const reloaded: ProgressStorage = {
      getItem: (k) => backend.get(k) ?? null,
      setItem: () => undefined,
    };
    expect(isChordLearned(reloaded, 'a')).toBe(true);
  });

  it('counts learned chords against a list', () => {
    const store = memoryStorage();
    markChordLearned(store, 'em');
    markChordLearned(store, 'd');
    expect(learnedCount(store, ['em', 'e', 'am', 'a', 'd', 'c', 'g'])).toBe(2);
  });

  it('recovers from corrupt stored data', () => {
    const store = memoryStorage();
    store.setItem(PROGRESS_KEY, '{not json');
    expect(loadLearnedChordIds(store)).toEqual(new Set());
    // Also tolerates wrong shapes:
    store.setItem(PROGRESS_KEY, JSON.stringify({ a: 1 }));
    expect(loadLearnedChordIds(store)).toEqual(new Set());
  });

  it('browser storage falls back safely when localStorage is unavailable', () => {
    const fallback = browserProgressStorage(); // node env: no localStorage
    expect(() => markChordLearned(fallback, 'c')).not.toThrow();
    expect(loadLearnedChordIds(fallback)).toEqual(new Set());
  });
});
