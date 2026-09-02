/**
 * Music-theory math shared across GuitAI modules.
 *
 * The tuner only needs frequency/MIDI/cents conversions, but keeping this in
 * its own framework-free module means future modules (chord recognition,
 * exercises, ...) can reuse the same helpers instead of re-implementing them.
 *
 * Conventions:
 *  - MIDI note numbers use A4 (440 Hz) = 69, as usual.
 *  - "Cents" measure a logarithmic frequency ratio: 100 cents = 1 semitone,
 *    1200 cents = 1 octave. Positive cents = higher pitch.
 */

export const A4_MIDI = 69;
export const A4_FREQUENCY_HZ = 440;

const PITCH_CLASS_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

/** Frequency (Hz) of a MIDI note in 12-tone equal temperament (A4 = 440 Hz). */
export function midiToFrequency(midi: number): number {
  return A4_FREQUENCY_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/** Nearest MIDI note number for a frequency (equal temperament, A4 = 440). */
export function frequencyToMidi(frequency: number): number {
  return Math.round(12 * Math.log2(frequency / A4_FREQUENCY_HZ) + A4_MIDI);
}

/**
 * Deviation of `frequency` from a `referenceFrequency`, in cents.
 * Positive → the measured frequency is sharp (higher) than the reference.
 *
 *   cents = 1200 · log₂(frequency / reference)
 */
export function centsBetween(frequency: number, referenceFrequency: number): number {
  return 1200 * Math.log2(frequency / referenceFrequency);
}

/** Frequency that is `cents` away (in the logarithmic cents scale) from `baseFrequency`. */
export function frequencyFromCentsOffset(baseFrequency: number, cents: number): number {
  return baseFrequency * 2 ** (cents / 1200);
}

/**
 * Scientific pitch name of a MIDI note, e.g. 40 → "E2", 69 → "A4".
 * Sharps are used for black keys (no enharmonic preference yet).
 */
export function midiToNoteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASS_NAMES[pitchClass]}${octave}`;
}
