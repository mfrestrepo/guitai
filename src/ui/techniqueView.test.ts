// @vitest-environment jsdom
/**
 * DOM integration test for the guided practice module.
 *
 * The microphone is unavailable in jsdom, which is also the error path we want
 * to cover; for the evaluated path we use the test hooks (beginMicSession +
 * simulateNote + simulatePassEnd) so the whole UI can be driven without audio.
 */

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import htmlSource from '../../index.html?raw';
import { TechniqueUi } from './techniqueView';
import { TECHNIQUE_EXERCISES, techniqueExerciseById, expectedTimeMs } from '../technique/exercises';
import { midiToFrequency } from '../theory/music';

function mount() {
  const dom = new JSDOM(htmlSource, { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  (globalThis as Record<string, unknown>).document = window.document;
  (globalThis as Record<string, unknown>).window = window;
  // The module reads preferences from the *global* localStorage (as it does in
  // the browser). Start each test from a clean slate.
  try {
    (globalThis as unknown as { localStorage?: Storage }).localStorage?.clear();
  } catch {
    // storage unavailable → defaults apply anyway
  }
  const events = { soundToggles: 0 };
  const ui = new TechniqueUi(window.document, {
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
  return { ui, q, events };
}

describe('TechniqueUi', () => {
  it('lists the exercises grouped by level', () => {
    const { q } = mount();
    expect(q('#practice-home').hasAttribute('hidden')).toBe(false);
    expect(q('#practice-levels').querySelectorAll('.level-block').length).toBe(3);
    expect(q('#practice-levels').querySelectorAll('.exercise-card').length).toBe(
      TECHNIQUE_EXERCISES.length,
    );
    expect(q('#practice-levels').textContent).toContain('Cromático');
    expect(q('#practice-levels').textContent).toContain('Escala de Do mayor');
  });

  it('opens a runner with the fretboard, current note and tips', () => {
    const { ui, q } = mount();
    expect(ui.openExercise('chromatic-low-strings')).toBe(true);
    expect(q('#practice-runner').hasAttribute('hidden')).toBe(false);
    expect(q('#practice-title').textContent).toContain('Cromático');
    expect(q('#technique-fretboard').innerHTML).toContain('<svg');
    expect(q('#technique-fretboard').innerHTML).toContain('fb-dot');
    expect(q('#technique-current-note').textContent).toBe('F2'); // first note of the drill
    expect(q('#technique-next-note').textContent).toBe('F#2');
    expect(q('#technique-tips').querySelectorAll('li').length).toBeGreaterThan(0);
    expect(q('#technique-bpm-value').textContent).toBe('50');
  });

  it('keeps the metronome and microphone toggles optional and remembered', () => {
    const { ui, q } = mount();
    ui.openExercise('scale-c-major-1oct');
    const metronome = q<HTMLButtonElement>('#technique-metronome-toggle');
    const mic = q<HTMLButtonElement>('#technique-mic-toggle');
    expect(metronome.getAttribute('aria-pressed')).toBe('true'); // on by default for scales
    metronome.click();
    expect(metronome.getAttribute('aria-pressed')).toBe('false');
    mic.click();
    expect(mic.getAttribute('aria-pressed')).toBe('false');
  });

  it('changes the tempo in steps of 5 within range', () => {
    const { ui, q } = mount();
    ui.openExercise('chromatic-low-strings');
    const value = q('#technique-bpm-value');
    q<HTMLButtonElement>('#technique-bpm-up').click();
    expect(value.textContent).toBe('55');
    q<HTMLButtonElement>('#technique-bpm-down').click();
    q<HTMLButtonElement>('#technique-bpm-down').click();
    expect(value.textContent).toBe('45');
    expect(ui.currentSession()!.snapshot().bpm).toBe(45);
  });

  it('evaluates a pass: metrics, slots and a concrete recommendation', async () => {
    const { ui, q } = mount();
    const exercise = techniqueExerciseById('chromatic-low-strings')!;
    ui.openExercise(exercise.id);
    const base = Date.now();
    q<HTMLButtonElement>('#technique-start').click();
    // Let the (failing) getUserMedia attempt settle, then force the running
    // state through the test hook — otherwise the pending rejection would
    // overwrite it.
    await new Promise((resolve) => setTimeout(resolve, 30));
    ui.beginMicSession();

    // Play every note perfectly at 50 BPM (step = 1000 ms).
    exercise.notes.forEach((note, slot) => {
      ui.simulateNote(midiToFrequency(note.midi), base + expectedTimeMs(exercise, 50, slot));
    });
    const outcome = ui.simulatePassEnd(base + 12_000 + 700);
    expect(outcome!.result.accuracy).toBe(1);

    expect(q('#technique-result').hasAttribute('hidden')).toBe(false);
    expect(q('#technique-result-text').textContent).toContain('Repite'); // first clean pass
    expect(q('#technique-result-detail').textContent).toContain('100 %');
    expect(q('#technique-accuracy').textContent).toBe('100 %');
    expect(q('#technique-fretboard').innerHTML).toContain('<svg');
    const okChips = q('#technique-slots').querySelectorAll('.technique-slot.ok');
    expect(okChips.length).toBe(exercise.notes.length);
  });

  it('shows the free-practice message when the microphone is not available', async () => {
    const { ui, q } = mount();
    ui.openExercise('chromatic-low-strings');
    q<HTMLButtonElement>('#technique-start').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    // jsdom has no getUserMedia → the mic errored, so no scoring is claimed.
    expect(q('#technique-mic-status').textContent).toContain('No se pudo');
    ui.simulatePassEnd();
    expect(q('#technique-result-text').textContent).toContain('Práctica libre');
    expect(q('#technique-result-detail').textContent).toContain('🎤');
  });

  it('returns home and deactivates cleanly', () => {
    const { ui, q } = mount();
    ui.openExercise('scale-c-major-1oct');
    q<HTMLButtonElement>('#practice-back').click();
    expect(q('#practice-home').hasAttribute('hidden')).toBe(false);
    expect(q('#practice-runner').hasAttribute('hidden')).toBe(true);
    expect(() => ui.deactivate()).not.toThrow();
  });

  it('toggles the shared confirmation sound', () => {
    const { q, events } = mount();
    q<HTMLButtonElement>('#practice-sound-button').click();
    expect(events.soundToggles).toBe(1);
  });
});
