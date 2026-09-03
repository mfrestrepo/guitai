// @vitest-environment jsdom
/**
 * DOM integration test for the chord module against the real index.html.
 *
 * Covers: home tiles/progress, opening lessons and drills, the two validation
 * modes (Rasgueo / Cuerda a cuerda), and the error path in jsdom (no mic).
 * The validation state machines themselves are tested in practice.test.ts,
 * strumCheck.test.ts and syntheticSession.test.ts.
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
  Array.from(q('#chord-levels').querySelectorAll('.chord-tile-main')).map((c) => c.textContent);

function openTile(q: (s: string) => Element, name: string): void {
  const tile = Array.from(q('#chord-levels').querySelectorAll<HTMLButtonElement>('.chord-tile'))
    .find((t) => t.querySelector('.chord-tile-main')?.textContent === name);
  if (!tile) throw new Error(`tile ${name} not found`);
  tile.click();
}

describe('ChordUi against index.html', () => {
  it('renders the three progressive levels with seven chord tiles and drills', () => {
    const { q } = mount();
    expect(q('#chords-home').hasAttribute('hidden')).toBe(false);
    expect(tileNames(q)).toEqual(['Em', 'E', 'Am', 'A', 'D', 'C', 'G']);
    expect(q('#chord-levels').querySelectorAll('.level-card').length).toBe(3);
    expect(q('#chord-levels').querySelectorAll('.drill-chip').length).toBe(3);
    expect(q('#chords-progress').textContent).toContain('0 de 7');
  });

  it('opens the Em lesson with diagram, how-to, tips and both modes', () => {
    const { q } = mount();
    openTile(q, 'Em');

    expect(q('#chord-lesson').hasAttribute('hidden')).toBe(false);
    expect(q('#chords-home').hasAttribute('hidden')).toBe(true);
    expect(q('#chord-lesson-title').textContent).toBe('Em');
    expect(q('#chord-name').textContent).toBe('Em · Mi menor');
    expect(q('#chord-diagram').innerHTML).toContain('Diagrama de Em');
    expect(q('#chord-howto').querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
    expect(q('#chord-notes').textContent).toContain('Mi (E2)');
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
      .find((c) => c.textContent!.includes('A – D – E'))!;
    ade.click();
    expect(q('#chord-lesson-title').textContent).toBe('Progresión A – D – E');
    expect(q('#chord-lesson-progress').textContent).toContain('Paso 1 de 3');
    expect(q('#chord-name').textContent).toContain('A ·');
  });

  it('arpeggio mode without a microphone shows a clear error', async () => {
    const { q } = mount();
    openTile(q, 'Em');
    q<HTMLButtonElement>('#mode-arpeggio').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(q('#practice').hasAttribute('hidden')).toBe(false);
    expect(q('#practice-strum').hasAttribute('hidden')).toBe(true);
    expect(q('#practice-mic-status').textContent).toContain('No se pudo');
    expect(q<HTMLButtonElement>('#practice-mic-button').textContent).toBe('Iniciar micrófono');
  });

  it('strum mode without a microphone shows a clear error', async () => {
    const { q } = mount();
    openTile(q, 'A');
    q<HTMLButtonElement>('#mode-strum').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(q('#practice-strum').hasAttribute('hidden')).toBe(false);
    expect(q('#practice').hasAttribute('hidden')).toBe(true);
    expect(q('#strum-mic-status').textContent).toContain('No se pudo');
    expect(q<HTMLButtonElement>('#strum-mic-button').textContent).toBe('Iniciar micrófono');
    expect(q('#strum-chord-name').textContent).toBe('A');
  });

  it('deactivating and returning home works cleanly from any screen', () => {
    const { ui, q } = mount();
    openTile(q, 'C');
    expect(() => ui.deactivate()).not.toThrow();
    ui.showHome();
    expect(q('#chords-home').hasAttribute('hidden')).toBe(false);
    expect(() => ui.deactivate()).not.toThrow();
  });
});
