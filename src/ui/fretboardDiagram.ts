/**
 * Fretboard diagram for technique exercises (SVG, pure).
 *
 * Draws a vertical neck (nut at the top, 6 strings left → right as 6…1), the
 * unique positions of the exercise as faint dots with their note names, and the
 * **current expected position** highlighted so the learner always knows where
 * to go next.
 */

import type { StringNumber } from '../chords/catalog';
import { midiToNoteName } from '../theory/music';
import type { TechniqueExercise } from '../technique/exercises';

export interface FretboardOptions {
  /** Position currently expected (highlighted). */
  readonly current?: { readonly stringNumber: StringNumber; readonly fret: number } | null;
  /** How many frets to draw (default: enough for the exercise, at least 5). */
  readonly frets?: number;
  /** Draw note names on the dots (default true). */
  readonly showLabels?: boolean;
}

const STRING_GAP = 34;
const FRET_HEIGHT = 34;
const PAD_LEFT = 30;
const PAD_TOP = 34;

export function fretboardSvg(exercise: TechniqueExercise, options: FretboardOptions = {}): string {
  const positions = uniquePositions(exercise);
  const maxFret = Math.max(1, ...positions.map((p) => p.fret));
  const frets = Math.max(options.frets ?? 0, maxFret, 4);
  const showLabels = options.showLabels ?? true;

  const width = PAD_LEFT + STRING_GAP * 5 + 34;
  const height = PAD_TOP + FRET_HEIGHT * frets + 20;

  const x = (stringNumber: number) => PAD_LEFT + (6 - stringNumber) * STRING_GAP;
  const y = (fret: number) => PAD_TOP + (fret - 0.5) * FRET_HEIGHT;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="fretboard-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Diapasón: ${exercise.title}">`,
  );
  // Nut.
  parts.push(
    `<rect class="fb-nut" x="${PAD_LEFT - 7}" y="${PAD_TOP - 4}" width="${STRING_GAP * 5 + 14}" height="4" rx="1.5"/>`,
  );
  // Fret lines.
  for (let fret = 1; fret <= frets; fret++) {
    const yy = PAD_TOP + fret * FRET_HEIGHT;
    parts.push(
      `<line class="fb-fret" x1="${PAD_LEFT}" y1="${yy}" x2="${PAD_LEFT + STRING_GAP * 5}" y2="${yy}"/>`,
    );
    parts.push(
      `<text class="fb-fret-number" x="${PAD_LEFT - 14}" y="${yy + 4}" text-anchor="end">${fret}</text>`,
    );
  }
  // Strings + labels.
  for (let stringNumber = 6 as StringNumber; stringNumber >= 1; stringNumber--) {
    const xx = x(stringNumber);
    parts.push(
      `<line class="fb-string" x1="${xx}" y1="${PAD_TOP}" x2="${xx}" y2="${PAD_TOP + frets * FRET_HEIGHT}"/>`,
    );
    parts.push(
      `<text class="fb-string-label" x="${xx}" y="${PAD_TOP - 10}" text-anchor="middle">${stringNumber}</text>`,
    );
  }
  // Positions.
  for (const position of positions) {
    const isCurrent =
      options.current !== null &&
      options.current !== undefined &&
      options.current.stringNumber === position.stringNumber &&
      options.current.fret === position.fret;
    const xx = x(position.stringNumber);
    const yy = y(position.fret);
    parts.push(
      `<circle class="fb-dot${isCurrent ? ' current' : ''}" cx="${xx}" cy="${yy}" r="${isCurrent ? 13 : 9}"/>`,
    );
    if (showLabels && isCurrent) {
      parts.push(
        `<text class="fb-note" x="${xx}" y="${yy + 4}" text-anchor="middle">${midiToNoteName(position.midi)}</text>`,
      );
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Unique string/fret positions of an exercise (order preserved). */
export function uniquePositions(
  exercise: TechniqueExercise,
): { stringNumber: StringNumber; fret: number; midi: number }[] {
  const seen = new Set<string>();
  const result: { stringNumber: StringNumber; fret: number; midi: number }[] = [];
  for (const note of exercise.notes) {
    const key = `${note.stringNumber}:${note.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ stringNumber: note.stringNumber, fret: note.fret, midi: note.midi });
  }
  return result;
}
