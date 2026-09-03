import { describe, expect, it } from 'vitest';
import { NoteEventDetector, type FrameObservation } from './events';

const SILENT: FrameObservation = { rms: 0, frequency: null };
const voiced = (frequency: number, rms = 0.3): FrameObservation => ({ rms, frequency });

function run(detector: NoteEventDetector, frames: FrameObservation[]): number[] {
  const out: number[] = [];
  for (const frame of frames) {
    const event = detector.push(frame);
    if (event) out.push(event.frequency);
  }
  return out;
}

describe('NoteEventDetector', () => {
  it('emits one event after a note is voiced for the confirm window', () => {
    const d = new NoteEventDetector({ soundRms: 0.05, confirmFrames: 3 });
    const events = run(d, [
      voiced(110), // onset frame 1
      voiced(110.2),
      voiced(109.9), // confirmed → event
      voiced(110), // ringing: ignored
      voiced(110.1),
    ]);
    expect(events).toEqual([110]);
  });

  it('ignores a single-frame blip (never confirmed)', () => {
    const d = new NoteEventDetector({ soundRms: 0.05, confirmFrames: 3 });
    const events = run(d, [voiced(880), SILENT, SILENT, SILENT, SILENT]);
    expect(events).toEqual([]);
  });

  it('ignores transient frames that do not agree with the onset', () => {
    const d = new NoteEventDetector({ soundRms: 0.05, confirmFrames: 3, confirmCents: 45 });
    // A wild first frame (pluck attack) then a stable note:
    const events = run(d, [voiced(700), voiced(110.1), voiced(110.0), voiced(109.9)]);
    expect(events).toEqual([110]);
  });

  it('requires silence before a new onset can be heard (no re-trigger while ringing)', () => {
    const d = new NoteEventDetector({ soundRms: 0.05, confirmFrames: 3, releaseSilenceFrames: 3 });
    const events = run(d, [
      voiced(110),
      voiced(110),
      voiced(110), // event 1
      voiced(110.2), // still ringing…
      voiced(110.1),
      SILENT,
      SILENT,
      SILENT, // released
      voiced(220),
      voiced(220.1),
      voiced(220), // event 2
    ]);
    expect(events).toEqual([110, 220]);
  });

  it('hears a new clearly different note even while the previous rings', () => {
    const d = new NoteEventDetector({
      soundRms: 0.05,
      confirmFrames: 3,
      releaseSilenceFrames: 3,
      retriggerCents: 80,
      retriggerFrames: 3,
    });
    const events = run(d, [
      voiced(110),
      voiced(110),
      voiced(110), // event 1 (E2 rings on)
      voiced(196), // A→ next pluck G3 while E2 still rings
      voiced(196.1),
      voiced(195.9), // sustained different pitch → event 2
    ]);
    expect(events).toEqual([110, 196]);
  });

  it('does not re-trigger on small drift of the same ringing note', () => {
    const d = new NoteEventDetector({ soundRms: 0.05, confirmFrames: 3, retriggerCents: 80 });
    const events = run(d, [
      voiced(110),
      voiced(110),
      voiced(110), // event
      voiced(110.6), // ~9¢ drift
      voiced(109.7),
      voiced(110.3),
      voiced(110.1),
    ]);
    expect(events).toEqual([110]);
  });

  it('stays quiet for silence and noise below the sound gate', () => {
    const d = new NoteEventDetector({ soundRms: 0.05 });
    const events = run(d, [
      { rms: 0.01, frequency: 110 }, // below soundRms → not voiced
      { rms: 0.01, frequency: 110 },
      { rms: 0.01, frequency: 110 },
      SILENT,
    ]);
    expect(events).toEqual([]);
  });
});
