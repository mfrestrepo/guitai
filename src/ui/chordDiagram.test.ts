import { describe, expect, it } from 'vitest';
import { chordById } from '../chords/catalog';
import { chordDiagramSvg } from './chordDiagram';

const dots = (svg: string) => (svg.match(/class="cd-dot /g) ?? []).length;
const rings = (svg: string) => (svg.match(/class="cd-ring /g) ?? []).length;
const crosses = (svg: string) => (svg.match(/class="cd-mute /g) ?? []).length;

describe('chordDiagramSvg', () => {
  it('renders an SVG with the correct number of dots, rings and crosses', () => {
    const em = chordById('em')!;
    const svg = chordDiagramSvg(em);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // Em: frets 2 (×2) on strings 5 & 4 → 2 dots; 4 open rings; 0 muted.
    expect(dots(svg)).toBe(2);
    expect(rings(svg)).toBe(4);
    expect(crosses(svg)).toBe(0);
  });

  it('marks muted strings with crosses and labels string numbers', () => {
    const a = chordById('a')!;
    const svg = chordDiagramSvg(a);
    expect(crosses(svg)).toBe(1); // 6th muted
    expect(dots(svg)).toBe(3); // 3 fretted
    expect(rings(svg)).toBe(2);
    for (const n of [1, 6]) {
      expect(svg).toContain(`>${n}</text>`);
    }
  });

  it('shows the finger number inside each dot', () => {
    const g = chordById('g')!;
    const svg = chordDiagramSvg(g);
    // G: frets at string 6 (finger 3), string 5 (finger 1) and string 1 (finger 4).
    for (const finger of ['1', '3', '4']) {
      expect(svg).toContain(`font-weight="700">${finger}</text>`);
    }
  });

  it('annotates highlighted strings with state classes for the UI', () => {
    const em = chordById('em')!;
    const svg = chordDiagramSvg(em, { highlight: { 4: 'ok', 5: 'wrong', 6: 'sounding' } });
    expect(svg).toContain('cd-dot cd-s4 cd-ok');
    expect(svg).toContain('cd-dot cd-s5 cd-wrong');
    expect(svg).toContain('cd-ring cd-s6 cd-sounding');
    expect(svg).not.toContain('cd-ok cd-wrong');
  });

  it('scales down for mini diagrams without breaking structure', () => {
    const g = chordById('g')!;
    const mini = chordDiagramSvg(g, { scale: 0.5 });
    const hero = chordDiagramSvg(g);
    expect(dots(mini)).toBe(dots(hero));
    expect(rings(mini)).toBe(rings(hero));
    expect(crosses(mini)).toBe(crosses(hero));
    expect(mini).toContain('r="6"'); // 12 * 0.5
  });
});
