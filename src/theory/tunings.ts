/**
 * Data-driven guitar tuning definitions.
 *
 * Every tuner feature reads from a {@link Tuning}, never from hard-coded
 * frequencies scattered through the UI or the engine. Adding a new tuning
 * (Drop D, Open G, ...) is therefore just a new entry in this module:
 *
 *   {
 *     id: 'drop-d',
 *     name: 'Drop D',
 *     strings: [ ...same as standard but with { number: 6, name: 'D2', midi: 38 } ],
 *   }
 *
 * and it automatically appears in the tuning picker and is used for string
 * identification and cent calculation.
 */

import { midiToFrequency, midiToNoteName } from './music';

export interface TuningStringDef {
  /**
   * Physical string number, guitar convention: 1 = highest/thinnest string
   * (high E), 6 = lowest/thickest string (low E).
   */
  readonly number: 1 | 2 | 3 | 4 | 5 | 6;
  /** Open-string note name with octave, e.g. "E2". */
  readonly name: string;
  /** MIDI note of the open string (A4 = 69). */
  readonly midi: number;
}

export interface Tuning {
  /** Stable machine id used by the engine, e.g. "standard". */
  readonly id: string;
  /** Human readable label shown in the tuning picker. */
  readonly name: string;
  /** Strings ordered low → high (6th string first), like a guitar laid down. */
  readonly strings: readonly TuningStringDef[];
}

/** Frequency (Hz) a string sounds when played open. */
export function stringFrequency(string: TuningStringDef): number {
  return midiToFrequency(string.midi);
}

/** All available tunings. The picker is rendered straight from this list. */
export const TUNINGS: readonly Tuning[] = [
  {
    id: 'standard',
    name: 'Standard (E A D G B E)',
    strings: [
      { number: 6, name: 'E2', midi: 40 },
      { number: 5, name: 'A2', midi: 45 },
      { number: 4, name: 'D3', midi: 50 },
      { number: 3, name: 'G3', midi: 55 },
      { number: 2, name: 'B3', midi: 59 },
      { number: 1, name: 'E4', midi: 64 },
    ],
  },
];

export function tuningById(id: string): Tuning | undefined {
  return TUNINGS.find((tuning) => tuning.id === id);
}

export function stringByNumber(tuning: Tuning, number: number): TuningStringDef | undefined {
  return tuning.strings.find((string) => string.number === number);
}

/** Smallest magnitude cents deviation a string can have (used for ties). */
export interface NearestString {
  readonly string: TuningStringDef;
  /** Deviation of `frequency` from the open string, in cents (signed). */
  readonly cents: number;
}

/**
 * The string whose open note is closest to `frequency`, measured in cents.
 *
 * The tuner uses this to answer "which string am I playing?" purely from the
 * detected pitch. String neighbours are ~500 cents (a fourth) apart, so a
 * moderately detuned string (a few tens of cents) is still unambiguous.
 */
export function nearestStringForFrequency(tuning: Tuning, frequency: number): NearestString {
  let best: NearestString | null = null;
  for (const string of tuning.strings) {
    const cents = centsFromFrequency(frequency, string);
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { string, cents };
    }
  }
  // `strings` is never empty; keep TS happy without throwing at runtime cost.
  return best as NearestString;
}

/** Signed cents deviation of `frequency` from the open-string pitch. */
export function centsFromFrequency(frequency: number, string: TuningStringDef): number {
  // 1200 · log₂(freq / target) — see music.centsBetween. Inlined to keep the
  // guitar-string vocabulary local.
  return 1200 * Math.log2(frequency / stringFrequency(string));
}

// Sanity check at load time: names must be consistent with MIDI + octave math,
// so a typo in a tuning table cannot silently ship.
for (const tuning of TUNINGS) {
  for (const string of tuning.strings) {
    const expected = midiToNoteName(string.midi);
    if (string.name !== expected) {
      throw new Error(
        `Tuning "${tuning.id}": string ${string.number} name "${string.name}" ` +
          `does not match midi ${string.midi} (expected "${expected}")`,
      );
    }
  }
}
