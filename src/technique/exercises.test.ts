import { describe, expect, it } from 'vitest';
import { midiToNoteName } from '../theory/music';
import {
  TECHNIQUE_EXERCISES,
  TECHNIQUE_LEVELS,
  exerciseNoteLabel,
  expectedTimeMs,
  midiForPosition,
  noteAt,
  passDurationMs,
  stepMsFor,
  techniqueExerciseById,
  techniqueExercisesByLevel,
  uniqueNoteCount,
} from './exercises';

describe('technique exercise catalog', () => {
  it('has exercises in every level', () => {
    for (const level of TECHNIQUE_LEVELS) {
      expect(techniqueExercisesByLevel(level.id).length, level.id).toBeGreaterThan(0);
    }
  });

  it('validates every note against the fretboard (load-time check already ran)', () => {
    for (const exercise of TECHNIQUE_EXERCISES) {
      for (const note of exercise.notes) {
        expect(note.midi).toBe(midiForPosition(note.stringNumber, note.fret));
      }
    }
  });

  it('includes the researched first drills: chromatic, repeated notes and scales', () => {
    const kinds = new Set(TECHNIQUE_EXERCISES.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['chromatic', 'repeated-note', 'scale']));
    expect(techniqueExerciseById('chromatic-low-strings')).toBeDefined();
    expect(techniqueExerciseById('repeated-note-i-m')).toBeDefined();
    expect(techniqueExerciseById('scale-c-major-1oct')).toBeDefined();
    expect(techniqueExerciseById('nope')).toBeUndefined();
  });

  it('builds the chromatic exercise as 1-2-3-4 on each requested string', () => {
    const low = techniqueExerciseById('chromatic-low-strings')!;
    expect(low.notes).toHaveLength(12); // 3 strings × 4 frets
    expect(low.notes.slice(0, 4).map((n) => n.fret)).toEqual([1, 2, 3, 4]);
    expect(low.notes.slice(0, 4).map((n) => n.stringNumber)).toEqual([6, 6, 6, 6]);
    // E2 + 1 = F2
    expect(midiToNoteName(low.notes[0].midi)).toBe('F2');

    const all = techniqueExerciseById('chromatic-all-strings')!;
    expect(all.notes).toHaveLength(24);
    expect(all.notes[23].stringNumber).toBe(1);
    expect(midiToNoteName(all.notes[23].midi)).toBe('G#4');
  });

  it('builds the C major scale up and down in first position', () => {
    const scale = techniqueExerciseById('scale-c-major-1oct')!;
    const labels = scale.notes.map((n) => midiToNoteName(n.midi));
    expect(labels).toEqual([
      'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4',
      'B3', 'A3', 'G3', 'F3', 'E3', 'D3', 'C3',
    ]);
    expect(uniqueNoteCount(scale)).toBe(8);
    // First note: 5th string, 3rd fret (C3).
    expect(scale.notes[0]).toMatchObject({ stringNumber: 5, fret: 3 });
  });

  it('uses strict i-m/i-a drills on a single repeated note', () => {
    const im = techniqueExerciseById('repeated-note-i-m')!;
    expect(im.notes).toHaveLength(8);
    expect(new Set(im.notes.map((n) => n.midi)).size).toBe(1);
    expect(im.verification).toBe('regularity');
    expect(im.tipsEs.join(' ')).toContain('Alternancia');
  });

  it('computes tempo maths (step, pass duration, note times)', () => {
    const scale = techniqueExerciseById('scale-c-major-1oct')!;
    expect(stepMsFor(scale, 60)).toBe(1000);
    expect(expectedTimeMs(scale, 60, 3)).toBe(3000);
    expect(passDurationMs(scale, 60)).toBe(15000);

    const eighth: typeof scale = { ...scale, subdivision: 'eighth' };
    expect(stepMsFor(eighth, 60)).toBe(500);
  });

  it('labels notes and positions', () => {
    const note = noteAt(1, 3);
    expect(note.midi).toBe(67);
    expect(exerciseNoteLabel(note)).toBe('G4');
  });
});
