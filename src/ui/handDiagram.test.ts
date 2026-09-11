import { describe, expect, it } from 'vitest';
import { clickAndNoteSvg, leftHandSvg, rightHandSvg } from './handDiagram';

describe('rightHandSvg', () => {
  it('renders an SVG with the four right-hand fingers labelled', () => {
    const svg = rightHandSvg('i-m');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    for (const label of ['p', 'i', 'm', 'a']) expect(svg).toContain(`>${label}</text>`);
  });

  it('highlights the alternating fingers', () => {
    const im = rightHandSvg('i-m');
    // Two fingers highlighted (i and m) besides the palm/thumb.
    expect((im.match(/hand-finger on/g) ?? []).length).toBe(2);
    expect(im).toContain('alterna i y m');

    const ia = rightHandSvg('i-a');
    expect((ia.match(/hand-finger on/g) ?? []).length).toBe(2);
    expect(ia).toContain('alterna i y a');
  });
});

describe('leftHandSvg', () => {
  it('numbers the fingers 1-2-3-4 for the chromatic pattern', () => {
    const svg = leftHandSvg('chromatic');
    for (const number of [1, 2, 3, 4]) expect(svg).toContain(`>${number}</text>`);
    expect(svg).toContain('un dedo por traste');
    expect((svg.match(/hand-finger on/g) ?? []).length).toBe(4);
  });

  it('shows no moving fingers for the repeated-note drill', () => {
    const svg = leftHandSvg('repeat');
    expect(svg).toContain('sin mover la izquierda');
    expect((svg.match(/hand-finger on/g) ?? []).length).toBe(0);
  });

  it('describes the scale pattern', () => {
    expect(leftHandSvg('scale')).toContain('dedos según la escala');
  });
});

describe('clickAndNoteSvg', () => {
  it('draws the "one note per click" idea', () => {
    const svg = clickAndNoteSvg();
    expect(svg).toContain('<svg');
    expect(svg).toContain('click-dot');
    expect(svg).toContain('click-note');
  });
});
