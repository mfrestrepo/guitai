import { describe, expect, it } from 'vitest';
import { chordById, expectedFrequency } from './catalog';
import { CLOSE_CENTS, OK_CENTS, evaluateStringNote, isCorrect } from './evaluate';

const em = chordById('em')!; // low E open = E2 (82.4 Hz), 5th string = B2 (fret 2)

/** Expected frequency of one of the chord's strings (throws if muted). */
function expectedOf(string: number): number {
  return expectedFrequency(em, string as never)!;
}

/** Frequency `cents` away from the expected pitch of `string`. */
function at(string: number, cents: number): number {
  return expectedOf(string) * 2 ** (cents / 1200);
}

describe('evaluateStringNote', () => {
  it('accepts the exact expected pitch', () => {
    const check = evaluateStringNote(em, 6, at(6, 0));
    expect(check.kind).toBe('ok');
    expect(check.expectedName).toBe('E2');
    expect(check.cents).toBeCloseTo(0, 9);
    expect(check.detectedFrequency).toBeCloseTo(expectedOf(6), 9);
  });

  it('accepts a slightly detuned guitar inside ±OK_CENTS', () => {
    expect(evaluateStringNote(em, 6, at(6, 30)).kind).toBe('ok');
    expect(evaluateStringNote(em, 6, at(6, -30)).kind).toBe('ok');
  });

  it('reports "almost" just past the OK band and up to CLOSE_CENTS', () => {
    expect(evaluateStringNote(em, 6, at(6, OK_CENTS + 1)).kind).toBe('almost');
    expect(evaluateStringNote(em, 6, at(6, -OK_CENTS - 5)).kind).toBe('almost');
    expect(evaluateStringNote(em, 6, at(6, CLOSE_CENTS - 1)).kind).toBe('almost');
    expect(evaluateStringNote(em, 6, at(6, CLOSE_CENTS + 1)).kind).toBe('wrong');
    expect(evaluateStringNote(em, 6, at(6, -CLOSE_CENTS - 1)).kind).toBe('wrong');
  });

  it('flags a wrong note (one semitone off) as wrong', () => {
    // Playing the open A string (110 Hz) where the low E (82.4 Hz) should sound.
    const check = evaluateStringNote(em, 6, 110);
    expect(check.kind).toBe('wrong');
    expect(check.detectedName).toBe('A2');
    expect(check.cents).toBeGreaterThan(300);
  });

  it('signs cents correctly (sharp positive, flat negative)', () => {
    expect(evaluateStringNote(em, 6, at(6, 10)).cents).toBeGreaterThan(0);
    expect(evaluateStringNote(em, 6, at(6, -10)).cents).toBeLessThan(0);
  });

  it('isCorrect() follows the ok band', () => {
    expect(isCorrect(em, 6, at(6, 40))).toBe(true);
    expect(isCorrect(em, 6, at(6, 100))).toBe(false);
  });

  it('checks fretted strings too (5th string of Em should be B2)', () => {
    const check = evaluateStringNote(em, 5, at(5, 0));
    expect(check.expectedName).toBe('B2');
    expect(check.kind).toBe('ok');
  });

  it('throws when asked to validate a muted string', () => {
    const a = chordById('a')!; // 6th string muted
    expect(() => evaluateStringNote(a, 6, 82.4)).toThrow(/muted/);
  });
});
