import { describe, expect, it } from 'vitest';
import { midiToFrequency, midiToNoteName } from '../theory/music';
import { techniqueExerciseById, expectedTimeMs } from './exercises';
import { matchSequence, type DetectedNote } from './sequenceMatcher';

const scale = techniqueExerciseById('scale-c-major-1oct')!;

/** Build a detected note for a slot, with optional deviation. */
function noteFor(
  exercise: typeof scale,
  bpm: number,
  slot: number,
  passStartMs: number,
  options: { cents?: number; timingMs?: number; midiOffset?: number; level?: number } = {},
): DetectedNote {
  const expectedMidi = exercise.notes[slot].midi;
  const frequency = midiToFrequency(expectedMidi + (options.midiOffset ?? 0));
  const detuned = frequency * 2 ** ((options.cents ?? 0) / 1200);
  return {
    frequency: detuned,
    startMs: passStartMs + expectedTimeMs(exercise, bpm, slot) + (options.timingMs ?? 0),
    level: options.level ?? 0.2,
  };
}

describe('matchSequence', () => {
  it('accepts a perfect pass', () => {
    const bpm = 60;
    const passStart = 10_000;
    const detected = scale.notes.map((_, slot) => noteFor(scale, bpm, slot, passStart));
    const result = matchSequence(scale, bpm, detected, passStart);

    expect(result.accuracy).toBe(1);
    expect(result.pauses).toBe(0);
    expect(result.extraNotes).toBe(0);
    expect(result.medianAbsCents).toBeCloseTo(0, 6);
    expect(result.timingStdMs).toBeCloseTo(0, 6);
    expect(result.pass).toBe(true);
  });

  it('counts wrong notes as incorrect but still matched in time', () => {
    const bpm = 60;
    const passStart = 0;
    // Every note played a semitone above: right rhythm, wrong pitch.
    const detected = scale.notes.map((_, slot) =>
      noteFor(scale, bpm, slot, passStart, { midiOffset: 1 }),
    );
    const result = matchSequence(scale, bpm, detected, passStart);

    expect(result.accuracy).toBe(0);
    expect(result.pauses).toBe(0); // notes were present, just wrong
    expect(result.medianAbsCents).toBeGreaterThan(80);
    expect(result.pass).toBe(false);
  });

  it('tolerates small intonation errors but flags large ones', () => {
    const bpm = 60;
    const passStart = 0;
    const fine = scale.notes.map((_, slot) => noteFor(scale, bpm, slot, passStart, { cents: 12 }));
    expect(matchSequence(scale, bpm, fine, passStart).accuracy).toBe(1);

    const off = scale.notes.map((_, slot) => noteFor(scale, bpm, slot, passStart, { cents: 60 }));
    expect(matchSequence(scale, bpm, off, passStart).accuracy).toBe(0);
  });

  it('detects pauses when expected notes are missing', () => {
    const bpm = 60;
    const passStart = 0;
    // Slots 3 and 4 never sound (the learner stopped for two notes).
    const detected = scale.notes
      .map((_, slot) => slot)
      .filter((slot) => slot !== 3 && slot !== 4)
      .map((slot) => noteFor(scale, bpm, slot, passStart));

    const result = matchSequence(scale, bpm, detected, passStart);
    expect(result.pauses).toBe(1);
    expect(result.longestPauseNotes).toBe(2);
    expect(result.accuracy).toBeCloseTo(13 / 15, 5);
    expect(result.pass).toBe(false);
  });

  it('counts repeated attempts as extra notes without breaking the grid', () => {
    const bpm = 60;
    const passStart = 0;
    const detected = scale.notes.map((_, slot) => noteFor(scale, bpm, slot, passStart));
    // A retry right after slot 2 (a second attack of the same note).
    detected.push(noteFor(scale, bpm, 2, passStart, { timingMs: 120 }));

    const result = matchSequence(scale, bpm, detected, passStart);
    expect(result.accuracy).toBe(1);
    expect(result.extraNotes).toBe(1);
    expect(result.pauses).toBe(0);
  });

  it('reports rushing and dragging tendencies', () => {
    const bpm = 60; // step = 1000 ms
    const passStart = 0;
    const early = scale.notes.map((_, slot) => noteFor(scale, bpm, slot, passStart, { timingMs: -250 }));
    const late = scale.notes.map((_, slot) => noteFor(scale, bpm, slot, passStart, { timingMs: 250 }));

    expect(matchSequence(scale, bpm, early, passStart).rushing).toBe(true);
    expect(matchSequence(scale, bpm, late, passStart).dragging).toBe(true);
  });

  it('computes attack level dispersion for regularity drills', () => {
    const drill = techniqueExerciseById('repeated-note-i-m')!;
    const bpm = 60;
    const passStart = 0;
    const even = drill.notes.map((_, slot) => noteFor(drill, bpm, slot, passStart, { level: 0.2 }));
    const uneven = drill.notes.map((_, slot) =>
      noteFor(drill, bpm, slot, passStart, { level: slot % 2 === 0 ? 0.1 : 0.3 }),
    );

    expect(matchSequence(drill, bpm, even, passStart).levelStd).toBeCloseTo(0, 6);
    expect(matchSequence(drill, bpm, uneven, passStart).levelStd).toBeGreaterThan(0.05);
  });

  it('fails a pass with a pause even if the rest is perfect', () => {
    const bpm = 60;
    const passStart = 0;
    const detected = scale.notes
      .map((_, slot) => slot)
      .filter((slot) => slot !== 7)
      .map((slot) => noteFor(scale, bpm, slot, passStart));
    const result = matchSequence(scale, bpm, detected, passStart);
    expect(result.accuracy).toBeGreaterThan(shape(scale.notes.length - 1, scale.notes.length));
    expect(result.pauses).toBe(1);
    expect(result.pass).toBe(false);
  });

  it('exposes labels for the UI', () => {
    const passStart = 0;
    const detected = [noteFor(scale, 60, 0, passStart)];
    const result = matchSequence(scale, 60, detected, passStart);
    expect(result.slots[0].expectedLabel).toBe('C3');
    expect(result.slots[0].detectedLabel).toBe('C3');
    expect(midiToNoteName(result.slots[0].expectedMidi)).toBe('C3');
  });
});

/** Helper to keep the accuracy assertion readable. */
function shape(numerator: number, denominator: number): number {
  return numerator / denominator - 0.0001;
}
