/**
 * End-to-end test of chord validation through the REAL audio path — no mic:
 *
 *   synthesized frames ─▶ analyzeFrame ─▶ NoteEventDetector ─▶ ChordPractice
 *
 * This mirrors exactly what ChordMicSession.feedFrame does per tick and is how
 * we "play an Em chord into" the code in CI: notes are synthesized one string
 * at a time (low → high) with silences in between, exactly like the app guides
 * the learner. A wrong note is also tried first to prove corrective feedback.
 */

import { describe, expect, it } from 'vitest';
import { synthesizeTone } from '../testing/synth';
import { ChordMicSession } from './micSession';
import { chordById } from './catalog';
import { analyzeFrame } from '../audio/frameAnalysis';
import { NoteEventDetector } from './events';
import { ChordPractice } from './practice';

const SAMPLE_RATE = 44100;
const WINDOW = 4096;

function toneFrame(frequency: number, amplitude = 0.3): Float32Array {
  return synthesizeTone({
    frequency,
    sampleRate: SAMPLE_RATE,
    sampleCount: WINDOW,
    partialGains: [1, 0.4, 0.2],
    amplitude,
    seed: 5,
  });
}

const silenceFrame = () => new Float32Array(WINDOW);

/** Play `frequency` for some frames, then silence (learner muting the strings). */
function pluckThenSilence(frequency: number, voiced = 6, silent = 6): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let i = 0; i < voiced; i++) frames.push(toneFrame(frequency));
  for (let i = 0; i < silent; i++) frames.push(silenceFrame());
  return frames;
}

/** Drive one note's worth of frames through a detector+practice pair. */
function play(
  detector: NoteEventDetector,
  practice: ChordPractice,
  frames: Float32Array[],
): void {
  for (const frame of frames) {
    const analysis = analyzeFrame(frame, SAMPLE_RATE);
    const event = detector.push({ rms: analysis.rms, frequency: analysis.pitchFrequency });
    if (event) practice.handleNoteStart(event.frequency);
  }
}

describe('chord session over synthesized audio', () => {
  it('recognizes a correctly played Em chord string by string', () => {
    const detector = new NoteEventDetector();
    let latest: ReturnType<ChordPractice['snapshot']> | null = null;
    const practice = new ChordPractice(chordById('em')!, (s) => {
      latest = s;
    });

    const expected = [82.4069, 123.4708, 164.8138, 196.0, 246.9417, 329.6276];
    for (const freq of expected) {
      play(detector, practice, pluckThenSilence(freq));
    }

    expect(latest!.phase).toBe('complete');
    expect(latest!.mastered).toBe(true);
    expect(latest!.steps.every((s) => s.status === 'ok')).toBe(true);
  });

  it('rejects a wrong first string, then accepts it when played correctly', () => {
    const detector = new NoteEventDetector();
    let latest: ReturnType<ChordPractice['snapshot']> | null = null;
    const practice = new ChordPractice(chordById('em')!, (s) => {
      latest = s;
    });

    // 6th string should be E2 (82.4 Hz); the learner first plays an A2 (110 Hz).
    play(detector, practice, pluckThenSilence(110));
    expect(latest!.steps[0].status).toBe('wrong');
    expect(latest!.activeIndex).toBe(0);
    expect(latest!.lastCheck?.expectedName).toBe('E2');
    expect(latest!.lastCheck?.detectedName).toBe('A2');

    // Correct it, then finish the rest of the chord.
    play(detector, practice, pluckThenSilence(82.4069));
    expect(latest!.steps[0].status).toBe('ok');
    expect(latest!.activeIndex).toBe(1);
    for (const freq of [123.4708, 164.8138, 196.0, 246.9417, 329.6276]) {
      play(detector, practice, pluckThenSilence(freq));
    }
    expect(latest!.phase).toBe('complete');
    expect(latest!.mastered).toBe(true);
  });

  it('ChordMicSession.feedFrame drives the same path on synthetic frames', () => {
    const session = new ChordMicSession({ onChange: () => undefined });
    expect(session.beginSession('a')).toBe(true); // A major: skips muted 6th

    // A chord: strings 5..1 → A2, E3(fret2 on D), A3(fret2 on G), C#4(fret2 on B), E4
    const expected = [110, 164.8138, 220, 277.1826, 329.6276];
    for (const freq of expected) {
      // 8 voiced frames (confirm window is 3), then silence to release.
      for (let i = 0; i < 8; i++) session.feedFrame(toneFrame(freq), SAMPLE_RATE);
      for (let i = 0; i < 8; i++) session.feedFrame(silenceFrame(), SAMPLE_RATE);
    }

    const snapshot = session.snapshot();
    expect(snapshot.practice?.phase).toBe('complete');
    expect(snapshot.practice?.mastered).toBe(true);
    expect(snapshot.practice?.steps).toHaveLength(5); // muted 6th never validated
  });
});
