/**
 * SVG chord diagram generator — pure function (no DOM).
 *
 * Draws a classic chord box: vertical strings (6 = left … 1 = right), fret
 * rows below a nut, open-string rings above the nut and an ✕ for muted
 * strings, plus the recommended finger numbers inside the dots. The UI just
 * injects the returned SVG string; the generator is unit tested.
 */

import type { ChordDef } from '../chords/catalog';

const COLORS = {
  background: 'transparent',
  line: '#3a4a5e',
  dot: '#22d3ee',
  dotText: '#06121a',
  open: '#8ea0b5',
  muted: '#f87171',
  fretLabel: '#8ea0b5',
};

interface Geometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  rowHeight: number;
  maxFret: number;
  stringGap: number;
}

export function chordDiagramSvg(chord: ChordDef): string {
  const fretted = chord.strings
    .map((s) => s.fret)
    .filter((f): f is number => f !== null && f > 0);
  const maxFret = fretted.length > 0 ? Math.max(...fretted) : 1;

  const rowHeight = 34;
  const marginTop = 46; // room for open / muted markers
  const marginBottom = 24; // room for string labels
  const top = 30; // nut position
  const left = 26;
  const right = 26;
  const width = left + right + 40 * 5; // 6 strings
  const height = marginTop + maxFret * rowHeight + marginBottom;

  const g: Geometry = { width, height, left, right, top, rowHeight, maxFret, stringGap: 40 };

  const x = (stringNumber: number) =>
    g.left + (6 - stringNumber) * g.stringGap; // string 6 at the left
  const yOfFret = (fret: number) => g.top + (fret - 1) * g.rowHeight + g.rowHeight / 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Diagrama de ${chord.displayName}">`,
  );

  // Nut (only meaningful when the first fret is included).
  if (maxFret >= 1) {
    parts.push(
      `<rect x="${g.left - 6}" y="${g.top - 3}" width="${g.right + (5 * g.stringGap) + 12}" height="4" rx="1.5" fill="${COLORS.line}"/>`,
    );
  }

  // Fret rows.
  for (let row = 1; row <= maxFret; row++) {
    const yy = g.top + row * g.rowHeight;
    parts.push(
      `<line x1="${g.left}" y1="${yy}" x2="${g.left + 5 * g.stringGap}" y2="${yy}" stroke="${COLORS.line}" stroke-width="1.5"/>`,
    );
  }

  // Strings.
  for (const string of chord.strings) {
    const xx = x(string.number);
    const topY = g.top;
    const bottomY = g.top + maxFret * g.rowHeight;
    parts.push(
      `<line x1="${xx}" y1="${topY}" x2="${xx}" y2="${bottomY}" stroke="${COLORS.line}" stroke-width="1.5"/>`,
    );
    // String number label at the bottom.
    parts.push(
      `<text x="${xx}" y="${bottomY + 16}" text-anchor="middle" font-size="10" fill="${COLORS.fretLabel}" font-family="system-ui">${string.number}</text>`,
    );
  }

  // Fingered dots, open rings and muted crosses.
  for (const string of chord.strings) {
    const xx = x(string.number);
    if (string.fret === null) {
      // Muted: ✕ above the nut.
      parts.push(
        `<text x="${xx}" y="${g.top - 12}" text-anchor="middle" font-size="17" font-weight="700" fill="${COLORS.muted}" font-family="system-ui">&#10005;</text>`,
      );
      continue;
    }
    if (string.fret === 0) {
      // Open: ring above the nut.
      parts.push(
        `<circle cx="${xx}" cy="${g.top - 13}" r="6.5" fill="none" stroke="${COLORS.open}" stroke-width="1.6"/>`,
      );
      continue;
    }
    const cy = yOfFret(string.fret);
    parts.push(
      `<circle cx="${xx}" cy="${cy}" r="12" fill="${COLORS.dot}"/>`,
    );
    if (string.finger) {
      parts.push(
        `<text x="${xx}" y="${cy + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${COLORS.dotText}" font-family="system-ui">${string.finger}</text>`,
      );
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
