import { describe, expect, it } from 'vitest';
import { NoteStreamDetector, type NoteFrame, type NoteStreamEvent } from './noteStream';

const T = 16; // ~60 Hz frame cadence

function frame(nowMs: number, frequency: number | null, rms = 0.2): NoteFrame {
  return { rms: frequency === null ? 0 : rms, frequency, nowMs };
}

/** Feed a note for `frames` frames starting at `startMs`; returns the events. */
function playNote(
  detector: NoteStreamDetector,
  frequency: number,
  startMs: number,
  frames = 4,
  rms = 0.2,
): { events: NoteStreamEvent[]; endMs: number } {
  const events: NoteStreamEvent[] = [];
  let now = startMs;
  for (let i = 0; i < frames; i++) {
    events.push(...detector.push(frame(now, frequency, rms)));
    now += T;
  }
  return { events, endMs: now };
}

function silence(detector: NoteStreamDetector, startMs: number, frames = 5): NoteStreamEvent[] {
  const events: NoteStreamEvent[] = [];
  let now = startMs;
  for (let i = 0; i < frames; i++) {
    events.push(...detector.push(frame(now, null)));
    now += T;
  }
  return events;
}

describe('NoteStreamDetector', () => {
  it('emits a timed start event after the confirmation window', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2 });
    const first = detector.push(frame(1000, 440));
    expect(first).toEqual([]); // not confirmed yet
    const second = detector.push(frame(1000 + T, 440));
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ kind: 'start', frequency: 440, startMs: 1000 });
  });

  it('rejects a single-frame blip', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2 });
    detector.push(frame(0, 880));
    const events = silence(detector, T);
    expect(events.filter((e) => e.kind === 'start')).toHaveLength(0);
  });

  it('starts the next note on a clearly different pitch without needing silence', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2, differentNoteFrames: 2 });
    const a = playNote(detector, 440, 0, 3);
    expect(a.events.filter((e) => e.kind === 'start')).toHaveLength(1);

    const b = playNote(detector, 494, a.endMs, 3, 0.25); // B4 comes while A4 rings
    const ends = b.events.filter((e) => e.kind === 'end');
    const starts = b.events.filter((e) => e.kind === 'start');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ kind: 'end', frequency: 440, endMs: a.endMs });
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ kind: 'start', frequency: 494, startMs: a.endMs });
  });

  it('ends the note after sustained silence and reports the duration', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2, silenceFrames: 3 });
    const played = playNote(detector, 330, 0, 4);
    const end = silence(detector, played.endMs, 4).find((e) => e.kind === 'end');
    expect(end).toBeDefined();
    if (end && end.kind === 'end') {
      expect(end.frequency).toBe(330);
      expect(end.durationMs).toBeGreaterThanOrEqual(48);
      expect(end.endMs).toBeGreaterThan(played.endMs);
    }
  });

  it('does not retrigger on small pitch drift of the same ringing note', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2, differentNoteCents: 60 });
    playNote(detector, 220, 0, 3);
    const drift = playNote(detector, 224, 100, 4); // ≈31 cents → same note
    expect(drift.events).toEqual([]);
  });

  it('does not trigger below the RMS gate', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2, soundRms: 0.05 });
    detector.push(frame(0, 440, 0.01));
    detector.push(frame(T, 440, 0.01));
    expect(detector.flush(2 * T)).toHaveLength(0);
  });

  it('flush() closes an open note', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2 });
    playNote(detector, 262, 0, 3);
    const events = detector.flush(100);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'end', frequency: 262, endMs: 100 });
  });

  it('reset() forgets the current note and state', () => {
    const detector = new NoteStreamDetector({ confirmFrames: 2 });
    playNote(detector, 440, 0, 3);
    detector.reset();
    expect(detector.flush(500)).toHaveLength(0);
    // A new note starts cleanly from quiet.
    const events = playNote(detector, 330, 600, 2).events;
    expect(events.filter((e) => e.kind === 'start')).toHaveLength(1);
  });
});
