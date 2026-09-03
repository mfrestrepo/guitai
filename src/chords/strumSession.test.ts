import { describe, expect, it } from 'vitest';
import { synthesizeChord } from '../testing/synth';
import { chordById } from './catalog';
import { StrumMicSession } from './strumSession';
import { STRUM_FRAME_SIZE } from './strumCheck';

const SR = 44100;
const T = 100;

function soundingFrequencies(chordId: string): number[] {
  const chord = chordById(chordId)!;
  return chord.strings
    .filter((s) => s.fret !== null)
    .map((s) => {
      const midi = [0, 64, 59, 55, 50, 45, 40][s.number] + (s.fret ?? 0);
      return 440 * 2 ** ((midi - 69) / 12);
    });
}

function strumFrame(frequencies: number[]): Float32Array {
  return synthesizeChord({
    frequencies,
    sampleRate: SR,
    sampleCount: STRUM_FRAME_SIZE,
    amplitude: 0.4,
    noiseAmplitude: 0.002,
    seed: 7,
  });
}

describe('StrumMicSession with the verdict gate', () => {
  it('waits for consistent sound before publishing "correct"', () => {
    const session = new StrumMicSession({ onChange: () => undefined });
    expect(session.beginSession('em')).toBe(true);
    const frame = strumFrame(soundingFrequencies('em'));
    let now = Date.now() - 5000;

    // A few frames in, still nothing readable:
    for (let i = 0; i < 8; i++) {
      now += T;
      session.feedFrame(frame, SR, now);
      expect(session.snapshot().stage).toBe('listening');
      expect(session.snapshot().verdict).toBeNull();
    }
    // After enough consistent frames the verdict appears (and stays):
    for (let i = 0; i < 12; i++) {
      now += T;
      session.feedFrame(frame, SR, now);
    }
    const snapshot = session.snapshot();
    expect(snapshot.stage).toBe('verdict');
    expect(snapshot.verdict).toBe('correct');

    // More clean frames must NOT re-publish or flicker:
    for (let i = 0; i < 10; i++) {
      now += T;
      session.feedFrame(frame, SR, now);
    }
    expect(session.snapshot().verdict).toBe('correct');
  });

  it('publishes a stable "issues" verdict for a strum missing a string', () => {
    const session = new StrumMicSession({ onChange: () => undefined });
    expect(session.beginSession('em')).toBe(true);
    const all = soundingFrequencies('em');
    const missingG = all.filter((f) => Math.abs(f - 196) > 1);
    const frame = strumFrame(missingG);
    let now = Date.now() - 5000;

    for (let i = 0; i < 20; i++) {
      now += T;
      session.feedFrame(frame, SR, now);
    }
    const snapshot = session.snapshot();
    expect(snapshot.stage).toBe('verdict');
    expect(snapshot.verdict).toBe('issues');
    expect(snapshot.issues.some((issue) => issue.kind === 'missing')).toBe(true);
  });
});
