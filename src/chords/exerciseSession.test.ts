import { describe, expect, it } from 'vitest';
import { exerciseById } from './exercises';
import {
  ExerciseSession,
  type ExerciseBestStore,
  type ExerciseSettings,
  type ExerciseSnapshot,
} from './exerciseSession';

const loop = exerciseById('loop-a-d-e')!;      // A → D → E, 4 beats each
const oneMinute = exerciseById('one-minute-em-am')!;
const randomDrill = exerciseById('random-seven')!;

function settings(overrides: Partial<ExerciseSettings> = {}): ExerciseSettings {
  return { bpm: 60, metronomeEnabled: true, beatsPerChord: 4, validateWithMic: false, ...overrides };
}

function memoryStore(): ExerciseBestStore {
  const map = new Map<string, number>();
  return {
    getBest: (id) => map.get(id),
    setBest: (id, value) => {
      map.set(id, value);
    },
  };
}

function make(exercise = loop, overrides: Partial<ExerciseSettings> = {}, random?: () => number) {
  let latest: ExerciseSnapshot | null = null;
  const store = memoryStore();
  const session = new ExerciseSession(exercise, settings(overrides), {
    onChange: (s) => {
      latest = s;
    },
  }, { random, store });
  return {
    session,
    store,
    snap: (): ExerciseSnapshot => {
      if (!latest) throw new Error('no snapshot yet');
      return latest;
    },
  };
}

describe('ExerciseSession', () => {
  it('starts on the first chord of the sequence', () => {
    const { session, snap } = make();
    session.start(0);
    expect(snap().chordId).toBe('a');
    expect(snap().nextChordId).toBe('d');
    expect(snap().changes).toBe(0);
    expect(snap().running).toBe(true);
  });

  it('advances to the next chord after the configured beats and counts changes', () => {
    const { session, snap } = make(loop, { beatsPerChord: 4 });
    session.start(0);
    for (let beat = 0; beat < 4; beat++) session.onBeat(beat * 1000);
    expect(snap().chordId).toBe('d');
    expect(snap().changes).toBe(1);
    expect(snap().beatsIntoChord).toBe(0);

    for (let beat = 0; beat < 4; beat++) session.onBeat(0);
    expect(snap().chordId).toBe('e');
    expect(snap().changes).toBe(2);
  });

  it('loops back to the first chord at the end of the sequence', () => {
    const { session, snap } = make(loop, { beatsPerChord: 1 });
    session.start(0);
    for (let i = 0; i < 3; i++) session.onBeat(0);
    expect(snap().chordId).toBe('a');
    expect(snap().changes).toBe(3);
  });

  it('alternates between the two chords of a pivot drill', () => {
    const pivot = exerciseById('em-am')!;
    const { session, snap } = make(pivot, { beatsPerChord: 2 });
    session.start(0);
    session.onBeat(0);
    session.onBeat(0); // change 1
    expect(snap().chordId).toBe('am');
    session.onBeat(0);
    session.onBeat(0); // change 2
    expect(snap().chordId).toBe('em');
    expect(snap().changes).toBe(2);
  });

  it('counts clean changes only when the microphone validated the chord', () => {
    const { session, snap } = make(exerciseById('em-am')!, { beatsPerChord: 2, validateWithMic: true });
    session.start(0);
    session.onBeat(0);
    session.reportValidation('correct');
    expect(snap().currentClean).toBe(true);
    session.onBeat(0); // change 1 → clean
    expect(snap().cleanChanges).toBe(1);

    // Second change without a correct validation → not clean.
    session.onBeat(0);
    session.reportValidation('issues');
    session.onBeat(0);
    expect(snap().cleanChanges).toBe(1);
    expect(snap().changes).toBe(2);
  });

  it('does not count clean changes when microphone validation is off', () => {
    const { session, snap } = make(exerciseById('em-am')!, { beatsPerChord: 1, validateWithMic: false });
    session.start(0);
    session.onBeat(0);
    session.reportValidation('correct');
    session.onBeat(0);
    expect(snap().cleanChanges).toBe(0);
    expect(snap().changes).toBe(2);
  });

  it('finishes one-minute drills after their duration and saves the best score', () => {
    const { session, snap, store } = make(oneMinute, { beatsPerChord: 1, validateWithMic: true });
    session.start(0);
    // Four changes, two of them clean.
    for (let i = 0; i < 4; i++) {
      session.reportValidation(i % 2 === 0 ? 'correct' : 'issues');
      session.onBeat(i * 1000);
    }
    session.tick(59_000);
    expect(snap().finished).toBe(false);
    expect(snap().remainingMs).toBeGreaterThan(0);

    session.tick(60_000);
    expect(snap().finished).toBe(true);
    expect(snap().running).toBe(false);
    expect(snap().cleanChanges).toBe(2);
    expect(store.getBest(oneMinute.id)).toBe(2);

    // A worse run does not overwrite the best.
    session.start(100_000);
    session.onBeat(100_000);
    session.tick(160_000);
    expect(store.getBest(oneMinute.id)).toBe(2);
  });

  it('picks random chords without repeating the current one', () => {
    const picks = [0.1, 0.9, 0.5, 0.3];
    let i = 0;
    const { session, snap } = make(randomDrill, { beatsPerChord: 1 }, () => picks[i++ % picks.length]);
    session.start(0);
    const seen = [snap().chordId];
    for (let change = 0; change < 6; change++) {
      session.onBeat(0);
      const current = snap().chordId!;
      expect(current).not.toBe(seen[seen.length - 1]);
      seen.push(current);
    }
    expect(new Set(seen).size).toBeGreaterThan(1);
    expect(snap().nextChordId).toBeNull(); // random → nothing to preview
  });

  it('exposes settings changes (bpm, beats per chord, metronome, mic)', () => {
    const { session, snap } = make();
    session.start(0);
    session.setBpm(88);
    expect(snap().bpm).toBe(88);
    session.setBeatsPerChord(2);
    expect(snap().beatsPerChord).toBe(2);
    session.setMetronomeEnabled(false);
    expect(snap().metronomeEnabled).toBe(false);
    session.setValidateWithMic(true);
    expect(snap().validateWithMic).toBe(true);
  });

  it('stops without finishing (paused mid-drill)', () => {
    const { session, snap } = make();
    session.start(0);
    session.onBeat(0);
    session.stop();
    expect(snap().running).toBe(false);
    expect(snap().finished).toBe(false);
    // Beats after stop are ignored.
    const changesBefore = snap().changes;
    session.onBeat(0);
    expect(snap().changes).toBe(changesBefore);
  });
});
