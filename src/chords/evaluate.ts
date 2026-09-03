/**
 * Per-string chord checking.
 *
 * In the arpeggio mode the learner plays the strings of a chord one at a time
 * (low → high). Because each pluck is (supposed to be) a single note, we reuse
 * the monophonic YIN detector — which is already cents-accurate — and compare
 * the detected pitch with the note the string *should* sound for the selected
 * chord. This module is pure: it maps "chord + string + detected Hz" to a
 * verdict. Copy / wording lives in the UI.
 */

import { centsBetween, midiToNoteName, frequencyToMidi } from '../theory/music';
import {
  type ChordDef,
  type StringNumber,
  expectedFrequency,
  expectedNoteName,
} from './catalog';

/**
 * A string counts as "played correctly" when the detected pitch is within
 * ±45 cents of the expected note. A slightly detuned guitar (up to ~±20¢)
 * still passes, while a *different note* (≥100¢ away, one semitone) clearly
 * fails. 45¢ keeps a comfortable margin under the 100¢ semitone boundary.
 */
export const OK_CENTS = 45;

/**
 * Between ±45¢ and ±80¢ we tell the learner they are *very close*: most likely
 * the guitar is a little out of tune rather than the fingering being wrong.
 */
export const CLOSE_CENTS = 80;

export type NoteCheckKind = 'ok' | 'almost' | 'wrong';

export interface NoteCheck {
  /** The string that was supposed to sound. */
  readonly targetStringNumber: StringNumber;
  /** Name the string should sound, e.g. "B2". */
  readonly expectedName: string;
  /** Frequency the string should sound (Hz). */
  readonly expectedFrequency: number;
  /** Pitch actually detected (Hz). */
  readonly detectedFrequency: number;
  /** Scientific name of the detected pitch, e.g. "C3". */
  readonly detectedName: string;
  /** Signed deviation in cents (+ = detected sharp). */
  readonly cents: number;
  readonly kind: NoteCheckKind;
}

/**
 * Check a detected (single) note against the note one string of a chord
 * should sound. `detectedHz` must already be a voiced pitch.
 */
export function evaluateStringNote(
  chord: ChordDef,
  stringNumber: StringNumber,
  detectedHz: number,
): NoteCheck {
  const expectedFrequencyValue = expectedFrequency(chord, stringNumber);
  const expectedName = expectedNoteName(chord, stringNumber);
  if (expectedFrequencyValue === null || expectedName === null) {
    throw new Error(`Chord "${chord.id}": string ${stringNumber} is muted — nothing to check.`);
  }

  const cents = centsBetween(detectedHz, expectedFrequencyValue);
  const magnitude = Math.abs(cents);
  const kind: NoteCheckKind =
    magnitude <= OK_CENTS ? 'ok' : magnitude <= CLOSE_CENTS ? 'almost' : 'wrong';

  return {
    targetStringNumber: stringNumber,
    expectedFrequency: expectedFrequencyValue,
    expectedName,
    detectedFrequency: detectedHz,
    detectedName: midiToNoteName(frequencyToMidi(detectedHz)),
    cents,
    kind,
  };
}

/** True when a detected pitch matches the expected note of the string. */
export function isCorrect(chord: ChordDef, stringNumber: StringNumber, detectedHz: number): boolean {
  return evaluateStringNote(chord, stringNumber, detectedHz).kind === 'ok';
}
