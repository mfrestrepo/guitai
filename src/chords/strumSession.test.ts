import { describe, expect, it } from 'vitest';
import { synthesizeChord } from '../testing/synth';
import { chordById } from './catalog';
import { StrumMicSession } from './strumSession';
import { STRUM_FRAME_SIZE } from './strumCheck';

const SR = 44100;
const T = 60; // session cadence (ms)

function soundingFrequencies(chordId: string): number[] {
  const chord = chordById(chordId)!;
  return chord.strings
    .filter((s) => s.fret !== null)
    .map((s) => {
      const midi = [0, 64, 59, 55, 50, 45, 40][s.number] + (s.fret ?? 0);
      return 440 * 2 ** ((midi - 69) / 12);
    });
}

function strumFrame(frequencies: number[], amplitude = 0.4): Float32Array {
  return synthesizeChord({
    frequencies,
    sampleRate: SR,
    sampleCount: STRUM_FRAME_SIZE,
    amplitude,
    noiseAmplitude: 0.002,
    seed: 7,
  });
}

const silenceFrame = () => new Float32Array(STRUM_FRAME_SIZE);

describe('StrumMicSession with the attempt tracker', () => {
  it('gives a correct verdict within a few frames (~0.3 s of strumming)', () => {
    const session = new StrumMicSession({ onChange: () => undefined });
    expect(session.beginSession('em')).toBe(true);
    const frame = strumFrame(soundingFrequencies('em'));
    let now = Date.now() - 5000;

    // First frames: still gathering evidence (progress bar visible in UI).
    session.feedFrame(frame, SR, (now += T));
    expect(session.snapshot().stage).toBe('listening');
    expect(session.snapshot().progress).toBeGreaterThan(0);

    // After a handful of frames the verdict is published…
    for (let i = 0; i < 5; i++) session.feedFrame(frame, SR, (now += T));
    const snapshot = session.snapshot();
    expect(snapshot.stage).toBe('verdict');
    expect(snapshot.verdict).toBe('correct');
    expect(snapshot.verdictSeq).toBe(1);

    // …and continuing to ring does not re-publish (no chime spam).
    for (let i = 0; i < 5; i++) session.feedFrame(frame, SR, (now += T));
    expect(session.snapshot().verdictSeq).toBe(1);
  });

  it('points at the string that fails and marks the others as ok', () => {
    const session = new StrumMicSession({ onChange: () => undefined });
    expect(session.beginSession('em')).toBe(true);
    const withoutG = soundingFrequencies('em').filter((f) => Math.abs(f - 196) > 1);
    const frame = strumFrame(withoutG);
    let now = Date.now() - 5000;
    for (let i = 0; i < 6; i++) session.feedFrame(frame, SR, (now += T));

    const snapshot = session.snapshot();
    expect(snapshot.verdict).toBe('issues');
    expect(snapshot.issues.some((i) => i.kind === 'missing' && i.stringNumber === 3)).toBe(true);
    expect(snapshot.liveStates[3]).toBe('wrong');
    expect(snapshot.liveStates[6]).toBe('ok');
  });

  it('returns to listening after the strum ends and the hold expires', () => {
    const session = new StrumMicSession({ onChange: () => undefined });
    expect(session.beginSession('em')).toBe(true);
    const frame = strumFrame(soundingFrequencies('em'));
    let now = Date.now() - 8000;
    for (let i = 0; i < 6; i++) session.feedFrame(frame, SR, (now += T));
    expect(session.snapshot().stage).toBe('verdict');

    // Silence: the verdict stays readable while it is useful…
    for (let i = 0; i < 5; i++) session.feedFrame(silenceFrame(), SR, (now += T));
    expect(session.snapshot().stage).toBe('verdict');

    // …and clears once the hold has passed.
    for (let i = 0; i < 60; i++) session.feedFrame(silenceFrame(), SR, (now += T));
    expect(session.snapshot().stage).toBe('listening');
    expect(session.snapshot().verdict).toBeNull();
  });

  it('a new strum produces a new verdict (and a new cue)', () => {
    const session = new StrumMicSession({ onChange: () => undefined });
    expect(session.beginSession('em')).toBe(true);
    const bad = strumFrame(soundingFrequencies('em').filter((f) => Math.abs(f - 196) > 1));
    let now = Date.now() - 9000;

    for (let i = 0; i < 6; i++) session.feedFrame(bad, SR, (now += T));
    expect(session.snapshot().verdict).toBe('issues');

    // The learner fixes it and strums again (a fresh, louder attack).
    const goodLouder = strumFrame(soundingFrequencies('em'), 0.8);
    for (let i = 0; i < 6; i++) session.feedFrame(goodLouder, SR, (now += T));
    const snapshot = session.snapshot();
    expect(snapshot.verdict).toBe('correct');
    expect(snapshot.verdictSeq).toBeGreaterThanOrEqual(2);
  });
});
