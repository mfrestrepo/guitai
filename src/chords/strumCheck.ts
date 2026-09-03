/**
 * Strum (rasgueo) chord check — spectral validation of a *sustained* strum.
 *
 * A single microphone cannot perfectly separate six simultaneously ringing
 * strings (their harmonics alias onto each other), but it CAN reliably answer
 * "does this strum sound like the chord?" by checking three things:
 *
 *   1. presence   — strong energy at (almost) every sounding string's expected
 *                   fundamental band (a missing band ⇒ a muted string);
 *   2. muting     — no energy where muted ("x") strings should stay silent
 *                   (reliable for the low strings of these open chords);
 *   3. foreign    — strong peaks in the 82–400 Hz fundamental region that are
 *                   not chord tones ⇒ a mis-fretted / badly tuned string.
 *
 * The 400 Hz scan cap is deliberate: for these open chords the harmonics of a
 * *correctly* ringing string stay inside the chord's pitch classes up to
 * ~400 Hz, so an out-of-chord peak down there means something is really wrong.
 * Higher harmonics wander outside the chord legitimately and are ignored.
 *
 * Pure + unit tested with synthesized strums (see strumCheck.test.ts). The
 * microphone plumbing lives in micSession.ts / strumSession.ts.
 */

import { type ChordDef, type StringNumber, expectedMidi } from './catalog';
import { frequencyToMidi, midiToNoteName } from '../theory/music';
import { bandMean, bandMedian, bandPeak, magnitudeSpectrum, spectralPeaks } from './spectral';

/** Frames the strum session reads from the analyser (≈370 ms @ 44.1 kHz). */
export const STRUM_FRAME_SIZE = 16384;

/** Half-width of a string's fundamental band (± cents). */
export const BAND_CENTS = 55;

/** A sounding string is "missing" unless its band mean ≥ this × the strongest. */
export const MISSING_MEAN_RATIO = 0.12;
/** …or its band peak ≥ this × the strongest band peak (protects weak highs). */
export const MISSING_PEAK_RATIO = 0.15;

/** A muted string "rings" when its band mean ≥ this × the strongest band. */
export const MUTED_RING_RATIO = 0.45;

/** A foreign peak must be ≥ this × the strongest band peak to count. */
export const FOREIGN_RATIO = 0.42;

/** Noise floor (median magnitude over this range) subtracted from every band. */
export const NOISE_RANGE_HZ: readonly [number, number] = [1500, 6000];

/** Foreign-note scan cap in Hz — see the file header for the rationale. */
export const FOREIGN_SCAN_MAX_HZ = 400;

/** Below these levels the frame is treated as silence (no strum). */
export const QUIET_BAND_MEAN = 0.01;
export const QUIET_BAND_PEAK = 0.02;

export type StrumIssueKind = 'missing' | 'muted-ring' | 'foreign';

export interface StrumIssue {
  readonly kind: StrumIssueKind;
  /** Affected string (only for string-level issues). */
  readonly stringNumber?: StringNumber;
  /** Human label of the expected/heard note, e.g. "E3" / "F3 (174.6 Hz)". */
  readonly noteLabel?: string;
}

export interface StrumStringScore {
  readonly stringNumber: StringNumber;
  /** Note the string should sound (null for muted strings). */
  readonly expectedLabel: string | null;
  /** Band energy relative to the strongest sounding band (0…1+). */
  readonly score: number;
  /** Ringing? (sounding strings: present. muted strings: wrongly sounding.) */
  readonly ringing: boolean;
}

export type StrumVerdict = 'quiet' | 'correct' | 'issues';

export interface StrumCheckResult {
  readonly verdict: StrumVerdict;
  /** Scores for all six strings (low → high order). */
  readonly scores: readonly StrumStringScore[];
  readonly issues: readonly StrumIssue[];
}

interface Band {
  readonly stringNumber: StringNumber;
  readonly muted: boolean;
  readonly midi: number | null; // expected pitch (muted ⇒ open-string pitch)
  readonly frequency: number;
  readonly label: string | null;
}

const OPEN_MIDI: Readonly<Record<StringNumber, number>> = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };

const centsFactor = (cents: number) => 2 ** (cents / 1200);
const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The six string bands of the chord; muted strings listen to their open pitch. */
function stringBands(chord: ChordDef): Band[] {
  return chord.strings.map((string) => {
    const midi = expectedMidi(chord, string.number) ?? OPEN_MIDI[string.number];
    const expected = expectedMidi(chord, string.number);
    const muted = string.fret === null;
    return {
      stringNumber: string.number,
      muted,
      midi: expected,
      frequency: midiToFrequency(midi),
      label: expected === null ? null : midiToNoteName(expected),
    };
  });
}

function bandBounds(center: number): readonly [number, number] {
  return [center * centsFactor(-BAND_CENTS), center * centsFactor(BAND_CENTS)];
}

/**
 * Analyze one sustained strum frame against a chord.
 *
 * @param samples Power-of-two PCM frame (STRUM_FRAME_SIZE for the mic).
 * @returns verdict + per-string scores + issues.
 */
export function analyzeStrum(
  chord: ChordDef,
  samples: Float32Array,
  sampleRate: number,
): StrumCheckResult {
  const mag = magnitudeSpectrum(samples);
  const bands = stringBands(chord);
  const noise = bandMedian(mag, sampleRate, NOISE_RANGE_HZ[0], NOISE_RANGE_HZ[1]);

  const bandStats = bands.map((band) => {
    const [low, high] = bandBounds(band.frequency);
    return {
      band,
      meanNet: Math.max(0, bandMean(mag, sampleRate, low, high) - noise),
      peakNet: Math.max(0, bandPeak(mag, sampleRate, low, high) - noise),
    };
  });

  const sounding = bandStats.filter((s) => !s.band.muted);
  const peakBandMean = sounding.reduce((max, s) => Math.max(max, s.meanNet), 0);
  const peakBandPeak = sounding.reduce((max, s) => Math.max(max, s.peakNet), 0);

  // Absolute silence gate: is there a strum at all?
  if (peakBandMean < QUIET_BAND_MEAN || peakBandPeak < QUIET_BAND_PEAK) {
    return { verdict: 'quiet', scores: [], issues: [] };
  }

  const scores: StrumStringScore[] = bandStats.map((s) => {
    const meanOk = s.meanNet >= MISSING_MEAN_RATIO * peakBandMean;
    const peakOk = s.peakNet >= MISSING_PEAK_RATIO * peakBandPeak;
    const threshold = s.band.muted ? MUTED_RING_RATIO : 0; // muted handled below
    const ringing = s.band.muted
      ? s.meanNet / peakBandMean >= threshold
      : meanOk || peakOk;
    return {
      stringNumber: s.band.stringNumber,
      expectedLabel: s.band.label,
      score: s.meanNet / peakBandMean,
      ringing,
    };
  });

  const issues: StrumIssue[] = [];

  // Missing sounding strings (ordered low → high = beginner check order).
  for (const score of scores) {
    const band = bands.find((b) => b.stringNumber === score.stringNumber)!;
    if (band.muted) continue;
    if (!score.ringing) {
      issues.push({
        kind: 'missing',
        stringNumber: score.stringNumber,
        noteLabel: score.expectedLabel ?? undefined,
      });
    }
  }

  // Muted strings that ring.
  for (const score of scores) {
    const band = bands.find((b) => b.stringNumber === score.stringNumber)!;
    if (!band.muted) continue;
    if (score.ringing) {
      issues.push({
        kind: 'muted-ring',
        stringNumber: score.stringNumber,
        noteLabel: band.label ?? undefined,
      });
    }
  }

  // Foreign notes in the fundamental region.
  const chordPitchClasses = new Set<number>();
  for (const band of bands) {
    if (band.midi !== null) chordPitchClasses.add(((band.midi % 12) + 12) % 12);
  }
  const maxFundamental = Math.max(...sounding.map((s) => s.band.frequency));
  const scanHigh = Math.min(FOREIGN_SCAN_MAX_HZ, maxFundamental * 1.6);
  const n = (mag.length - 1) * 2;
  const bin = (freq: number) => (freq * n) / sampleRate;
  const peaks = spectralPeaks(mag, sampleRate, Math.ceil(bin(82)), Math.floor(bin(scanHigh)));

  const seenPcs = new Set<number>();
  for (const peak of peaks) {
    if (peak.amplitude < FOREIGN_RATIO * peakBandPeak) continue;
    if (peak.frequency < 82) continue;
    const insideAnyBand = bands.some((b) => {
      const [low, high] = bandBounds(b.frequency);
      return peak.frequency >= low && peak.frequency <= high;
    });
    if (insideAnyBand) continue;
    const midi = frequencyToMidi(peak.frequency);
    const pc = ((midi % 12) + 12) % 12;
    if (chordPitchClasses.has(pc)) continue; // in-chord overtone — fine
    if (seenPcs.has(pc)) continue; // octave duplicate of the same wrong note
    seenPcs.add(pc);
    issues.push({
      kind: 'foreign',
      noteLabel: `${midiToNoteName(midi)} (${peak.frequency.toFixed(1)} Hz)`,
    });
    if (seenPcs.size >= 2) break;
  }

  const verdict: StrumVerdict = issues.length === 0 ? 'correct' : 'issues';
  return { verdict, scores, issues };
}
