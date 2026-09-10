import { describe, expect, it } from 'vitest';
import { StrumAttemptTracker, type StrumFrameObservation } from './strumAttempt';
import type { StrumIssue, StrumStringScore } from './strumCheck';

const T = 60; // frame cadence of the strum session (ms)

/** Em chord strings (low → high) and their expected labels. */
const EM_STRINGS: { number: number; expectedLabel: string | null }[] = [
  { number: 6, expectedLabel: 'E2' },
  { number: 5, expectedLabel: 'B2' },
  { number: 4, expectedLabel: 'E3' },
  { number: 3, expectedLabel: 'G3' },
  { number: 2, expectedLabel: 'B3' },
  { number: 1, expectedLabel: 'E4' },
];

/** A chord with the 6th string muted (like A major). */
const A_STRINGS: { number: number; expectedLabel: string | null }[] = [
  { number: 6, expectedLabel: null },
  { number: 5, expectedLabel: 'A2' },
  { number: 4, expectedLabel: 'E3' },
  { number: 3, expectedLabel: 'A3' },
  { number: 2, expectedLabel: 'C#4' },
  { number: 1, expectedLabel: 'E4' },
];

function scores(
  strings: { number: number; expectedLabel: string | null }[],
  ratios: Record<number, number>,
): StrumStringScore[] {
  return strings.map((s) => ({
    stringNumber: s.number as never,
    expectedLabel: s.expectedLabel,
    score: ratios[s.number] ?? 0,
    ringing: (ratios[s.number] ?? 0) >= 0.3,
  }));
}

function frame(
  nowMs: number,
  ratios: Record<number, number>,
  options: {
    strings?: { number: number; expectedLabel: string | null }[];
    verdict?: 'quiet' | 'correct' | 'issues';
    issues?: StrumIssue[];
    /** Frame level; a clear jump means a new strum started. */
    rms?: number;
  } = {},
): StrumFrameObservation {
  return {
    verdict: options.verdict ?? 'issues',
    issues: options.issues ?? [],
    scores: scores(options.strings ?? EM_STRINGS, ratios),
    rms: options.rms ?? 0.2,
    nowMs,
  };
}

const quiet = (nowMs: number): StrumFrameObservation => ({
  verdict: 'quiet',
  issues: [],
  scores: [],
  rms: 0,
  nowMs,
});

const ALL_OK = { 6: 1, 5: 0.7, 4: 0.6, 3: 0.55, 2: 0.6, 1: 0.4 };

describe('StrumAttemptTracker', () => {
  it('publishes a correct verdict after only a few frames (~0.25 s)', () => {
    const tracker = new StrumAttemptTracker();
    let t = 0;
    expect(tracker.push(frame((t += T), ALL_OK))).toBeNull();
    expect(tracker.push(frame((t += T), ALL_OK))).toBeNull();
    expect(tracker.push(frame((t += T), ALL_OK))).toBeNull();
    const event = tracker.push(frame((t += T), ALL_OK));
    expect(event).toEqual({ verdict: 'correct', issues: [] });
    expect(tracker.snapshot().progress).toBe(1);
  });

  it('reports the failing string and gives it a live "wrong" state', () => {
    const tracker = new StrumAttemptTracker();
    let t = 0;
    const ratios = { ...ALL_OK, 3: 0.05 }; // G3 string muted by a finger
    for (let i = 0; i < 4; i++) tracker.push(frame((t += T), ratios));

    const snapshot = tracker.snapshot();
    expect(snapshot.verdict).toBe('issues');
    const missing = snapshot.issues.find((i) => i.kind === 'missing');
    expect(missing?.stringNumber).toBe(3);
    expect(missing?.noteLabel).toBe('G3');
    expect(snapshot.liveStates[3]).toBe('wrong');
    expect(snapshot.liveStates[6]).toBe('ok');
  });

  it('does not judge before two frames (no flicker on the first hit)', () => {
    const tracker = new StrumAttemptTracker();
    tracker.push(frame(T, { ...ALL_OK, 3: 0.05 }));
    expect(tracker.snapshot().liveStates).toEqual({});
  });

  it('a new strum replaces the previous verdict immediately (no waiting)', () => {
    const tracker = new StrumAttemptTracker();
    let t = 0;
    for (let i = 0; i < 4; i++) tracker.push(frame((t += T), { ...ALL_OK, 3: 0.05 }));
    expect(tracker.snapshot().verdict).toBe('issues');

    // The learner fixes the finger and strums again: the chord is still
    // ringing, but the new attack is louder → new attempt, immediate verdict.
    let event = null;
    for (let i = 0; i < 4; i++) {
      event = tracker.push(frame((t += T), ALL_OK, { rms: 0.45 })) ?? event;
    }
    expect(event).toEqual({ verdict: 'correct', issues: [] });
    expect(tracker.snapshot().verdict).toBe('correct');
  });

  it('flags a muted string that rings (e.g. the low E inside an A chord)', () => {
    const tracker = new StrumAttemptTracker();
    let t = 0;
    const ratios = { 6: 1, 5: 0.9, 4: 0.7, 3: 0.6, 2: 0.6, 1: 0.4 };
    for (let i = 0; i < 4; i++) {
      tracker.push(frame((t += T), ratios, { strings: A_STRINGS }));
    }
    const snapshot = tracker.snapshot();
    const muted = snapshot.issues.find((i) => i.kind === 'muted-ring');
    expect(muted?.stringNumber).toBe(6);
    expect(snapshot.liveStates[6]).toBe('wrong');
  });

  it('reports sustained foreign notes, ignoring one-off blips', () => {
    const tracker = new StrumAttemptTracker({ silenceToEndMs: 120 });
    let t = 0;
    const foreign: StrumIssue = { kind: 'foreign', noteLabel: 'F3 (174.6 Hz)' };
    // Blip in the first frame only → ignored.
    tracker.push(frame((t += T), ALL_OK, { issues: [foreign] }));
    for (let i = 0; i < 3; i++) tracker.push(frame((t += T), ALL_OK));
    expect(tracker.snapshot().issues).toEqual([]);

    // Let the first attempt end, then a new strum with the bad note sustained.
    for (let i = 0; i < 3; i++) tracker.push(quiet((t += T)));
    for (let i = 0; i < 4; i++) tracker.push(frame((t += T), ALL_OK, { issues: [foreign] }));
    expect(tracker.snapshot().issues.some((i) => i.kind === 'foreign')).toBe(true);
  });

  it('freezes the verdict through silence and clears it after the hold', () => {
    const tracker = new StrumAttemptTracker({ holdMs: 1000, silenceToEndMs: 300 });
    let t = 0;
    for (let i = 0; i < 4; i++) tracker.push(frame((t += T), ALL_OK));
    expect(tracker.snapshot().verdict).toBe('correct');

    // Short silences keep the verdict on screen.
    tracker.push(quiet((t += T)));
    tracker.push(quiet((t += T)));
    expect(tracker.snapshot().stage).toBe('verdict');

    // After the hold, going quiet returns to listening.
    for (let i = 0; i < 30; i++) tracker.push(quiet((t += T)));
    expect(tracker.snapshot().stage).toBe('listening');
    expect(tracker.snapshot().verdict).toBeNull();
  });

  it('progress grows with the evidence of the current attempt', () => {
    const tracker = new StrumAttemptTracker({ minFrames: 4 });
    let t = 0;
    tracker.push(frame((t += T), ALL_OK));
    expect(tracker.snapshot().progress).toBeCloseTo(0.25, 5);
    tracker.push(frame((t += T), ALL_OK));
    expect(tracker.snapshot().progress).toBeCloseTo(0.5, 5);
  });

  it('verdictSeq increments once per published verdict (chime trigger)', () => {
    const tracker = new StrumAttemptTracker();
    let t = 0;
    expect(tracker.snapshot().verdictSeq).toBe(0);
    for (let i = 0; i < 4; i++) tracker.push(frame((t += T), ALL_OK));
    expect(tracker.snapshot().verdictSeq).toBe(1);
    // More frames of the same attempt must not re-trigger the cue.
    for (let i = 0; i < 5; i++) tracker.push(frame((t += T), ALL_OK));
    expect(tracker.snapshot().verdictSeq).toBe(1);
  });

  it('reset() clears everything (new chord / mic stopped)', () => {
    const tracker = new StrumAttemptTracker();
    let t = 0;
    for (let i = 0; i < 4; i++) tracker.push(frame((t += T), ALL_OK));
    tracker.reset();
    const snapshot = tracker.snapshot();
    expect(snapshot.stage).toBe('listening');
    expect(snapshot.verdictSeq).toBe(0);
    expect(snapshot.liveStates).toEqual({});
  });
});
