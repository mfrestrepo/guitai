// @vitest-environment jsdom
/**
 * DOM integration test for the chord module against the real index.html.
 *
 * Verifies: the home screen (levels, chord chips, drills, progress), opening a
 * chord lesson (diagram, "cómo se hace", notes), entering practice, and the
 * error path when no microphone exists (jsdom has none). The live validation
 * state machine itself is covered by practice.test.ts + syntheticSession.test.ts.
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

const chipTexts = (q: (s: string) => Element) =>
  Array.from(q('#chord-levels').querySelectorAll('.chord-chip')).map((c) => c.textContent);

describe('ChordUi against index.html', () => {
  it('renders the three progressive levels with seven chords and drills', () => {
    const { q } = mount();
    expect(q('#chords-home').hasAttribute('hidden')).toBe(false);
    expect(chipTexts(q)).toEqual(['Em', 'E', 'Am', 'A', 'D', 'C', 'G']);
    expect(q('#chord-levels').querySelectorAll('.level-card').length).toBe(3);
    expect(q('#chord-levels').querySelectorAll('.drill-chip').length).toBe(3);
    expect(q('#chords-progress').textContent).toContain('0 de 7');
  });

  it('opens the Em lesson with diagram, how-to and notes', () => {
    const { q } = mount();
    const emChip = Array.from(q('#chord-levels').querySelectorAll<HTMLButtonElement>('.chord-chip'))
      .find((c) => c.textContent === 'Em')!;
    emChip.click();

    expect(q('#chord-lesson').hasAttribute('hidden')).toBe(false);
    expect(q('#chords-home').hasAttribute('hidden')).toBe(true);
    expect(q('#chord-lesson-title').textContent).toBe('Acorde Em');
    expect(q('#chord-name').textContent).toBe('Em · Mi menor');
    expect(q('#chord-diagram').innerHTML).toContain('Diagrama de Em');
    expect(q('#chord-howto').querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
    expect(q('#chord-notes').textContent).toContain('Mi (E2)');
    expect(q<HTMLButtonElement>('#chord-start').textContent).toContain('Empezar a tocar');
    expect(q('#practice').hasAttribute('hidden')).toBe(true);
  });

  it('back button returns to the home screen', () => {
    const { q } = mount();
    Array.from(q('#chord-levels').querySelectorAll<HTMLButtonElement>('.chord-chip'))
      .find((c) => c.textContent === 'G')!
      .click();
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

  it('entering practice without a microphone shows a clear error message', async () => {
    const { q } = mount();
    Array.from(q('#chord-levels').querySelectorAll<HTMLButtonElement>('.chord-chip'))
      .find((c) => c.textContent === 'Em')!
      .click();
    q<HTMLButtonElement>('#chord-start').click();

    // session.start() is async; jsdom has no getUserMedia → error path.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(q('#practice').hasAttribute('hidden')).toBe(false);
    expect(q('#practice-mic-status').textContent).toContain('No se pudo');
    expect(q<HTMLButtonElement>('#practice-mic-button').textContent).toBe('Iniciar micrófono');
  });
});
