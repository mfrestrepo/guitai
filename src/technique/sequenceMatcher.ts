/**
 * SequenceMatcher — compares what the learner played against the expected note
 * sequence of a technique exercise.
 *
 * Method (slot-first matching, which handles pauses and repeats gracefully):
 *  1. the expected notes define a grid of *slots* at `passStartMs + i·stepMs`;
 *  2. each detected note is matched to the nearest free slot inside a time
 *     window (±`timingWindowRatio` × step): timing decides *which* note of the
 *     exercise it was;
 *  3. the pitch difference (cents) decides whether it was **correct**;
 *  4. unmatched slots are pauses; unmatched detected notes are extras (retries).
 *
 * It returns exactly the metrics the research says matter and that a microphone
 * can honestly measure: accuracy, intonation in cents, timing dispersion,
 * rushing/dragging and pauses. It never claims to know which finger was used.
 *
 * Pure + unit tested with synthetic note streams.
 */

import { centsBetween, frequencyToMidi, midiToNoteName } from '../theory/music';
import {
  expectedTimeMs,
  stepMsFor,
  type ExerciseCriteria,
  type TechniqueExercise,
} from './exercises';
import { median, summarizePauses, summarizeTiming } from './timingAnalysis';

export interface DetectedNote {
  /** Detected fundamental (Hz). */
  readonly frequency: number;
  /** Onset time in ms. */
  readonly startMs: number;
  /** Peak level (0…1), for attack regularity. */
  readonly level?: number;
}

export interface MatchOptions {
  /** Maximum |cents| for a note to count as correct (default 35). */
  readonly centsTolerance?: number;
  /** Time window for slot assignment as a fraction of the step (default 0.7). */
  readonly timingWindowRatio?: number;
}

export interface MatchedSlot {
  readonly slot: number;
  readonly expectedMidi: number;
  readonly expectedLabel: string;
  readonly expectedTimeMs: number;
  /** Null when the learner did not play anything for this slot. */
  readonly detectedFrequency: number | null;
  readonly detectedMidi: number | null;
  readonly detectedLabel: string | null;
  readonly cents: number | null;
  readonly timingMs: number | null;
  readonly level: number | null;
  readonly correct: boolean;
}

export interface SequenceMatchResult {
  readonly slots: readonly MatchedSlot[];
  readonly expectedCount: number;
  readonly detectedCount: number;
  /** Correct notes / expected notes (0…1). */
  readonly accuracy: number;
  /** Median of the signed cents deviations of the played notes. */
  readonly medianCents: number | null;
  /** Median of the absolute cents deviations. */
  readonly medianAbsCents: number | null;
  readonly timingMeanMs: number | null;
  readonly timingStdMs: number | null;
  readonly maxAbsTimingMs: number | null;
  readonly rushing: boolean;
  readonly dragging: boolean;
  readonly pauses: number;
  readonly longestPauseNotes: number;
  readonly extraNotes: number;
  /** Dispersion of the attack levels (regularity drills). */
  readonly levelStd: number | null;
  /** Whether this pass meets the exercise's exit criteria. */
  readonly pass: boolean;
}

const DEFAULT_CENTS_TOLERANCE = 35;
const DEFAULT_WINDOW_RATIO = 0.7;

export function matchSequence(
  exercise: TechniqueExercise,
  bpm: number,
  detected: readonly DetectedNote[],
  passStartMs: number,
  options: MatchOptions = {},
): SequenceMatchResult {
  const centsTolerance = options.centsTolerance ?? DEFAULT_CENTS_TOLERANCE;
  const windowRatio = options.timingWindowRatio ?? DEFAULT_WINDOW_RATIO;
  const stepMs = stepMsFor(exercise, bpm);
  const windowMs = stepMs * windowRatio;

  const unused = detected
    .map((note, index) => ({ note, index, used: false }))
    .sort((a, b) => a.note.startMs - b.note.startMs);

  const slots: MatchedSlot[] = [];
  const missingIndexes: number[] = [];
  const deviations: number[] = [];
  const absCents: number[] = [];
  const signedCents: number[] = [];
  const levels: number[] = [];

  for (let slot = 0; slot < exercise.notes.length; slot++) {
    const expectedMidi = exercise.notes[slot].midi;
    const expectedMs = passStartMs + expectedTimeMs(exercise, bpm, slot);

    let best: { note: DetectedNote; index: number } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of unused) {
      if (candidate.used) continue;
      const distance = Math.abs(candidate.note.startMs - expectedMs);
      if (distance <= windowMs && distance < bestDistance) {
        best = { note: candidate.note, index: candidate.index };
        bestDistance = distance;
      }
    }

    if (!best) {
      missingIndexes.push(slot);
      slots.push({
        slot,
        expectedMidi,
        expectedLabel: midiToNoteName(expectedMidi),
        expectedTimeMs: expectedMs,
        detectedFrequency: null,
        detectedMidi: null,
        detectedLabel: null,
        cents: null,
        timingMs: null,
        level: null,
        correct: false,
      });
      continue;
    }

    unused[best.index].used = true;
    const note = best.note;
    const expectedFrequency = 440 * 2 ** ((expectedMidi - 69) / 12);
    const cents = centsBetween(note.frequency, expectedFrequency);
    const detectedMidi = frequencyToMidi(note.frequency);
    const timingMs = note.startMs - expectedMs;
    const correct = Math.abs(cents) <= centsTolerance;

    deviations.push(timingMs);
    absCents.push(Math.abs(cents));
    signedCents.push(cents);
    if (note.level !== undefined) levels.push(note.level);

    slots.push({
      slot,
      expectedMidi,
      expectedLabel: midiToNoteName(expectedMidi),
      expectedTimeMs: expectedMs,
      detectedFrequency: note.frequency,
      detectedMidi,
      detectedLabel: midiToNoteName(detectedMidi),
      cents,
      timingMs,
      level: note.level ?? null,
      correct,
    });
  }

  const extraNotes = unused.filter((candidate) => !candidate.used).length;
  const correctCount = slots.filter((slot) => slot.correct).length;
  const accuracy = exercise.notes.length === 0 ? 0 : correctCount / exercise.notes.length;
  const timing = summarizeTiming(deviations, stepMs);
  const pauses = summarizePauses(missingIndexes);
  const levelStats = summarizeLevels(levels);

  const criteria: ExerciseCriteria = exercise.criteria;
  const pass =
    accuracy >= criteria.minAccuracy &&
    (median(absCents) ?? Number.POSITIVE_INFINITY) <= criteria.maxMedianCents &&
    (timing?.stdMs ?? Number.POSITIVE_INFINITY) <= criteria.maxTimingStdMs &&
    pauses.pauses === 0;

  return {
    slots,
    expectedCount: exercise.notes.length,
    detectedCount: detected.length,
    accuracy,
    medianCents: median(signedCents),
    medianAbsCents: median(absCents),
    timingMeanMs: timing?.meanMs ?? null,
    timingStdMs: timing?.stdMs ?? null,
    maxAbsTimingMs: timing?.maxAbsMs ?? null,
    rushing: timing?.rushing ?? false,
    dragging: timing?.dragging ?? false,
    pauses: pauses.pauses,
    longestPauseNotes: pauses.longestRun,
    extraNotes,
    levelStd: levelStats,
    pass,
  };
}

function summarizeLevels(levels: readonly number[]): number | null {
  if (levels.length < 2) return null;
  const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  const variance = levels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / levels.length;
  return Math.sqrt(variance);
}
