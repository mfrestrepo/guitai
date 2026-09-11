import { describe, expect, it } from 'vitest';
import { TECHNIQUE_EXERCISES, techniqueExerciseById } from './exercises';
import {
  TECHNIQUE_GLOSSARY,
  explainedExerciseIds,
  explanationFor,
  glossaryTermById,
} from './explanations';

describe('exercise explanations', () => {
  it('explains every catalog exercise', () => {
    const explained = new Set(explainedExerciseIds());
    for (const exercise of TECHNIQUE_EXERCISES) {
      expect(explained.has(exercise.id), `missing explanation for ${exercise.id}`).toBe(true);
    }
  });

  it('gives a plain-language goal and actionable steps (no unexplained jargon)', () => {
    for (const exercise of TECHNIQUE_EXERCISES) {
      const explanation = explanationFor(exercise);
      expect(explanation.goalEs.length).toBeGreaterThan(15);
      expect(explanation.howEs.length).toBeGreaterThanOrEqual(2);
      for (const step of explanation.howEs) {
        expect(step.length).toBeGreaterThan(10);
      }
    }
  });

  it('describes the right-hand alternation for the drills that use it', () => {
    expect(explanationFor(techniqueExerciseById('repeated-note-i-m')!).alternation).toBe('i-m');
    expect(explanationFor(techniqueExerciseById('repeated-note-i-a')!).alternation).toBe('i-a');
    expect(explanationFor(techniqueExerciseById('scale-c-major-1oct')!).alternation).toBe('i-m');
  });

  it('explains the left-hand pattern per exercise kind', () => {
    expect(explanationFor(techniqueExerciseById('chromatic-low-strings')!).leftHand).toBe('chromatic');
    expect(explanationFor(techniqueExerciseById('repeated-note-i-m')!).leftHand).toBe('repeat');
    expect(explanationFor(techniqueExerciseById('scale-g-major-1oct')!).leftHand).toBe('scale');
  });
});

describe('glossary', () => {
  it('defines the jargon used in the module', () => {
    for (const id of ['bpm', 'beat', 'pass', 'im', 'chromatic', 'scale', 'accuracy', 'cents', 'stability', 'pause', 'clean']) {
      const term = glossaryTermById(id);
      expect(term, `missing glossary term ${id}`).toBeDefined();
      expect(term!.meaningEs.length).toBeGreaterThan(20);
    }
  });

  it('uses short labels and icons for the chips', () => {
    for (const term of TECHNIQUE_GLOSSARY) {
      expect(term.termEs.length).toBeLessThan(20);
      expect(term.icon.length).toBeGreaterThan(0);
    }
  });
});
