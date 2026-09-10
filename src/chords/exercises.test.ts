import { describe, expect, it } from 'vitest';
import { chordById } from './catalog';
import {
  CHORD_EXERCISES,
  EXERCISE_LEVELS,
  anchorFingerTip,
  exerciseById,
  exercisesByLevel,
  isTwoChordDrill,
  sharedFingers,
} from './exercises';

describe('chord exercise catalog', () => {
  it('covers every difficulty level with several exercises', () => {
    for (const level of EXERCISE_LEVELS) {
      expect(exercisesByLevel(level.id).length, `level ${level.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('has sane metronome settings for every exercise', () => {
    for (const exercise of CHORD_EXERCISES) {
      expect([1, 2, 4, 8]).toContain(exercise.beatsPerChord);
      expect(exercise.startBpm).toBeGreaterThanOrEqual(40);
      expect(exercise.startBpm).toBeLessThanOrEqual(140);
      if (exercise.targetBpm !== undefined) {
        expect(exercise.targetBpm).toBeGreaterThanOrEqual(exercise.startBpm);
      }
    }
  });

  it('includes the researched drill types (1-minute, air changes, loops, random)', () => {
    const kinds = new Set(CHORD_EXERCISES.map((e) => e.kind));
    expect(kinds.has('one-minute')).toBe(true);
    expect(kinds.has('air-changes')).toBe(true);
    expect(kinds.has('loop')).toBe(true);
    expect(kinds.has('random')).toBe(true);
    expect(kinds.has('pivot')).toBe(true);
  });

  it('references only chords that exist in the catalog', () => {
    for (const exercise of CHORD_EXERCISES) {
      for (const chordId of exercise.chordIds) {
        expect(chordById(chordId), `${exercise.id} → ${chordId}`).toBeDefined();
      }
    }
  });

  it('one-minute drills have a target and a duration', () => {
    for (const exercise of CHORD_EXERCISES.filter((e) => e.kind === 'one-minute')) {
      expect(exercise.targetChanges).toBeGreaterThan(0);
      expect(exercise.durationSeconds).toBe(60);
      expect(exercise.chordIds).toHaveLength(2);
    }
  });

  it('air-change drills are marked silent (no microphone validation)', () => {
    const airChanges = CHORD_EXERCISES.filter((e) => e.kind === 'air-changes');
    expect(airChanges.length).toBeGreaterThan(0);
    for (const exercise of airChanges) expect(exercise.silent).toBe(true);
  });

  it('finds exercises by id and flags two-chord pivot drills', () => {
    expect(exerciseById('em-am')?.title).toBe('Em ↔ Am');
    expect(exerciseById('nope')).toBeUndefined();
    expect(isTwoChordDrill(exerciseById('em-am')!)).toBe(true);
    expect(isTwoChordDrill(exerciseById('loop-a-d-e')!)).toBe(false);
  });

  it('groups levels from easiest to hardest', () => {
    expect(EXERCISE_LEVELS.map((l) => l.id)).toEqual(['muy-facil', 'facil', 'medio', 'dificil']);
    const veryEasy = exercisesByLevel('muy-facil').map((e) => e.id);
    expect(veryEasy).toContain('em-am');
    expect(veryEasy).toContain('one-minute-em-am');
  });
});

describe('shared fingers (anchor / pivot detection)', () => {
  it('finds the fingers that Am and C share (index + middle)', () => {
    // Am: string 4 fret 2 (finger 2) and string 2 fret 1 (finger 1).
    // C : string 4 fret 2 (finger 2) and string 2 fret 1 (finger 1).
    const shared = sharedFingers(chordById('am')!, chordById('c')!);
    const fingers = shared.map((f) => f.finger).sort((a, b) => a - b);
    expect(fingers).toEqual([1, 2]);
    expect(shared.find((f) => f.finger === 1)?.stringNumber).toBe(2);
    expect(shared.find((f) => f.finger === 1)?.fret).toBe(1);
  });

  it('reports no anchor when the fingers change string or number', () => {
    // Em moves its fingers 2 and 3 down a string to reach Am, so nothing is
    // literally shared (the tip explains the "one string down" movement).
    expect(sharedFingers(chordById('em')!, chordById('am')!)).toHaveLength(0);
  });

  it('reports nothing when two shapes share no identical finger placement', () => {
    expect(sharedFingers(chordById('g')!, chordById('d')!)).toHaveLength(0);
  });

  it('never reports open strings as anchors', () => {
    const shared = sharedFingers(chordById('em')!, chordById('e')!);
    for (const finger of shared) {
      expect(finger.fret).toBeGreaterThan(0);
      expect(finger.stringNumber).toBeGreaterThan(0);
    }
  });

  it('builds a Spanish anchor-finger tip for the pivot drills', () => {
    const tip = anchorFingerTip(exerciseById('am-c')!);
    expect(tip).toContain('Dedo ancla');
    expect(tip).toContain('los dedos 1 y 2');
    expect(anchorFingerTip(exerciseById('g-d')!)).toBeNull();
    expect(anchorFingerTip(exerciseById('em-am')!)).toBeNull();
  });
});
