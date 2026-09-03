// @vitest-environment jsdom
/**
 * DOM integration test for the chord module against the real index.html.
 *
 * Covers the redesigned flow: home tiles (mini diagrams), opening lessons and
 * drills, the two validation modes, and the no-mic error paths in jsdom.
 */

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import htmlSource from '../../index.html?raw';
import { ChordUi } from './chordView';

function mount() {
  const dom = new JSDOM(htmlSource, { runScripts: 'outside-only', url: 'http://localhost/' });
  (globalThis as Record<string, unknown>).document = dom.window.document;
  const ui = new ChordUi(dom.window.document);
  ui.showHome();
  const q = <T extends Element>(selector: string) => {
    const el = dom.window.document.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element ${selector}`);
    return el;
  };
  return { ui, q };
}

const tileNames = (q: (s: string) => Element) =>
  Array.from(q('#chord-levels').querySelectorAll('.chord-card-name')).map((c) => c.textContent);

function openTile(q: (s: string) => Element, name: string): void {
  const tile = Array.from(q('#chord-levels').querySelectorAll<HTMLButtonElement>('.chord-card-mini'))
    .find((t) => t.querySelector('.chord-card-name')?.textContent === name);
  if (!tile) throw new Error(`tile ${name} not found`);
  tile.click();
}

describe('ChordUi against index.html (visual redesign)', () => {
  it('renders the learning path with seven chord cards and drills', () => {
    const { q } = mount();
    expect(q('#chords-home').hasAttribute('hidden')).toBe(false);
    expect(tileNames(q)).toEqual(['Em', 'E', 'Am', 'A', 'D', 'C', 'G']);
    expect(q('#chord-levels').querySelectorAll('.level-block').length).toBe(3);
    expect(q('#chord-levels').querySelectorAll('.drill-chip').length).toBe(3);
    // Each chord card shows its own mini diagram.
    const first = q('#chord-levels').querySelector('.chord-card-mini')!;
    expect(first.querySelector('.chord-mini svg')).not.toBeNull();
    // Progress ring + label.
    expect(q('#chords-progress').querySelector('.progress-ring')).not.toBeNull();
    expect(q('#chords-progress').textContent).toContain('0/7');
  });

  it('opens the Em lesson: hero diagram, facts, how-to behind a toggle', () => {
    const { q } = mount();
    openTile(q, 'Em');
    expect(q('#chord-lesson').hasAttribute('hidden')).toBe(false);
    expect(q('#chords-home').hasAttribute('hidden')).toBe(true);
    expect(q('#chord-lesson-title').textContent).toBe('Em · Mi menor');
    expect(q('#chord-name').textContent).toBe('Em');
    expect(q('#chord-diagram').innerHTML).toContain('Diagrama de Em');
    expect(q('#chord-facts').textContent).toContain('menor');
    expect(q('#chord-notes').textContent).toContain('E2');
    expect(q('#chord-howto').querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
    expect(q('#mode-strum').textContent).toContain('Rasgueo');
    expect(q('#mode-arpeggio').textContent).toContain('Cuerda a cuerda');
    expect(q('#practice').hasAttribute('hidden')).toBe(true);
    expect(q('#practice-strum').hasAttribute('hidden')).toBe(true);
  });

  it('back button returns to the home screen', () => {
    const { q } = mount();
    openTile(q, 'G');
    q<HTMLButtonElement>('#chord-lesson-back').click();
    expect(q('#chords-home').hasAttribute('hidden')).toBe(false);
    expect(q('#chord-lesson').hasAttribute('hidden')).toBe(true);
  });

  it('opens a drill as an ordered sequence of chords', () => {
    const { q } = mount();
    const ade = Array.from(q('#chord-levels').querySelectorAll<HTMLButtonElement>('.drill-chip'))
      .find((c) => c.textContent!.includes('A') && c.textContent!.includes('D') && c.textContent!.includes('E'))!;
    ade.click();
    expect(q('#chord-lesson-title').textContent).toBe('A – D – E');
    expect(q('#chord-lesson-progress').textContent).toContain('1/3');
    expect(q('#chord-name').textContent).toBe('A');
  });

  it('arpeggio mode without a microphone shows a clear error', async () => {
    const { q } = mount();
    openTile(q, 'Em');
    q<HTMLButtonElement>('#mode-arpeggio').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(q('#practice').hasAttribute('hidden')).toBe(false);
    expect(q('#practice-strum').hasAttribute('hidden')).toBe(true);
    expect(q('#practice-diagram').innerHTML).toContain('<svg');
    expect(q('#practice-mic-status').textContent).toContain('No se pudo');
    expect(q<HTMLButtonElement>('#practice-mic-button').textContent).toBe('Iniciar');
  });

  it('strum mode without a microphone shows a clear error', async () => {
    const { q } = mount();
    openTile(q, 'A');
    q<HTMLButtonElement>('#mode-strum').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(q('#practice-strum').hasAttribute('hidden')).toBe(false);
    expect(q('#practice').hasAttribute('hidden')).toBe(true);
    expect(q('#strum-mic-status').textContent).toContain('No se pudo');
    expect(q<HTMLButtonElement>('#strum-mic-button').textContent).toBe('Iniciar');
    expect(q('#strum-chord-name').textContent).toBe('A');
  });

  it('close buttons and deactivation work cleanly', () => {
    const { ui, q } = mount();
    openTile(q, 'C');
    q<HTMLButtonElement>('#mode-arpeggio').click();
    expect(q('#practice').hasAttribute('hidden')).toBe(false);
    q<HTMLButtonElement>('#practice-close').click();
    expect(q('#practice').hasAttribute('hidden')).toBe(true);
    ui.showHome();
    expect(q('#chords-home').hasAttribute('hidden')).toBe(false);
    expect(() => ui.deactivate()).not.toThrow();
  });
});
