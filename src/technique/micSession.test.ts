import { describe, expect, it } from 'vitest';
import { synthesizeTone } from '../testing/synth';
import { TechniqueMicSession, TECHNIQUE_FFT_SIZE } from './micSession';
import type { DetectedNote } from './sequenceMatcher';

const SR = 44100;
const FRAME = TECHNIQUE_FFT_SIZE;

function toneFrame(frequency: number, amplitude = 0.3): Float32Array {
  return synthesizeTone({
    frequency,
    sampleRate: SR,
    sampleCount: FRAME,
    partialGains: [1, 0.4, 0.2],
    amplitude,
    seed: 5,
  });
}

const silence = () => new Float32Array(FRAME);

describe('TechniqueMicSession (synthetic frames)', () => {
  it('turns frames into timed note events', () => {
    const notes: DetectedNote[] = [];
    const phases: string[] = [];
    const session = new TechniqueMicSession({
      onNote: (note) => notes.push(note),
      onStatusChange: (phase) => phases.push(phase),
    });
    session.beginSession();

    // ~30 ms of silence, then a G3 (196 Hz) that rings ~80 ms.
    let now = 1000;
    for (let i = 0; i < 3; i++) session.feedFrame(silence(), SR, (now += 16));
    for (let i = 0; i < 6; i++) session.feedFrame(toneFrame(196), SR, (now += 16));

    expect(phases).toContain('running');
    expect(notes.length).toBeGreaterThanOrEqual(1);
    // The note should be recognised as G3-ish and start after the silence.
    expect(notes[0].frequency).toBeGreaterThan(190);
    expect(notes[0].frequency).toBeLessThan(202);
    expect(notes[0].startMs).toBeGreaterThanOrEqual(1000);
    expect(notes[0].level).toBeGreaterThan(0.05);
  });

  it('reports the input level while listening', () => {
    const levels: number[] = [];
    const session = new TechniqueMicSession({
      onNote: () => undefined,
      onLevel: (level) => levels.push(level),
    });
    session.beginSession();
    session.feedFrame(toneFrame(262), SR, 0);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toBeGreaterThan(0);
  });

  it('ignores silence and very quiet frames', () => {
    const notes: DetectedNote[] = [];
    const session = new TechniqueMicSession({ onNote: (note) => notes.push(note) });
    session.beginSession();
    for (let i = 0; i < 10; i++) session.feedFrame(silence(), SR, i * 16);
    for (let i = 0; i < 6; i++) session.feedFrame(toneFrame(196, 0.0005), SR, 200 + i * 16);
    expect(notes).toEqual([]);
  });
});
