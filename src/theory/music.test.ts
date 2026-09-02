import { describe, expect, it } from 'vitest';
import {
  A4_FREQUENCY_HZ,
  centsBetween,
  frequencyFromCentsOffset,
  frequencyToMidi,
  midiToFrequency,
  midiToNoteName,
} from './music';

describe('midiToFrequency', () => {
  it('maps A4 (69) to 440 Hz exactly', () => {
    expect(midiToFrequency(69)).toBe(440);
  });

  it('matches the standard guitar open strings', () => {
    // Spec table: E2 82.41, A2 110.00, D3 146.83, G3 196.00, B3 246.94, E4 329.63
    const expected = [
      [40, 82.41],
      [45, 110.0],
      [50, 146.83],
      [55, 196.0],
      [59, 246.94],
      [64, 329.63],
    ] as const;
    for (const [midi, hz] of expected) {
      expect(midiToFrequency(midi)).toBeCloseTo(hz, 2);
    }
  });

  it('doubles frequency every octave', () => {
    expect(midiToFrequency(69 + 12)).toBeCloseTo(A4_FREQUENCY_HZ * 2, 10);
    expect(midiToFrequency(69 - 12)).toBeCloseTo(A4_FREQUENCY_HZ / 2, 10);
  });
});

describe('frequencyToMidi', () => {
  it('inverts midiToFrequency', () => {
    for (const midi of [40, 45, 50, 55, 59, 64, 69, 72]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBe(midi);
    }
  });
});

describe('centsBetween', () => {
  it('is zero for identical frequencies', () => {
    expect(centsBetween(110, 110)).toBe(0);
  });

  it('is 100 cents per semitone and 1200 per octave', () => {
    expect(centsBetween(A4_FREQUENCY_HZ, midiToFrequency(68))).toBeCloseTo(100, 9);
    expect(centsBetween(220, 110)).toBeCloseTo(1200, 9);
  });

  it('is exactly 500 cents between the low E and A strings (perfect fourth)', () => {
    // A2 (110) = 2^(5/12) × E2 (82.4069...) → exactly 500 cents in equal temperament.
    expect(centsBetween(110, midiToFrequency(40))).toBeCloseTo(500, 9);
  });

  it('matches the spec example: 108.7 Hz vs 110 Hz target → ≈ −20.6 cents', () => {
    expect(centsBetween(108.7, 110)).toBeCloseTo(-20.6, 1);
  });

  it('signs positive = sharp, negative = flat', () => {
    expect(centsBetween(111, 110)).toBeGreaterThan(0);
    expect(centsBetween(109, 110)).toBeLessThan(0);
  });
});

describe('frequencyFromCentsOffset', () => {
  it('round-trips with centsBetween', () => {
    const base = 82.4069;
    for (const cents of [-50, -20.6, 0, 13.7, 100]) {
      const out = frequencyFromCentsOffset(base, cents);
      expect(centsBetween(out, base)).toBeCloseTo(cents, 9);
    }
  });

  it('+1200 cents is exactly one octave up', () => {
    expect(frequencyFromCentsOffset(110, 1200)).toBeCloseTo(220, 10);
  });
});

describe('midiToNoteName', () => {
  it('names the standard tuning open strings', () => {
    expect(midiToNoteName(40)).toBe('E2');
    expect(midiToNoteName(45)).toBe('A2');
    expect(midiToNoteName(50)).toBe('D3');
    expect(midiToNoteName(55)).toBe('G3');
    expect(midiToNoteName(59)).toBe('B3');
    expect(midiToNoteName(64)).toBe('E4');
  });

  it('handles sharps, C4, A0 and negative octaves', () => {
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToNoteName(21)).toBe('A0');
    expect(midiToNoteName(0)).toBe('C-1');
  });
});
