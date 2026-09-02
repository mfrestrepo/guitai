import { describe, expect, it } from 'vitest';
import { PitchSmoother } from './smoother';

const approx = (actual: number | null, expected: number, digits = 6) => {
  expect(actual).not.toBeNull();
  expect(actual!).toBeCloseTo(expected, digits);
};

describe('PitchSmoother', () => {
  it('adopts the first voiced frame immediately (low latency)', () => {
    const s = new PitchSmoother();
    approx(s.push(110), 110);
  });

  it('converges to a steady repeated pitch', () => {
    const s = new PitchSmoother();
    let out: number | null = null;
    for (let i = 0; i < 10; i++) out = s.push(110);
    approx(out, 110);
  });

  it('averages small measurement jitter instead of bouncing', () => {
    const s = new PitchSmoother();
    // ±0.5 Hz @110 Hz ≈ ±7.9¢ — above the ±5¢ "in tune" band edge, so an
    // unsmoothed tuner would flicker between in-tune and out. The smoother
    // must keep the output inside the band (|cents| < 5).
    const cents = (hz: number) => 1200 * Math.log2(hz / 110);
    let out: number | null = null;
    const readings: number[] = [];
    for (let i = 0; i < 60; i++) {
      out = s.push(i % 2 === 0 ? 110.4 : 109.6);
      if (out !== null) readings.push(cents(out));
    }
    expect(readings.length).toBe(60);
    // Midpoint of the two alternates is 110.0 → 0¢; averaged output must land
    // within the in-tune band (±5¢), not follow each frame's swing.
    const last = readings[readings.length - 1];
    expect(Math.abs(last)).toBeLessThan(5);
  });

  it('rejects a single wild spike (e.g. a burst of noise)', () => {
    const s = new PitchSmoother();
    s.push(110);
    s.push(110);
    const before = s.push(110);
    const during = s.push(2000); // ~2.5 octaves away — must be ignored
    const after = s.push(110);
    expect(during!).toBeCloseTo(before!, 6);
    expect(after!).toBeCloseTo(before!, 6);
  });

  it('holds the note through a short silence (string ringing out / gap < ~100 ms)', () => {
    const s = new PitchSmoother();
    s.push(110);
    s.push(110);
    const hold = s.push(null);
    expect(hold!).toBeCloseTo(110, 6);
    expect(s.push(110)).not.toBeNull();
  });

  it('goes idle after sustained silence and re-locks on the next note', () => {
    const s = new PitchSmoother();
    s.push(110);
    s.push(110);
    s.push(null);
    s.push(null);
    expect(s.push(null)).toBeNull(); // 3rd consecutive silence → idle
    expect(s.push(null)).toBeNull();
    approx(s.push(146.83), 146.83); // fresh note adopted immediately
  });

  it('follows a real string change after ~3 sustained out-of-range frames', () => {
    const s = new PitchSmoother();
    s.push(110);
    s.push(110);
    s.push(110);
    // Frame 1-2: jump of ~500¢ (A2 → E2) is held (treated as possible glitch).
    approx(s.push(82.4069), 110, 4);
    approx(s.push(82.4069), 110, 4);
    // Frame 3: sustained → retune to the new note.
    approx(s.push(82.4069), 82.4069, 4);
    approx(s.push(82.4069), 82.4069, 4);
  });

  it('smooths exponentially rather than jumping to each new value', () => {
    const s = new PitchSmoother();
    s.push(110);
    // Move 20¢ sharp in one frame; response should be a partial step, not 20¢.
    const moved = s.push(110 * 2 ** (20 / 1200));
    const movedCents = 1200 * Math.log2((moved as number) / 110);
    expect(movedCents).toBeGreaterThan(0);
    expect(movedCents).toBeLessThan(20);
  });

  it('reset() forgets the current note', () => {
    const s = new PitchSmoother();
    s.push(110);
    s.push(110);
    s.reset();
    approx(s.push(110), 110); // fresh anchor, no memory
  });
});
