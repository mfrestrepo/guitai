// @vitest-environment jsdom
/**
 * DOM integration test for the "Cambios" module (exercise list + runner).
 *
 * Mic and metronome audio are unavailable in jsdom, which is exactly what we
 * want to verify: the screen must stay usable and never crash without them.
 */

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import htmlSource from '../../index.html?raw';
import { ChangesUi } from './changesView';
import { CHORD_EXERCISES } from '../chords/exercises';

function mount() {
  const dom = new JSDOM(htmlSource, { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  (globalThis as Record<string, unknown>).document = window.document;
  (globalThis as Record<string, unknown>).window = window;
  const events = { soundToggles: 0 };
  const ui = new ChangesUi(window.document, {
    isSoundEnabled: () => true,
    onToggleSound: () => {
      events.soundToggles += 1;
    },
  });
  ui.showHome();
  const q = <T extends Element>(selector: string) => {
    const el = window.document.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element ${selector}`);
    return el;
  };
  return { ui, q, events, window };
}

describe('ChangesUi', () => {
  it('lists every exercise grouped by the four difficulty levels', () => {
    const { q } = mount();
    expect(q('#changes-home').hasAttribute('hidden')).toBe(false);
    expect(q('#changes-levels').querySelectorAll('.level-block').length).toBe(4);
    const cards = q('#changes-levels').querySelectorAll('.exercise-card');
    expect(cards.length).toBe(CHORD_EXERCISES.length);
    expect(q('#changes-levels').textContent).toContain('Muy fáciles');
    expect(q('#changes-levels').textContent).toContain('Difíciles');
  });

  it('shows the researched exercise types on the cards', () => {
    const { q } = mount();
    const text = q('#changes-levels').textContent ?? '';
    expect(text).toContain('1 minuto'); // one-minute changes
    expect(text).toContain('al aire'); // air changes
    expect(text).toContain('Bucle'); // 4-chord loops
    expect(text).toContain('al azar'); // random changes
  });

  it('opens a runner with the chord chain, tips and diagram', () => {
    const { ui, q } = mount();
    expect(ui.openExercise('loop-a-d-e')).toBe(true);
    expect(q('#changes-runner').hasAttribute('hidden')).toBe(false);
    expect(q('#changes-home').hasAttribute('hidden')).toBe(true);
    expect(q('#changes-title').textContent).toBe('Bucle: A → D → E');
    expect(q('#runner-current').textContent).toBe('A');
    expect(q('#runner-next').textContent).toBe('D');
    expect(q('#runner-tips').querySelectorAll('li').length).toBeGreaterThan(0);
    expect(q('#runner-diagram').innerHTML).toContain('<svg');
    // Metronome starts at the recommended tempo of the exercise.
    expect(q('#bpm-value').textContent).toBe('50');
    expect(q<HTMLButtonElement>('#metronome-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  it('runs the drill without a microphone and counts changes', async () => {
    const { ui, q } = mount();
    ui.openExercise('loop-a-d-e');
    q<HTMLButtonElement>('#runner-start').click();
    await Promise.resolve();

    const session = ui.currentSession()!;
    expect(session.isRunning).toBe(true);
    expect(q<HTMLButtonElement>('#runner-start').hasAttribute('hidden')).toBe(true);
    expect(q<HTMLButtonElement>('#runner-stop').hasAttribute('hidden')).toBe(false);

    // Simulate the metronome: 4 beats per chord → one change.
    for (let beat = 0; beat < 4; beat++) session.onBeat(Date.now());
    expect(q('#runner-changes').textContent).toBe('1');
    expect(q('#runner-current').textContent).toBe('D');

    q<HTMLButtonElement>('#runner-stop').click();
    expect(session.isRunning).toBe(false);
  });

  it('lets the learner pick the tempo and the beats per chord', () => {
    const { ui, q } = mount();
    ui.openExercise('em-am');
    const bpmValue = q('#bpm-value');
    expect(bpmValue.textContent).toBe('50');

    q<HTMLButtonElement>('#bpm-up').click();
    expect(bpmValue.textContent).toBe('55');
    q<HTMLButtonElement>('#bpm-down').click();
    q<HTMLButtonElement>('#bpm-down').click();
    expect(bpmValue.textContent).toBe('45');
    expect(ui.currentSession()!.snapshot().bpm).toBe(45);

    const beats = q<HTMLSelectElement>('#beats-per-chord');
    beats.value = '2';
    beats.dispatchEvent(new Event('change'));
    expect(ui.currentSession()!.snapshot().beatsPerChord).toBe(2);
  });

  it('toggles the optional metronome and microphone validation', () => {
    const { ui, q } = mount();
    ui.openExercise('em-am');
    const metronome = q<HTMLButtonElement>('#metronome-toggle');
    const mic = q<HTMLButtonElement>('#mic-validate');

    metronome.click();
    expect(metronome.getAttribute('aria-pressed')).toBe('true');
    expect(metronome.classList.contains('active-toggle')).toBe(true);

    mic.click();
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(q('#runner-clean-wrap').hasAttribute('hidden')).toBe(false);
  });

  it('disables microphone validation for silent drills (air changes)', () => {
    const { ui, q } = mount();
    ui.openExercise('air-em-c');
    expect(q<HTMLButtonElement>('#mic-validate').disabled).toBe(true);
    expect(q('#runner-current').textContent).toBe('Em');
  });

  it('shows a finished summary for timed drills with the best score', () => {
    const { ui, q } = mount();
    ui.openExercise('one-minute-em-am');
    q<HTMLButtonElement>('#runner-start').click();
    const session = ui.currentSession()!;
    // Finish the drill immediately by ticking past its duration.
    session.tick(Date.now() + 61_000);
    expect(q('#runner-finished').hasAttribute('hidden')).toBe(false);
    expect(q('#runner-finished-text').textContent).toContain('cambios');
    expect(q('#runner-best').textContent).not.toBe('');
  });

  it('toggles the shared validation sound from the header', () => {
    const { q, events } = mount();
    q<HTMLButtonElement>('#changes-sound-button').click();
    expect(events.soundToggles).toBe(1);
  });

  it('returns home and can be deactivated safely', () => {
    const { ui, q } = mount();
    ui.openExercise('em-am');
    q<HTMLButtonElement>('#changes-back').click();
    expect(q('#changes-home').hasAttribute('hidden')).toBe(false);
    expect(q('#changes-runner').hasAttribute('hidden')).toBe(true);
    expect(() => ui.deactivate()).not.toThrow();
  });
});
