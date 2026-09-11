/**
 * Hand diagrams (SVG, pure) used to *show* the technique instead of explaining
 * it with text: the right-hand fingers that alternate, and the left-hand finger
 * numbers for the chromatic 1-2-3-4 pattern.
 */

import type { Alternation, LeftHandPattern } from '../technique/explanations';

const SIZES = { width: 190, height: 120 };

/** Right hand seen from the palm: p (thumb), i, m, a, with highlighted fingers. */
export function rightHandSvg(alternation: Alternation): string {
  const active = new Set(
    alternation === 'i-m'
      ? ['i', 'm']
      : alternation === 'i-a'
        ? ['i', 'a']
        : alternation === 'm-a'
          ? ['m', 'a']
          : [],
  );
  const { width, height } = SIZES;

  // Finger X positions; the thumb sits lower and to the side.
  const fingers: { id: string; label: string; x: number; fingerHeight: number }[] = [
    { id: 'i', label: 'i', x: 62, fingerHeight: 62 },
    { id: 'm', label: 'm', x: 92, fingerHeight: 72 },
    { id: 'a', label: 'a', x: 122, fingerHeight: 58 },
  ];

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="hand-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mano derecha: ${alternation ?? 'dedos'}">`,
  );
  // Palm.
  parts.push(`<path class="hand-palm" d="M52 96 q-14 -18 6 -26 l66 0 q20 8 6 26 z" />`);
  // Thumb.
  parts.push(
    `<path class="hand-thumb${active.has('p') ? ' on' : ''}" d="M56 86 q-22 -8 -24 -22 q10 -6 18 2 l16 10 z" />`,
  );
  parts.push(
    `<text class="hand-label" x="30" y="76" text-anchor="middle">p</text>`,
  );
  // Fingers.
  for (const finger of fingers) {
    const on = active.has(finger.id);
    const top = 96 - finger.fingerHeight;
    parts.push(
      `<rect class="hand-finger${on ? ' on' : ''}" x="${finger.x - 8}" y="${top}" width="16" height="${finger.fingerHeight}" rx="8" />`,
    );
    parts.push(
      `<text class="hand-label${on ? ' on' : ''}" x="${finger.x}" y="${top - 6}" text-anchor="middle">${finger.label}</text>`,
    );
  }
  parts.push(
    `<text class="hand-caption" x="${width / 2}" y="${height - 6}" text-anchor="middle">${
      alternation ? `alterna ${alternation.replace('-', ' y ')}` : 'mano derecha'
    }</text>`,
  );
  parts.push('</svg>');
  return parts.join('');
}

/** Left hand with the finger numbers 1-2-3-4 highlighted per pattern. */
export function leftHandSvg(pattern: LeftHandPattern): string {
  const { width, height } = SIZES;
  const numbers = [1, 2, 3, 4];
  const active = pattern === 'repeat' ? [] : numbers;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="hand-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mano izquierda: ${pattern}">`,
  );
  parts.push(`<path class="hand-palm" d="M52 96 q-14 -18 6 -26 l66 0 q20 8 6 26 z" />`);
  parts.push(`<path class="hand-thumb" d="M56 86 q-22 -8 -24 -22 q10 -6 18 2 l16 10 z" />`);
  parts.push(`<text class="hand-label" x="30" y="76" text-anchor="middle">p</text>`);

  numbers.forEach((number, index) => {
    const x = 62 + index * 30;
    const fingerHeight = [62, 72, 58, 44][index];
    const top = 96 - fingerHeight;
    const on = active.includes(number);
    parts.push(
      `<rect class="hand-finger${on ? ' on' : ''}" x="${x - 8}" y="${top}" width="16" height="${fingerHeight}" rx="8" />`,
    );
    parts.push(
      `<text class="hand-label${on ? ' on' : ''}" x="${x}" y="${top - 6}" text-anchor="middle">${number}</text>`,
    );
  });
  parts.push(
    `<text class="hand-caption" x="${width / 2}" y="${height - 6}" text-anchor="middle">${
      pattern === 'chromatic'
        ? 'un dedo por traste (1-2-3-4)'
        : pattern === 'scale'
          ? 'dedos según la escala'
          : 'misma nota, sin mover la izquierda'
    }</text>`,
  );
  parts.push('</svg>');
  return parts.join('');
}

/** Small illustration for "one note per click" used in the how-to strip. */
export function clickAndNoteSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="click-svg" viewBox="0 0 120 60" role="img" aria-label="Una nota por clic">
    <circle class="click-dot" cx="24" cy="30" r="10" />
    <text class="click-label" x="24" y="34" text-anchor="middle">1</text>
    <path class="click-arrow" d="M40 30 h28" />
    <circle class="click-note" cx="82" cy="30" r="9" />
    <text class="click-label" x="82" y="34" text-anchor="middle">♪</text>
  </svg>`;
}
