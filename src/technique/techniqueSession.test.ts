import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../theory/music';
import { expectedTimeMs, passDurationMs, techniqueExerciseById } from './exercises';
import { TechniqueSession, type TechniqueSnapshot } from './techniqueSession';
import type { DetectedNote } from './sequenceMatcher';
import type { ProgressStorage } from '../chords/progress';
import { techniqueProgressStore, emptyRecord, type TechniqueRecord } from './techniqueProgress';
import type { TechniqueSessionSettings } from './techniqueSession';

const scale = techniqueExerciseById('scale-c-major-1oct')!; // start 50, target 80, 15 notes, criteria 0.9/20/80/3
const drill = techniqueExerciseById('repeated-note-i-m')!;

function memoryStore() {
  const map = new Map<string, TechniqueRecord>();
  return {
    get: (id: string) => map.get(id) ?? emptyRecord(),
    set: (id: string, record: TechniqueRecord) => {
      map.set(id, record);
    },
    raw: map,
  };
}

function settings(overrides: Partial<TechniqueSessionSettings> = {}): TechniqueSessionSettings {
  return { bpm: 50, metronomeEnabled: false, ...overrides };
}

/** Detected notes for a perfect pass of `exercise` at `bpm`. */
function perfectPass(
  exercise: typeof scale,
  bpm: number,
  passStartMs: number,
  options: { cents?: number; timingMs?: number } = {},
): DetectedNote[] {
  return exercise.notes.map((note, slot) => ({
    frequency: midiToFrequency(note.midi) * 2 ** ((options.cents ?? 0) / 1200),
    startMs: passStartMs + expectedTimeMs(exercise, bpm, slot) + (options.timingMs ?? 0),
    level: 0.2,
  }));
}

function make(exercise = scale, overrides: Partial<TechniqueSessionSettings> = {}) {
  let latest: TechniqueSnapshot | null = null;
  const store = memoryStore();
  const session = new TechniqueSession(
    exercise,
    settings(overrides),
    { onChange: (snapshot) => (latest = snapshot) },
    { store },
  );
  return {
    session,
    store,
    snap: (): TechniqueSnapshot => {
      if (!latest) throw new Error('no snapshot');
      return latest;
    },
  };
}

/** Run one pass: start, feed notes, end. */
function runPass(session: TechniqueSession, bpm: number, passStartMs: number, notes: DetectedNote[]) {
  session.startPass(passStartMs);
  for (const note of notes) session.noteDetected(note);
  return session.endPass(passStartMs + passDurationMs(scale, bpm) + 100)!;
}

describe('TechniqueSession', () => {
  it('starts a session on the first pass and marks it as passing', () => {
    const { session, snap } = make();
    session.start(0);
    expect(session.isRunning).toBe(true);
    expect(session.isPassing).toBe(true);
    expect(snap().passNumber).toBe(0);
    expect(snap().passing).toBe(true);
  });

  it('passes a perfect pass and records the tempo and accuracy', () => {
    const { session, snap, store } = make();
    session.start(0);
    const outcome = runPass(session, 50, 0, perfectPass(scale, 50, 0));

    expect(outcome.result.pass).toBe(true);
    expect(outcome.result.accuracy).toBe(1);
    expect(snap().passStreak).toBe(1);
    expect(store.raw.get(scale.id)?.bestBpm).toBe(50);
    expect(store.raw.get(scale.id)?.passesCompleted).toBe(1);
  });

  it('raises the tempo automatically after three clean passes in a row', () => {
    const { session, snap } = make();
    session.start(0);
    runPass(session, 50, 0, perfectPass(scale, 50, 0));
    runPass(session, 50, 20_000, perfectPass(scale, 50, 20_000));
    const third = runPass(session, 50, 40_000, perfectPass(scale, 50, 40_000));

    expect(third.recommendation.action).toBe('increase-tempo');
    expect(third.nextBpm).toBe(55);
    expect(snap().bpm).toBe(55);
    expect(snap().passStreak).toBe(0);
  });

  it('lowers the tempo after two failed passes when above the start tempo', () => {
    const { session, snap } = make(scale, { bpm: 65 });
    session.start(0);
    // Notes a semitone off → fail (accuracy 0).
    const wrong = perfectPass(scale, 65, 0).map((note) => ({
      ...note,
      frequency: note.frequency * 2 ** (1 / 12),
    }));
    runPass(session, 65, 0, wrong);
    const second = runPass(session, 65, 20_000, wrong.map((n) => ({ ...n, startMs: n.startMs + 20_000 })));

    expect(second.recommendation.action).toBe('decrease-tempo');
    expect(second.nextBpm).toBe(60);
    expect(snap().bpm).toBe(60);
  });

  it('does not lower below the exercise starting tempo', () => {
    const { session, snap } = make();
    session.start(0);
    const wrong = perfectPass(scale, 50, 0).map((note) => ({
      ...note,
      frequency: note.frequency * 2 ** (1 / 12),
    }));
    runPass(session, 50, 0, wrong);
    runPass(session, 50, 20_000, wrong.map((n) => ({ ...n, startMs: n.startMs + 20_000 })));
    expect(snap().bpm).toBe(50);
  });

  it('keeps the best tempo across sessions (progress store)', () => {
    const storage: ProgressStorage = (() => {
      const map = new Map<string, string>();
      return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
          map.set(key, value);
        },
      };
    })();
    const store = techniqueProgressStore(storage);

    const first = new TechniqueSession(
      scale,
      settings({ bpm: 50 }),
      { onChange: () => undefined },
      { store },
    );
    first.start(0);
    runPass(first, 50, 0, perfectPass(scale, 50, 0));
    runPass(first, 50, 20_000, perfectPass(scale, 50, 20_000));
    runPass(first, 50, 40_000, perfectPass(scale, 50, 40_000)); // → 55
    expect(first.snapshot().bpm).toBe(55);

    // A new session resumes at the best tempo recorded.
    const second = new TechniqueSession(
      scale,
      settings({ bpm: 50 }),
      { onChange: () => undefined },
      { store },
    );
    expect(second.snapshot().bpm).toBe(55);
  });

  it('suggests pressure/intonation work when notes are played with bad intonation', () => {
    const { session } = make();
    session.start(0);
    const sharp = perfectPass(scale, 50, 0, { cents: 45 });
    const outcome = runPass(session, 50, 0, sharp);
    expect(outcome.result.pass).toBe(false);
    expect(outcome.recommendation.action).toBe('check-pressure');
  });

  it('detects pauses from missing notes', () => {
    const { session } = make();
    session.start(0);
    const notes = perfectPass(scale, 50, 0).filter((_, index) => index !== 4);
    const outcome = runPass(session, 50, 0, notes);
    expect(outcome.result.pauses).toBe(1);
    expect(outcome.recommendation.action).toBe('slow-and-count');
  });

  it('ends a pass automatically when its duration plus grace has elapsed', () => {
    const { session } = make();
    session.start(0);
    const due = passDurationMs(scale, 50) + 600;
    expect(session.autoEndIfDue(due - 100)).toBeNull();
    const outcome = session.autoEndIfDue(due);
    expect(outcome).not.toBeNull();
    expect(session.isPassing).toBe(false);
  });

  it('ignores detected notes outside a pass', () => {
    const { session, snap } = make();
    session.start(0);
    session.endPass(passDurationMs(scale, 50) + 100); // finish the first pass
    const before = snap().detectedNotes;
    session.noteDetected({ frequency: 440, startMs: 0 });
    expect(snap().detectedNotes).toBe(before);
  });

  it('applies the tempo maths to the pass duration of the drill', () => {
    expect(passDurationMs(drill, 60)).toBe(8000); // 8 notes × 1000 ms
  });
});
