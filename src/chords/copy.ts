/**
 * Spanish copy helpers for the chord module.
 *
 * All user-facing wording is generated here from chord *data* (never from
 * scattered strings in the UI), and every function is pure so the wording can
 * be unit tested (see copy.test.ts). Chord names stay in international letters
 * (Em, G, A…) because that is how chords are written on paper; individual
 * notes are shown both ways: "Mi (E2)".
 */

import type { ChordDef, StringNumber } from './catalog';
import { expectedMidi } from './catalog';
import { centsBetween } from '../theory/music';
import type { NoteCheck } from './evaluate';
import type { StrumIssueKind as StrumCheckIssueKind } from './strumCheck';

const SOLFEO = [
  'Do',
  'Do#',
  'Re',
  'Re#',
  'Mi',
  'Fa',
  'Fa#',
  'Sol',
  'Sol#',
  'La',
  'La#',
  'Si',
] as const;

const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** "5ª cuerda" for a string number. */
export function stringOrdinal(number: StringNumber): string {
  return `${number}ª cuerda`;
}

/** Scientific name with octave, e.g. 40 → "E2". */
export function midiToLetter(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${LETTERS[pitchClass]}${octave}`;
}

/** Spanish note with octave + international one: "Mi (E2)". */
export function noteLabelEs(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  return `${SOLFEO[pitchClass]} (${midiToLetter(midi)})`;
}

/** Same label but from a scientific name such as "A2" / "G#3". */
export function noteLabelFromName(name: string): string {
  const LETTERS_WITH_SHARP = [...LETTERS];
  const match = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!match) return name;
  const pitchClass = LETTERS_WITH_SHARP.indexOf(match[1] as (typeof LETTERS)[number]);
  const octave = Number(match[2]);
  return noteLabelEs((octave + 1) * 12 + pitchClass);
}

/** Parse a scientific note name ("A2", "G#3") back into a MIDI number. */
export function noteNameToMidi(name: string): number {
  const LETTERS_WITH_SHARP = [...LETTERS];
  const match = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!match) return 60; // fallback (should not happen with catalog data)
  const pitchClass = LETTERS_WITH_SHARP.indexOf(match[1] as (typeof LETTERS)[number]);
  const octave = Number(match[2]);
  return (octave + 1) * 12 + pitchClass;
}

/**
 * Plain-language "cómo se hace" steps built from the fingering data, in the
 * order a beginner should place fingers (low strings first).
 */
export function chordHowToLines(chord: ChordDef): string[] {
  const lines: string[] = [];

  const fretted = chord.strings.filter((s) => s.fret !== null && s.fret > 0);
  for (const string of fretted) {
    const finger = string.finger ?? '—';
    lines.push(
      `Pon el dedo ${finger} en el traste ${string.fret} de la ${stringOrdinal(string.number)}.`,
    );
  }

  const open = chord.strings.filter((s) => s.fret === 0);
  if (open.length > 0) {
    lines.push(`Suenan al aire (sin pisar): cuerdas ${open.map((s) => s.number).join(' y ')}.`);
  }

  const muted = chord.strings.filter((s) => s.fret === null);
  if (muted.length > 0) {
    lines.push(`NO toques: cuerdas ${muted.map((s) => s.number).join(' y ')} (mudas).`);
  }

  lines.push('Cuando tengas la forma, rasga y escucha: tiene que sonar limpio.');
  return lines;
}

/** What the learner should hear on a given string of a chord. */
export function expectedPhrase(chord: ChordDef, stringNumber: StringNumber): string {
  const midi = expectedMidi(chord, stringNumber);
  if (midi === null) {
    return `La ${stringOrdinal(stringNumber)} no debe sonar (muda).`;
  }
  return `La ${stringOrdinal(stringNumber)} debe sonar ${noteLabelEs(midi)}.`;
}

/** Fret / open description used in corrective messages ("en el traste 2", "al aire"). */
function positionPhrase(chord: ChordDef, stringNumber: StringNumber): string {
  const string = chord.strings.find((s) => s.number === stringNumber);
  if (!string) return '';
  if (string.fret === 0) return 'al aire (sin pisar)';
  if (string.fret === null) return 'muda';
  return `en el traste ${string.fret}`;
}

/** True when the detected pitch matches another string of the same chord. */
export function otherStringMatched(chord: ChordDef, detectedHz: number): StringNumber | null {
  for (const string of chord.strings) {
    const midi = expectedMidi(chord, string.number);
    if (midi === null) continue;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    if (Math.abs(centsBetween(detectedHz, freq)) <= 60) return string.number;
  }
  return null;
}

/** Concise, friendly wording for one strum-check issue. */
export function strumIssueLine(kind: StrumCheckIssueKind, noteLabel?: string, stringNumber?: StringNumber): string {
  const ordinal = stringNumber !== undefined ? stringOrdinal(stringNumber) : '';
  switch (kind) {
    case 'missing':
      return `La ${ordinal} no suena — quizá la tapa un dedo.`;
    case 'muted-ring':
      return `Suena la ${ordinal} y no debería — no la rasgues.`;
    case 'foreign':
      return `Se oye un ${noteLabel ?? 'tono'} que no es del acorde.`;
  }
}

/**
 * Corrective message after one string check. Returns text + a style the UI
 * can use to color the feedback box.
 */
export function describeCheck(
  chord: ChordDef,
  check: NoteCheck,
): { text: string; style: 'success' | 'warning' | 'error' } {
  const ordinal = stringOrdinal(check.targetStringNumber);
  const expected = noteLabelFromName(check.expectedName);

  if (check.kind === 'ok') {
    return {
      text: `¡Correcta! La ${ordinal} suena ${expected}.`,
      style: 'success',
    };
  }

  const detected = noteLabelFromName(check.detectedName);
  if (check.kind === 'almost') {
    return {
      text: `Muy cerca (${Math.round(check.cents)}¢): suena ${detected} y debería ser ${expected}. ¿Está afinada la guitarra?`,
      style: 'warning',
    };
  }

  const position = positionPhrase(chord, check.targetStringNumber);
  const base = `Suena ${detected}, pero la ${ordinal} debe sonar ${expected} (${position}).`;
  const other = otherStringMatched(chord, check.detectedFrequency);
  const hint =
    other !== null && other !== check.targetStringNumber
      ? ` Parece que tocaste la ${stringOrdinal(other)} — toca solo la ${ordinal}.`
      : ' Revisa tus dedos y vuelve a tocar esa cuerda.';
  return { text: base + hint, style: 'error' };
}
