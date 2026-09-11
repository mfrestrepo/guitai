import { describe, expect, it } from 'vitest';
import { noteAt, techniqueExerciseById } from './exercises';
import {
  FINGER_NAMES,
  STRING_LABELS,
  TECHNIQUE_START_GUIDE,
  fingerName,
  instructionForNote,
  stringLabel,
} from './instructions';

describe('finger and string vocabulary', () => {
  it('names the fingers in Spanish', () => {
    expect(FINGER_NAMES[1]).toBe('índice');
    expect(FINGER_NAMES[2]).toBe('medio');
    expect(FINGER_NAMES[3]).toBe('anular');
    expect(FINGER_NAMES[4]).toBe('meñique');
    expect(fingerName(undefined)).toBeNull();
  });

  it('describes the strings, hinting the extremes', () => {
    expect(STRING_LABELS[1]).toContain('más fina');
    expect(STRING_LABELS[6]).toContain('más gruesa');
    expect(stringLabel(3)).toBe('3ª');
  });
});

describe('instructionForNote', () => {
  it('tells finger, fret and string for a fretted note', () => {
    const instruction = instructionForNote(noteAt(1, 1, 1));
    expect(instruction.primary).toBe('Dedo 1 (índice) · traste 1 · cuerda 1ª (la más fina)');
    expect(instruction.secondary).toContain('Nota F4');
    expect(instruction.fingerName).toBe('índice');
    expect(instruction.short).toBe('1ª · T1 · D1');
  });

  it('explains an open string without finger numbers', () => {
    const instruction = instructionForNote(noteAt(2, 0));
    expect(instruction.primary).toContain('al aire');
    expect(instruction.primary).toContain('sin pisar');
    expect(instruction.secondary).toBe('Nota B3');
    expect(instruction.short).toBe('2ª · aire');
  });

  it('still gives a position when the exercise does not prescribe a finger', () => {
    const instruction = instructionForNote(noteAt(4, 3));
    expect(instruction.primary).toBe('Traste 3 · cuerda 4ª');
    expect(instruction.fingerName).toBeNull();
  });

  it('never shows a raw note name as the main instruction', () => {
    for (const note of [noteAt(1, 2, 2), noteAt(3, 0), noteAt(6, 4, 4)]) {
      const instruction = instructionForNote(note);
      expect(instruction.primary).not.toMatch(/^[A-G]#?\d/);
    }
  });

  it('describes the chromatic drill exactly as advertised', () => {
    const exercise = techniqueExerciseById('chromatic-low-strings')!;
    const first = instructionForNote(exercise.notes[0]); // 6th string, fret 1, finger 1
    expect(first.primary).toContain('Dedo 1 (índice)');
    expect(first.primary).toContain('traste 1');
    expect(first.primary).toContain('6ª');

    const third = instructionForNote(exercise.notes[2]); // fret 3, finger 3
    expect(third.primary).toContain('Dedo 3 (anular)');
    expect(third.primary).toContain('traste 3');
  });

  it('gives the scale fingerings from the catalog', () => {
    const scale = techniqueExerciseById('scale-c-major-1oct')!;
    // C3 = 5th string, fret 3, finger 3.
    expect(instructionForNote(scale.notes[0]).primary).toContain('Dedo 3 (anular)');
    // D3 = 4th string open.
    expect(instructionForNote(scale.notes[1]).primary).toContain('al aire');
  });
});

describe('start guide', () => {
  it('explains how to begin in four visual steps', () => {
    expect(TECHNIQUE_START_GUIDE).toHaveLength(4);
    const text = TECHNIQUE_START_GUIDE.map((step) => `${step.titleEs} ${step.detailEs}`).join(' ');
    expect(text).toContain('Empezar');
    expect(text).toContain('4 clics');
    expect(text).toContain('¡ya!');
    for (const step of TECHNIQUE_START_GUIDE) {
      expect(step.icon.length).toBeGreaterThan(0);
      expect(step.detailEs.length).toBeGreaterThan(15);
    }
  });
});
