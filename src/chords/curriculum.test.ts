import { describe, expect, it } from 'vitest';
import { CHANGE_DRILLS, CHORD_LEVELS, curriculumChordIds } from './curriculum';
import { chordById } from './catalog';

describe('curriculum integrity', () => {
  it('every referenced chord id exists in the catalog', () => {
    for (const id of curriculumChordIds()) {
      expect(chordById(id), `chord ${id} must exist`).toBeDefined();
    }
  });

  it('every referenced drill exists', () => {
    for (const level of CHORD_LEVELS) {
      for (const drillId of level.drillIds) {
        expect(
          CHANGE_DRILLS.some((d) => d.id === drillId),
          `drill ${drillId} of ${level.id} must exist`,
        ).toBe(true);
      }
    }
  });

  it('levels progress from easy open chords to change drills', () => {
    expect(CHORD_LEVELS[0].chordIds).toEqual(['em', 'e', 'am', 'a', 'd']);
    expect(CHORD_LEVELS[1].chordIds).toEqual(['c', 'g']);
    expect(CHORD_LEVELS[2].chordIds).toEqual([]);
    expect(CHORD_LEVELS[2].drillIds).toEqual(['ade', 'gcd', 'ecgd']);
    expect(CHORD_LEVELS.flatMap((l) => l.chordIds).length).toBe(7);
  });

  it('drills reuse only chords taught in the curriculum, ordered sensibly', () => {
    const known = new Set(curriculumChordIds());
    const ade = CHANGE_DRILLS.find((d) => d.id === 'ade')!;
    expect(ade.chordIds).toEqual(['a', 'd', 'e']);
    for (const id of CHANGE_DRILLS.flatMap((d) => d.chordIds)) {
      expect(known.has(id)).toBe(true);
    }
  });

  it('curriculumChordIds returns each chord once in teaching order', () => {
    expect(curriculumChordIds()).toEqual(['em', 'e', 'am', 'a', 'd', 'c', 'g']);
  });
});
