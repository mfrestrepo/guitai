/**
 * Tuning evaluator — turns a (smoothed) detected pitch into the answer the
 * guitarist sees: which string it belongs to and how far off it is, in cents,
 * with a discrete verdict used by the UI for colour and wording.
 *
 * Pure logic, no DOM and no audio: see `evaluator.test.ts`.
 */

import { centsBetween } from '../theory/music';
import {
  type NearestString,
  type Tuning,
  type TuningStringDef,
  nearestStringForFrequency,
  stringByNumber,
  stringFrequency,
} from '../theory/tunings';

/**
 * "In tune" tolerance, ±5 cents.
 *
 * Rationale: ±5¢ (~0.3% of frequency) is the accuracy most clip-on tuners and
 * practicing guitarists work to — it is below what most people can reliably
 * hear, but still a real, achievable target. A looser band (e.g. ±10¢) leaves
 * audible beats against other strings; a tighter one makes the display dance
 * on a well-tuned string because of measurement jitter.
 */
export const IN_TUNE_MAX_CENTS = 5;

/**
 * Below this deviation (in the "nearly" bands) the pitch is close enough that
 * the user should keep fine-tuning gently; beyond it the string is clearly
 * flat/sharp and the peg needs a decisive turn. ±15¢ is about a third of a
 * semitone — well outside "in tune" but not yet "another string".
 */
export const CLEARLY_OFF_MIN_CENTS = 15;

export type Verdict = 'flat' | 'nearlyFlat' | 'inTune' | 'nearlySharp' | 'sharp';

export interface TuningResult {
  /** The string the pitch was matched to. */
  readonly string: TuningStringDef;
  /** Open-string target frequency in Hz. */
  readonly targetFrequency: number;
  /** Detected (smoothed) frequency in Hz. */
  readonly detectedFrequency: number;
  /**
   * Signed deviation in cents: positive = sharp (detected above target),
   * negative = flat (detected below target).
   */
  readonly cents: number;
  /** Discrete verdict derived from {@link verdictForCents}. */
  readonly verdict: Verdict;
}

/**
 * Maps a signed cent deviation onto one of the five states the UI must
 * distinguish (flat / nearly in tune / in tune / nearly sharp / sharp).
 */
export function verdictForCents(cents: number): Verdict {
  if (cents > CLEARLY_OFF_MIN_CENTS) return 'sharp';
  if (cents > IN_TUNE_MAX_CENTS) return 'nearlySharp';
  if (cents < -CLEARLY_OFF_MIN_CENTS) return 'flat';
  if (cents < -IN_TUNE_MAX_CENTS) return 'nearlyFlat';
  return 'inTune';
}

/**
 * Evaluate a detected pitch against a tuning.
 *
 * @param detectedHz         Smoothed fundamental in Hz.
 * @param tuning             Tuning preset to evaluate against.
 * @param preferredStringNumber Optional physical string (1–6) to lock as the
 *                           target. When omitted the nearest string wins —
 *                           needed because a badly detuned string can sit
 *                           closer to its neighbour's pitch than its own.
 */
export function evaluateTuning(
  detectedHz: number,
  tuning: Tuning,
  preferredStringNumber?: number,
): TuningResult {
  let match: NearestString;
  let string: TuningStringDef | undefined;

  if (preferredStringNumber !== undefined) {
    string = stringByNumber(tuning, preferredStringNumber);
    if (string === undefined) {
      // Fall back to automatic matching for unknown string numbers.
      match = nearestStringForFrequency(tuning, detectedHz);
      string = match.string;
    } else {
      match = { string, cents: centsBetween(detectedHz, stringFrequency(string)) };
    }
  } else {
    match = nearestStringForFrequency(tuning, detectedHz);
    string = match.string;
  }

  return {
    string,
    targetFrequency: stringFrequency(string),
    detectedFrequency: detectedHz,
    cents: match.cents,
    verdict: verdictForCents(match.cents),
  };
}
