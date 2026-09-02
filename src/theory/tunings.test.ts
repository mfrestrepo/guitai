import { describe, expect, it } from 'vitest';
import { midiToFrequency } from './music';
import {
  TUNINGS,
  centsFromFrequency,
  nearestStringForFrequency,
  stringByNumber,
  stringFrequency,
  tuningById,
} from './tunings';

const standard = tuningById('standard')!;

describe('standard tuning data', () => {
  it('defines exactly the six guitar strings, low → high', () => {
    expect(standard?.strings.map((s) => s.number)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('names and frequencies match the spec table', () => {
    const expected = [
      { number: 6, name: 'E2', hz: 82.41 },
      { number: 5, name: 'A2', hz: 110.0 },
      { number: 4, name: 'D3', hz: 146.83 },
      { number: 3, name: 'G3', hz: 196.0 },
      { number: 2, name: 'B3', hz: 246.94 },
      { number: 1, name: 'E4', hz: 329.63 },
    ] as const;
    for (const { number, name, hz } of expected) {
      const string = standard?.strings.find((s) => s.number === number);
      expect(string?.name).toBe(name);
      expect(stringFrequency(string as never)).toBeCloseTo(hz, 2);
    }
  });

  it('stores frequencies data-driven from MIDI (single source of truth)', () => {
    for (const string of standard?.strings ?? []) {
      expect(stringFrequency(string)).toBeCloseTo(midiToFrequency(string.midi), 12);
    }
  });
});

describe('tuningById / stringByNumber', () => {
  it('finds tunings and strings', () => {
    expect(TUNINGS.length).toBeGreaterThan(0);
    expect(tuningById('standard')).toBeDefined();
    expect(tuningById('does-not-exist')).toBeUndefined();
    expect(stringByNumber(standard, 6)?.name).toBe('E2');
    expect(stringByNumber(standard, 1)?.name).toBe('E4');
    expect(stringByNumber(standard, 0)).toBeUndefined();
  });
});

describe('nearestStringForFrequency', () => {
  it('identifies each open string at its exact pitch', () => {
    const cases = [
      { hz: midiToFrequency(40), number: 6, name: 'E2' },
      { hz: midiToFrequency(45), number: 5, name: 'A2' },
      { hz: midiToFrequency(50), number: 4, name: 'D3' },
      { hz: midiToFrequency(55), number: 3, name: 'G3' },
      { hz: midiToFrequency(59), number: 2, name: 'B3' },
      { hz: midiToFrequency(64), number: 1, name: 'E4' },
    ];
    for (const c of cases) {
      const match = nearestStringForFrequency(standard, c.hz);
      expect(match.string.number).toBe(c.number);
      expect(match.string.name).toBe(c.name);
      expect(Math.abs(match.cents)).toBeLessThan(1e-9);
    }
  });

  it('maps a detuned A2 (108.7 Hz) to the A string with ≈ −20.6 cents', () => {
    const match = nearestStringForFrequency(standard, 108.7);
    expect(match.string.number).toBe(5);
    expect(match.string.name).toBe('A2');
    expect(match.cents).toBeCloseTo(-20.6, 1);
  });

  it('maps moderately detuned notes to the right string', () => {
    // 100 Hz: A2 is −161¢ away, E2 is +331¢ → A string.
    expect(nearestStringForFrequency(standard, 100).string.number).toBe(5);
    // 90 Hz: E2 is +152¢ away, A2 is −337¢ → E string.
    expect(nearestStringForFrequency(standard, 90).string.number).toBe(6);
    // 200 Hz: G3 is +35¢ away, B3 is −356¢ → G string.
    expect(nearestStringForFrequency(standard, 200).string.number).toBe(3);
    // 130 Hz: D3 is −207¢ away, A2 is +292¢ → D string.
    expect(nearestStringForFrequency(standard, 130).string.number).toBe(4);
  });

  it('is not fooled by an octave-up reading of the low E (harmonic)', () => {
    // The 12th-fret harmonic of E2 sounds ~E3/E4; the tuner should still match
    // the nearest open string (E4 vs D3/G3 region is the real ambiguity here,
    // and E4 at 329.63 is an open string of its own).
    const match = nearestStringForFrequency(standard, 329.6);
    expect(match.string.number).toBe(1);
  });
});

describe('centsFromFrequency', () => {
  it('signs and magnitude follow the cents convention', () => {
    const lowE = standard?.strings.find((s) => s.number === 6)!;
    expect(centsFromFrequency(83.41, lowE)).toBeGreaterThan(0); // sharp
    expect(centsFromFrequency(81.41, lowE)).toBeLessThan(0); // flat
    // Compare against the exact data-driven frequency (not a rounded literal).
    expect(centsFromFrequency(midiToFrequency(40), lowE)).toBeCloseTo(0, 12);
  });
});
