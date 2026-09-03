import { describe, expect, it } from 'vitest';
import { synthesizeChord } from '../testing/synth';
import { chordById } from './catalog';
import { analyzeStrum, STRUM_FRAME_SIZE } from './strumCheck';

const SR = 44100;

/** Expected open/fretted frequencies of the sounding strings of a chord. */
function soundingFrequencies(chordId: string): number[] {
  const chord = chordById(chordId)!;
  return chord.strings
    .filter((s) => s.fret !== null)
    .map((s) => {
      const midi = [0, 64, 59, 55, 50, 45, 40][s.number] + (s.fret ?? 0);
      return 440 * 2 ** ((midi - 69) / 12);
    });
}

function strum(frequencies: number[], overrides: Partial<{ amplitude: number; noise: number }> = {}) {
  return synthesizeChord({
    frequencies,
    sampleRate: SR,
    sampleCount: STRUM_FRAME_SIZE,
    amplitude: overrides.amplitude ?? 0.4,
    noiseAmplitude: overrides.noise ?? 0.002,
    seed: 7,
  });
}

const issueKinds = (result: ReturnType<typeof analyzeStrum>) =>
  result.issues.map((i) => i.kind);

describe('analyzeStrum — correct strums', () => {
  it('accepts a clean Em strum (all six strings)', () => {
    const em = chordById('em')!;
    const result = analyzeStrum(em, strum(soundingFrequencies('em')), SR);
    expect(result.verdict).toBe('correct');
    expect(result.issues).toEqual([]);
    expect(result.scores).toHaveLength(6);
    expect(result.scores.every((s) => s.ringing)).toBe(true);
  });

  it('accepts a clean G strum (no muted strings)', () => {
    const g = chordById('g')!;
    const result = analyzeStrum(g, strum(soundingFrequencies('g')), SR);
    expect(result.verdict).toBe('correct');
    expect(result.issues).toEqual([]);
  });

  it('accepts a clean A strum (5 sounding strings, 6th muted and silent)', () => {
    const a = chordById('a')!;
    const result = analyzeStrum(a, strum(soundingFrequencies('a')), SR);
    expect(result.verdict).toBe('correct');
    expect(result.issues).toEqual([]);
  });
});

describe('analyzeStrum — problems', () => {
  it('flags a muted sounding string as missing (Em without the G string)', () => {
    const em = chordById('em')!;
    const all = soundingFrequencies('em');
    const withoutG = all.filter((f) => Math.abs(f - 196) > 1);
    const result = analyzeStrum(em, strum(withoutG), SR);
    expect(result.verdict).toBe('issues');
    expect(issueKinds(result)).toContain('missing');
    const missing = result.issues.find((i) => i.kind === 'missing');
    expect(missing?.stringNumber).toBe(3);
    expect(missing?.noteLabel).toBe('G3');
  });

  it('flags the muted low E when it rings inside an A chord', () => {
    const a = chordById('a')!;
    const freqs = [...soundingFrequencies('a'), 82.4069]; // + accidental low E
    const result = analyzeStrum(a, strum(freqs), SR);
    expect(result.verdict).toBe('issues');
    const muted = result.issues.find((i) => i.kind === 'muted-ring');
    expect(muted).toBeDefined();
    expect(muted?.stringNumber).toBe(6);
  });

  it('detects a mis-fretted string (F instead of E on string 4 of E major)', () => {
    const e = chordById('e')!;
    const all = soundingFrequencies('e'); // E2, B2, E3, G#3, B3, E4
    const wrong = all.map((f) => (Math.abs(f - 164.8138) < 1 ? 174.6141 : f)); // E3 → F3
    const result = analyzeStrum(e, strum(wrong), SR);
    expect(result.verdict).toBe('issues');
    // NOTE: the missing-E3 band is masked by the open E2's own 2nd harmonic,
    // so we assert what is reliable: a foreign F sounds (see docs/chord-module).
    const foreign = result.issues.find((i) => i.kind === 'foreign');
    expect(foreign).toBeDefined();
    expect(foreign?.noteLabel).toMatch(/^F/);
  });
});

describe('analyzeStrum — silence & robustness', () => {
  it('reports quiet for silence', () => {
    const em = chordById('em')!;
    const result = analyzeStrum(em, new Float32Array(STRUM_FRAME_SIZE), SR);
    expect(result.verdict).toBe('quiet');
  });

  it('is not fooled by pure noise (no fundamental bands)', () => {
    const em = chordById('em')!;
    const result = analyzeStrum(em, synthesizeChord({
      frequencies: [],
      sampleRate: SR,
      sampleCount: STRUM_FRAME_SIZE,
      noiseAmplitude: 0.05,
      amplitude: 0,
      seed: 11,
    }), SR);
    expect(['quiet', 'issues']).toContain(result.verdict);
    // Noise should not make every string "correct":
    expect(result.verdict).not.toBe('correct');
  });
});
