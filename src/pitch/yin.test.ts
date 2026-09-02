import { describe, expect, it } from 'vitest';
import { synthesizeNoise, synthesizeTone } from '../testing/synth';
import { detectPitch } from './yin';

const FRAME = 4096; // matches the engine's analyser fftSize (~93 ms @ 44.1 kHz)

/**
 * Guitar-like tone: harmonic series whose 2nd partial is *stronger* than the
 * fundamental — the classic trap for naive peak-picking detectors, because the
 * strongest spectral component is then not the fundamental.
 */
function guitarish(fundamental: number, sampleRate: number, sampleCount: number) {
  return synthesizeTone({
    frequency: fundamental,
    sampleRate,
    sampleCount,
    partialGains: [0.6, 1.0, 0.5, 0.35, 0.25, 0.2, 0.15],
    decaySeconds: 0.6,
    noiseAmplitude: 0.004,
    seed: 11,
  });
}

describe('detectPitch — rejection of unpitched frames', () => {
  it('returns null for digital silence', () => {
    expect(detectPitch(new Float32Array(FRAME), 44100)).toBeNull();
  });

  it('returns null for pure DC (after mean removal there is no signal)', () => {
    const dc = new Float32Array(FRAME).fill(0.5);
    expect(detectPitch(dc, 44100)).toBeNull();
  });

  it('returns null for white noise (no periodicity)', () => {
    expect(detectPitch(synthesizeNoise(FRAME, 0.5, 1), 44100)).toBeNull();
    expect(detectPitch(synthesizeNoise(FRAME, 0.5, 42), 44100)).toBeNull();
  });
});

describe('detectPitch — accuracy on clean signals', () => {
  it('finds a pure 110 Hz sine within ±0.3 Hz', () => {
    const buf = synthesizeTone({
      frequency: 110,
      sampleRate: 44100,
      sampleCount: FRAME,
      partialGains: [1],
      seed: 3,
    });
    const result = detectPitch(buf, 44100);
    expect(result).not.toBeNull();
    expect(result!.frequency).toBeCloseTo(110, 1);
  });

  it('reports near-perfect periodicity for a pure sine', () => {
    const buf = synthesizeTone({
      frequency: 220,
      sampleRate: 44100,
      sampleCount: FRAME,
      partialGains: [1],
      seed: 3,
    });
    const result = detectPitch(buf, 44100);
    expect(result!.periodicity).toBeLessThan(0.3);
  });

  it('survives low amplitudes (quiet playing)', () => {
    const buf = synthesizeTone({
      frequency: 110,
      sampleRate: 44100,
      sampleCount: FRAME,
      partialGains: [1],
      amplitude: 0.02,
      noiseAmplitude: 0.0005,
      seed: 9,
    });
    expect(detectPitch(buf, 44100)?.frequency).toBeCloseTo(110, 1);
  });
});

describe('detectPitch — harmonic robustness (the guitar problem)', () => {
  it('returns the fundamental for a low E with a dominant 2nd harmonic', () => {
    const buf = guitarish(82.4069, 44100, FRAME);
    const result = detectPitch(buf, 44100);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.frequency - 82.4069)).toBeLessThan(1.0);
    // Must NOT lock onto the stronger 164.8 Hz partial:
    expect(Math.abs(result!.frequency - 164.8)).toBeGreaterThan(20);
  });

  it('returns the fundamental for a high E (E4) with strong harmonics', () => {
    const buf = guitarish(329.6276, 44100, FRAME);
    const result = detectPitch(buf, 44100);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.frequency - 329.6276)).toBeLessThan(2.0);
  });

  it('tracks a detuned A2 (≈108.7 Hz, −20.6¢ from target)', () => {
    const buf = guitarish(108.7, 44100, FRAME);
    const result = detectPitch(buf, 44100);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.frequency - 108.7)).toBeLessThan(1.0);
  });

  it('handles a 48 kHz sample rate for the lowest string', () => {
    const buf = guitarish(82.4069, 48000, FRAME);
    const result = detectPitch(buf, 48000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.frequency - 82.4069)).toBeLessThan(1.0);
  });
});
