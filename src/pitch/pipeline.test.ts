/**
 * End-to-end test of the *pure* tuning pipeline with no microphone:
 *
 *   synthesized guitar audio ─▶ detectPitch ─▶ PitchSmoother ─▶ evaluateTuning
 *
 * This mirrors exactly what the engine does per tick (same analyser window,
 * same YIN detector, same smoother defaults) and is how we "play the guitar
 * into" the code in CI — the only thing missing is the Web Audio mic input.
 */

import { describe, expect, it } from 'vitest';
import { synthesizeTone } from '../testing/synth';
import { tuningById, type Tuning } from '../theory/tunings';
import { detectPitch } from './yin';
import { PitchSmoother } from './smoother';
import { evaluateTuning } from '../tuner/evaluator';

const SAMPLE_RATE = 44100;
const WINDOW = 4096;
const HOP = 1470; // ≈33 ms per frame, matching the engine tick cadence

const standard = tuningById('standard')! as Tuning;

function runPipeline(spec: {
  frequency: number;
  partialGains: number[];
  frameCount: number;
}): number[] {
  const totalSamples = WINDOW + (spec.frameCount - 1) * HOP;
  const audio = synthesizeTone({
    frequency: spec.frequency,
    sampleRate: SAMPLE_RATE,
    sampleCount: totalSamples,
    partialGains: spec.partialGains,
    decaySeconds: 2,
    noiseAmplitude: 0.003,
    seed: 7,
  });

  const smoother = new PitchSmoother();
  const smoothed: number[] = [];
  const frame = new Float32Array(WINDOW);
  for (let i = 0; i < spec.frameCount; i++) {
    const offset = i * HOP;
    frame.set(audio.subarray(offset, offset + WINDOW));
    const pitch = detectPitch(frame, SAMPLE_RATE);
    const value = smoother.push(pitch ? pitch.frequency : null);
    if (value !== null) smoothed.push(value);
  }
  return smoothed;
}

describe('tuning pipeline on synthesized guitar audio', () => {
  it('locks onto a well-tuned A2 and reports the A string, in tune', () => {
    // Boosting the 2nd harmonic (1.0) over the fundamental (0.6) keeps the
    // octave-trap active for the whole chain.
    const smoothed = runPipeline({ frequency: 110, partialGains: [0.6, 1.0, 0.5], frameCount: 25 });
    expect(smoothed.length).toBe(25);

    const last = smoothed[smoothed.length - 1];
    const result = evaluateTuning(last, standard);
    expect(result.string.number).toBe(5);
    expect(result.string.name).toBe('A2');
    // Steady-state error after smoothing should be a fraction of a cent.
    expect(Math.abs(result.cents)).toBeLessThan(3);
    expect(result.verdict).toBe('inTune');
  });

  it('reads a detuned A2 (108.7 Hz ≈ −20.6¢) as flat, on the A string', () => {
    const smoothed = runPipeline({ frequency: 108.7, partialGains: [0.6, 1.0, 0.5], frameCount: 25 });
    const last = smoothed[smoothed.length - 1];
    const result = evaluateTuning(last, standard);
    expect(result.string.number).toBe(5);
    expect(result.cents).toBeLessThan(-15);
    expect(result.cents).toBeGreaterThan(-27); // −20.6 ± detector noise
    expect(result.verdict).toBe('flat');
  });

  it('locks onto a low E despite a dominant second harmonic', () => {
    const smoothed = runPipeline({ frequency: 82.4069, partialGains: [0.5, 1.0, 0.6], frameCount: 25 });
    const last = smoothed[smoothed.length - 1];
    const result = evaluateTuning(last, standard);
    expect(result.string.number).toBe(6);
    expect(Math.abs(result.cents)).toBeLessThan(5);
  });

  it('re-locks when the player switches from A2 to low E', () => {
    const first = runPipeline({ frequency: 110, partialGains: [0.6, 1.0, 0.5], frameCount: 20 });
    const second = runPipeline({ frequency: 82.4069, partialGains: [0.5, 1.0, 0.6], frameCount: 20 });

    // Both halves settle onto their own note.
    expect(evaluateTuning(first[first.length - 1], standard).string.number).toBe(5);
    expect(evaluateTuning(second[second.length - 1], standard).string.number).toBe(6);
  });
});
