import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../theory/music';
import { tuningById, stringFrequency, type Tuning } from '../theory/tunings';
import {
  CLEARLY_OFF_MIN_CENTS,
  IN_TUNE_MAX_CENTS,
  evaluateTuning,
  verdictForCents,
} from './evaluator';

const standard = tuningById('standard')! as Tuning;

/** Frequency offset by `cents` from the low-E string pitch. */
const e2 = (cents: number) => stringFrequency(standard.strings[0]) * 2 ** (cents / 1200);

describe('verdictForCents', () => {
  it('is "in tune" inside ±5 cents and "nearly" up to ±15 cents', () => {
    expect(verdictForCents(0)).toBe('inTune');
    expect(verdictForCents(IN_TUNE_MAX_CENTS)).toBe('inTune'); // boundary inclusive
    expect(verdictForCents(-IN_TUNE_MAX_CENTS)).toBe('inTune');
    expect(verdictForCents(CLEARLY_OFF_MIN_CENTS)).toBe('nearlySharp'); // 15 is still "nearly"
    expect(verdictForCents(-CLEARLY_OFF_MIN_CENTS)).toBe('nearlyFlat');
  });

  it('flags clearly flat/sharp outside ±15 cents', () => {
    expect(verdictForCents(15.01)).toBe('sharp');
    expect(verdictForCents(-15.01)).toBe('flat');
    expect(verdictForCents(50)).toBe('sharp');
    expect(verdictForCents(-1200)).toBe('flat');
  });

  it('distinguishes the sharp and flat sides', () => {
    expect(verdictForCents(7)).toBe('nearlySharp');
    expect(verdictForCents(-7)).toBe('nearlyFlat');
    expect(verdictForCents(30)).toBe('sharp');
    expect(verdictForCents(-30)).toBe('flat');
  });
});

describe('evaluateTuning', () => {
  it('returns an in-tune E2 for the exact low-E frequency', () => {
    const exact = midiToFrequency(40);
    const r = evaluateTuning(exact, standard);
    expect(r.string.number).toBe(6);
    expect(r.string.name).toBe('E2');
    expect(r.cents).toBeCloseTo(0, 9);
    expect(r.verdict).toBe('inTune');
    expect(r.detectedFrequency).toBe(exact);
    expect(r.targetFrequency).toBeCloseTo(exact, 12);
  });

  it('stays in tune within the ±5¢ tolerance', () => {
    // Offset a hair inside the boundary: 2**(5/1200) is not exactly
    // representable, so exact-boundary float equality is tested numerically
    // in `verdictForCents` above instead.
    for (const cents of [-4.9, -2.5, 0, 2.5, 4.9]) {
      expect(evaluateTuning(e2(cents), standard).verdict).toBe('inTune');
    }
  });

  it('is nearly flat/sharp just outside the tolerance', () => {
    expect(evaluateTuning(e2(-8), standard).verdict).toBe('nearlyFlat');
    expect(evaluateTuning(e2(8), standard).verdict).toBe('nearlySharp');
  });

  it('is flat/sharp beyond ±15¢', () => {
    expect(evaluateTuning(e2(-20), standard).verdict).toBe('flat');
    expect(evaluateTuning(e2(20), standard).verdict).toBe('sharp');
  });

  it('matches the spec example: A2 at 108.7 Hz → −20.6 cents, clearly flat', () => {
    const r = evaluateTuning(108.7, standard);
    expect(r.string.name).toBe('A2');
    expect(r.cents).toBeCloseTo(-20.6, 1);
    expect(r.verdict).toBe('flat'); // −20.6 < −15 → below the "nearly" band
  });

  it('identifies the right string automatically for all open strings', () => {
    const expected = [
      { hz: midiToFrequency(40), number: 6 },
      { hz: midiToFrequency(45), number: 5 },
      { hz: midiToFrequency(50), number: 4 },
      { hz: midiToFrequency(55), number: 3 },
      { hz: midiToFrequency(59), number: 2 },
      { hz: midiToFrequency(64), number: 1 },
    ];
    for (const { hz, number } of expected) {
      expect(evaluateTuning(hz, standard).string.number).toBe(number);
    }
  });

  it('honours a manually locked target string even when another is nearer', () => {
    // 108.7 Hz is nearest the A string; force the 6th (E) string instead.
    const r = evaluateTuning(108.7, standard, 6);
    expect(r.string.number).toBe(6);
    expect(r.cents).toBeGreaterThan(400); // ~4+ semitones sharp
    expect(r.verdict).toBe('sharp');
  });

  it('ignores an out-of-range preferred string and falls back to auto', () => {
    const r = evaluateTuning(110, standard, 99);
    expect(r.string.number).toBe(5);
  });
});
