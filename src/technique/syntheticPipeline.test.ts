/**
 * End-to-end test of the guided practice chain with synthesized audio:
 *
 *   synthesized scale/chromatic audio ─▶ analyzeFrame (YIN) ─▶ NoteStreamDetector
 *        ─▶ matchSequence (accuracy, cents, timing, pauses)
 *
 * This is how the practice module is verified without a microphone: we "play"
 * the exercise into the code and assert that the metrics a learner would see
 * are the right ones.
 */

import { describe, expect, it } from 'vitest';
import { synthesizeTone } from '../testing/synth';
import { analyzeFrame } from '../audio/frameAnalysis';
import { NoteStreamDetector } from '../pitch/noteStream';
import { midiToFrequency } from '../theory/music';
import { techniqueExerciseById } from './exercises';
import { matchSequence, type DetectedNote } from './sequenceMatcher';

const SR = 44100;
const FRAME = 2048; // practice analysis window
const HOP = 512; // ≈11.6 ms → precise onset timing
const STEP_MS = 500; // bpm 120 with quarter notes

const exercise = techniqueExerciseById('chromatic-low-strings')!;

interface PlayNote {
  readonly midi: number;
  /** Offset in ms inside the recording. */
  readonly atMs: number;
}

/** Render a monophonic performance: each note rings ~0.42 s with a 60 ms gap. */
function renderPerformance(notes: readonly PlayNote[]): Float32Array {
  const totalMs = Math.max(...notes.map((n) => n.atMs)) + 500;
  const total = Math.ceil((totalMs / 1000) * SR);
  const buffer = new Float32Array(total);
  for (const note of notes) {
    const tone = synthesizeTone({
      frequency: midiToFrequency(note.midi),
      sampleRate: SR,
      sampleCount: Math.round(0.42 * SR),
      partialGains: [1, 0.5, 0.25],
      amplitude: 0.35,
      decaySeconds: 0.6,
      seed: note.midi,
    });
    const offset = Math.round((note.atMs / 1000) * SR);
    for (let i = 0; i < tone.length && offset + i < buffer.length; i++) {
      buffer[offset + i] += tone[i];
    }
  }
  return buffer;
}

/** Run the analysis chain over a recording and collect timed note starts. */
function detectNotes(audio: Float32Array): DetectedNote[] {
  const detector = new NoteStreamDetector();
  const frame = new Float32Array(FRAME);
  const detected: DetectedNote[] = [];
  for (let offset = 0; offset + FRAME <= audio.length; offset += HOP) {
    frame.set(audio.subarray(offset, offset + FRAME));
    const nowMs = (offset / SR) * 1000;
    const analysis = analyzeFrame(frame, SR);
    for (const event of detector.push({
      rms: analysis.rms,
      frequency: analysis.pitchFrequency,
      nowMs,
    })) {
      if (event.kind === 'start') {
        detected.push({ frequency: event.frequency, startMs: event.startMs, level: event.level });
      }
    }
  }
  return detected;
}

describe('practice pipeline on synthesized audio', () => {
  it('recognizes a perfectly played chromatic drill', () => {
    const performance = exercise.notes.map((note, slot) => ({
      midi: note.midi,
      atMs: slot * STEP_MS,
    }));
    const detected = detectNotes(renderPerformance(performance));
    expect(detected.length).toBeGreaterThanOrEqual(exercise.notes.length - 1);

    const result = matchSequence(exercise, 120, detected, 0);
    expect(result.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(result.pauses).toBe(0);
    expect(result.medianAbsCents!).toBeLessThan(15);
    expect(result.timingStdMs!).toBeLessThan(60);
    expect(result.pass).toBe(true);
  });

  it('detects a wrong note (one semitone off) in the right slot', () => {
    const performance = exercise.notes.map((note, slot) => ({
      midi: slot === 5 ? note.midi + 1 : note.midi, // mistake on the 6th note
      atMs: slot * STEP_MS,
    }));
    const detected = detectNotes(renderPerformance(performance));

    const result = matchSequence(exercise, 120, detected, 0);
    expect(result.accuracy).toBeLessThan(1);
    expect(result.slots[5].correct).toBe(false);
    expect(Math.abs(result.slots[5].cents!)).toBeGreaterThan(70);
    expect(result.slots[0].correct).toBe(true);
  });

  it('detects a pause when a note is never played', () => {
    const performance = exercise.notes
      .map((note, slot) => ({ midi: note.midi, atMs: slot * STEP_MS }))
      .filter((_, slot) => slot !== 4 && slot !== 5); // two-note hole
    const detected = detectNotes(renderPerformance(performance));

    const result = matchSequence(exercise, 120, detected, 0);
    expect(result.pauses).toBeGreaterThanOrEqual(1);
    expect(result.longestPauseNotes).toBeGreaterThanOrEqual(2);
    expect(result.pass).toBe(false);
  });

  it('detects a sharp performance as an intonation problem', () => {
    const performance = exercise.notes.map((note, slot) => ({
      // ~40 cents sharp: right note, bad pressure/tuning.
      midi: note.midi,
      atMs: slot * STEP_MS,
    }));
    const audio = renderPerformance(performance);
    // Re-render detuned: simplest way is to synthesize the same notes but with
    // a frequency multiplier, so we build the buffer manually here.
    const detuned = new Float32Array(audio.length);
    for (const [slot, note] of exercise.notes.entries()) {
      const tone = synthesizeTone({
        frequency: midiToFrequency(note.midi) * 2 ** (40 / 1200),
        sampleRate: SR,
        sampleCount: Math.round(0.42 * SR),
        partialGains: [1, 0.5, 0.25],
        amplitude: 0.35,
        decaySeconds: 0.6,
        seed: note.midi,
      });
      const offset = Math.round(((slot * STEP_MS) / 1000) * SR);
      for (let i = 0; i < tone.length && offset + i < detuned.length; i++) {
        detuned[offset + i] += tone[i];
      }
    }

    const result = matchSequence(exercise, 120, detectNotes(detuned), 0);
    expect(result.medianAbsCents!).toBeGreaterThan(20);
    expect(result.pass).toBe(false);
  });
});
