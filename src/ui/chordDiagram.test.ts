import { describe, expect, it } from 'vitest';
import { chordById } from '../chords/catalog';
import { chordDiagramSvg } from './chordDiagram';

describe('chordDiagramSvg', () => {
  it('renders an SVG with the correct number of dots, rings and crosses', () => {
    const em = chordById('em')!;
    const svg = chordDiagramSvg(em);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);

    const dots = (svg.match(/r="12"/g) ?? []).length;
    const rings = (svg.match(/stroke="[^"]+" stroke-width="1.6"/g) ?? []).length;
    const crosses = (svg.match(/&#10005;/g) ?? []).length;

    // Em: frets 2 (×2) on strings 5 & 4 → 2 dots; 4 open rings; 0 muted.
    expect(dots).toBe(2);
    expect(rings).toBe(4);
    expect(crosses).toBe(0);
  });

  it('marks muted strings with crosses and labels string numbers', () => {
    const a = chordById('a')!;
    const svg = chordDiagramSvg(a);
    expect((svg.match(/&#10005;/g) ?? []).length).toBe(1); // 6th muted
    expect((svg.match(/r="12"/g) ?? []).length).toBe(3); // 3 fretted
    // String number labels 1..6 are present.
    for (const n of [1, 6]) {
      expect(svg).toContain(`>${n}</text>`);
    }
  });

  it('shows the finger number inside each dot', () => {
    const g = chordById('g')!;
    const svg = chordDiagramSvg(g);
    // G: frets at string 6 (finger 3) and string 5 (finger 1) and string 1 (finger 4).
    expect((svg.match(/font-weight="700"[^>]*>3<\/text>/g) ?? []).length).toBeGreaterThan(0);
    expect((svg.match(/font-weight="700"[^>]*>1<\/text>/g) ?? []).length).toBeGreaterThan(0);
    expect((svg.match(/font-weight="700"[^>]*>4<\/text>/g) ?? []).length).toBeGreaterThan(0);
  });
});
