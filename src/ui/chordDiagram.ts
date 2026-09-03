/**
 * SVG chord diagram generator — pure function (no DOM).
 *
 * Draws a classic chord box: vertical strings (6 = left … 1 = right), fret
 * rows below a nut, open-string rings above the nut and an ✕ for muted
 * strings, plus the recommended finger numbers inside the dots.
 *
 * Two extras make it the *visual core* of the didactic UI:
 *  - colors are driven by CSS custom properties, so a caller can light strings
 *    per state (ok / wrong / sounding) by passing `highlight`;
 *  - `scale` produces the same diagram at hero or mini-card size.
 */

import type { ChordDef, StringNumber } from '../chords/catalog';

export type StringState = 'ok' | 'wrong' | 'sounding';

export interface ChordDiagramOptions {
  /** Per-string visual state used while validating/practicing. */
  highlight?: Readonly<Partial<Record<StringNumber, StringState>>>;
  /** 1 = hero size (default), smaller values = mini diagrams. */
  scale?: number;
  /** Draw the nut as a thick bar (default true). */
  showNut?: boolean;
}

const DEFAULT_ACCENT = '#22d3ee';

export function chordDiagramSvg(
  chord: ChordDef,
  options: ChordDiagramOptions = {},
): string {
  const { highlight = {}, scale = 1, showNut = true } = options;
  const k = scale;

  const fretted = chord.strings
    .map((s) => s.fret)
    .filter((f): f is number => f !== null && f > 0);
  const maxFret = fretted.length > 0 ? Math.max(...fretted) : 1;

  const rowHeight = 34 * k;
  const top = 30 * k;
  const left = 26 * k;
  const right = 26 * k;
  const stringGap = 40 * k;
  const width = left + right + stringGap * 5;
  const bottomLabels = 22 * k;
  const height = 10 * k + top + maxFret * rowHeight + bottomLabels;

  const x = (stringNumber: number) => left + (6 - stringNumber) * stringGap;
  const yOfFret = (fret: number) => top + (fret - 1) * rowHeight + rowHeight / 2;
  const fontSize = 13 * k;
  const markerRadius = 12 * k;
  const openRingY = top - 14 * k;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Diagrama de ${chord.displayName}">`,
  );

  // Nut.
  if (showNut) {
    parts.push(
      `<rect class="cd-nut" x="${left - 6 * k}" y="${top - 3 * k}" width="${right + 5 * stringGap + 12 * k}" height="${4 * k}" rx="${1.5 * k}"/>`,
    );
  }

  // Fret rows.
  for (let row = 1; row <= maxFret; row++) {
    const yy = top + row * rowHeight;
    parts.push(
      `<line class="cd-fret" x1="${left}" y1="${yy}" x2="${left + 5 * stringGap}" y2="${yy}"/>`,
    );
  }

  // Strings + bottom number labels.
  for (const string of chord.strings) {
    const xx = x(string.number);
    parts.push(
      `<line class="cd-string" x1="${xx}" y1="${top}" x2="${xx}" y2="${top + maxFret * rowHeight}"/>`,
    );
    parts.push(
      `<text class="cd-string-label" x="${xx}" y="${top + maxFret * rowHeight + 15 * k}" text-anchor="middle" font-size="${9 * k}">${string.number}</text>`,
    );
  }

  // Markers (dots / open rings / muted crosses).
  for (const string of chord.strings) {
    const xx = x(string.number);
    const state = highlight[string.number] ?? 'idle';

    if (string.fret === null) {
      parts.push(
        `<text class="cd-mute cd-s${string.number} cd-${state}" x="${xx}" y="${top - 8 * k}" text-anchor="middle" font-size="${17 * k}" font-weight="700">&#10005;</text>`,
      );
      continue;
    }
    if (string.fret === 0) {
      parts.push(
        `<circle class="cd-ring cd-s${string.number} cd-${state}" cx="${xx}" cy="${openRingY}" r="${6.5 * k}"/>`,
      );
      continue;
    }
    const cy = yOfFret(string.fret);
    parts.push(`<circle class="cd-dot cd-s${string.number} cd-${state}" cx="${xx}" cy="${cy}" r="${markerRadius}"/>`);
    if (string.finger) {
      parts.push(
        `<text class="cd-finger cd-s${string.number}" x="${xx}" y="${cy + 4 * k}" text-anchor="middle" font-size="${fontSize}" font-weight="700">${string.finger}</text>`,
      );
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

/** Export so callers can compute colors consistently (CSS vars live in css). */
export const _diagramDefaultAccent = DEFAULT_ACCENT;
