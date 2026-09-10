import { describe, expect, it } from 'vitest';
import type { ProgressStorage } from './progress';
import {
  EXERCISE_BEST_KEY,
  exerciseBestStore,
  loadExerciseBests,
  saveExerciseBest,
} from './exerciseProgress';

function memoryStorage(): ProgressStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('exercise best scores', () => {
  it('starts empty and stores bests per exercise', () => {
    const storage = memoryStorage();
    expect(loadExerciseBests(storage)).toEqual({});
    saveExerciseBest(storage, 'em-am', 42);
    saveExerciseBest(storage, 'loop-a-d-e', 80);
    expect(loadExerciseBests(storage)).toEqual({ 'em-am': 42, 'loop-a-d-e': 80 });
  });

  it('exposes an ExerciseBestStore adapter', () => {
    const storage = memoryStorage();
    const store = exerciseBestStore(storage);
    expect(store.getBest('em-am')).toBeUndefined();
    store.setBest('em-am', 30);
    expect(store.getBest('em-am')).toBe(30);
  });

  it('recovers from corrupt or unexpected stored data', () => {
    const storage = memoryStorage();
    storage.setItem(EXERCISE_BEST_KEY, '{not json');
    expect(loadExerciseBests(storage)).toEqual({});
    storage.setItem(EXERCISE_BEST_KEY, JSON.stringify([1, 2, 3]));
    expect(loadExerciseBests(storage)).toEqual({});
    storage.setItem(EXERCISE_BEST_KEY, JSON.stringify({ ok: 40, bad: 'x', negative: -5 }));
    expect(loadExerciseBests(storage)).toEqual({ ok: 40 });
  });
});
