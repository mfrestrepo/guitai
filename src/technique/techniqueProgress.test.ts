import { describe, expect, it } from 'vitest';
import type { ProgressStorage } from '../chords/progress';
import {
  TECHNIQUE_PROGRESS_KEY,
  emptyRecord,
  loadTechniqueRecords,
  saveTechniqueRecord,
  techniqueProgressStore,
  techniqueRecord,
} from './techniqueProgress';

function memoryStorage(): ProgressStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('technique progress store', () => {
  it('returns an empty record for unknown exercises', () => {
    const storage = memoryStorage();
    expect(techniqueRecord(storage, 'nope')).toEqual(emptyRecord());
    expect(loadTechniqueRecords(storage)).toEqual({});
  });

  it('saves and reloads records per exercise', () => {
    const storage = memoryStorage();
    const record = { ...emptyRecord(), bestBpm: 65, bestAccuracy: 0.97, passesCompleted: 4 };
    saveTechniqueRecord(storage, 'scale-c-major-1oct', record);
    expect(techniqueRecord(storage, 'scale-c-major-1oct')).toMatchObject({
      bestBpm: 65,
      bestAccuracy: 0.97,
      passesCompleted: 4,
    });
  });

  it('exposes a session store adapter', () => {
    const storage = memoryStorage();
    const store = techniqueProgressStore(storage);
    expect(store.get('x').bestBpm).toBe(0);
    store.set('x', { ...emptyRecord(), bestBpm: 70 });
    expect(store.get('x').bestBpm).toBe(70);
  });

  it('recovers from corrupt data and sanitises wrong values', () => {
    const storage = memoryStorage();
    storage.setItem(TECHNIQUE_PROGRESS_KEY, '{not json');
    expect(loadTechniqueRecords(storage)).toEqual({});

    storage.setItem(
      TECHNIQUE_PROGRESS_KEY,
      JSON.stringify({
        ok: { bestBpm: 61.6, bestAccuracy: 3, bestTimingStdMs: 'x', passStreak: -2 },
        bad: 'nope',
        list: [1, 2],
      }),
    );
    const records = loadTechniqueRecords(storage);
    expect(Object.keys(records)).toEqual(['ok']);
    expect(records.ok.bestBpm).toBe(62);
    expect(records.ok.bestAccuracy).toBe(1);
    expect(records.ok.bestTimingStdMs).toBeNull();
    expect(records.ok.passStreak).toBe(0);
  });
});
