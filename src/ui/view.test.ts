// @vitest-environment jsdom
/**
 * DOM integration test for the tuner UI.
 *
 * Since a real microphone + browser cannot run in CI, this mounts the actual
 * `index.html` in jsdom and drives the {@link TunerView} with fabricated
 * readings to prove:
 *   - every id the view expects really exists in index.html
 *   - the string chips and tuning <select> build correctly
 *   - verdict text / colours / needle position / level meter update per state
 *   - the manual string-lock interaction round-trips to the engine callback
 */

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import htmlSource from '../../index.html?raw';
import { TunerView } from './view';
import { evaluateTuning } from '../tuner/evaluator';
import { tuningById } from '../theory/tunings';
import { midiToFrequency } from '../theory/music';
import type { Reading } from '../tuner/engine';

const standard = tuningById('standard')!;

function mount(): {
  view: TunerView;
  q: <T extends Element>(selector: string) => T;
  events: { startStop: number; tuning: string[]; string: (number | undefined)[] };
} {
  const dom = new JSDOM(htmlSource, { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  // The view uses the global `document` to create elements; point it at ours.
  (globalThis as Record<string, unknown>).document = window.document;

  const events = { startStop: 0, tuning: [] as string[], string: [] as (number | undefined)[] };
  const view = new TunerView(window.document, {
    onStartStop: () => {
      events.startStop += 1;
    },
    onTuningChange: (id) => {
      events.tuning.push(id);
    },
    onStringSelect: (number) => {
      events.string.push(number);
    },
  });
  const q = <T extends Element>(selector: string) => {
    const el = window.document.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element ${selector}`);
    return el;
  };
  return { view, q, events };
}

function tuningReading(detectedHz: number, signalLevel = 0.5): Reading {
  return { status: 'tuning', signalLevel, ...evaluateTuning(detectedHz, standard) };
}

const chipNames = (q: <T extends Element>(s: string) => T) =>
  Array.from(q('#strings-row').querySelectorAll('.chip-note')).map((n) => n.textContent);

describe('TunerView against index.html', () => {
  it('wires all expected elements and builds six string chips', () => {
    const { view, q } = mount();
    view.setTuningOptions([{ id: 'standard', name: 'Standard (E A D G B E)' }], 'standard');
    view.setStrings(standard.strings);

    expect(chipNames(q)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    const select = q<HTMLSelectElement>('#tuning-select');
    expect(select.value).toBe('standard');
    expect(select.options.length).toBe(1);
    expect(q<HTMLButtonElement>('#mic-button').textContent).toBe('Start microphone');
    expect(q('#note-name').textContent).toBe('—');
    expect(q('#verdict').getAttribute('data-state')).toBe('idle');
  });

  it('renders an idle reading as dashes with a centred needle', () => {
    const { view, q } = mount();
    view.render({ status: 'idle' });
    expect(q('#note-name').textContent).toBe('—');
    expect(q('#detected-freq').textContent).toBe('--.-');
    expect(q('#target-freq').textContent).toBe('--.-');
    expect(q('#needle').getAttribute('style')).toContain('left: 50%');
  });

  it('renders a listening reading with the live signal meter', () => {
    const { view, q } = mount();
    view.render({ status: 'listening', signalLevel: 0.4 });
    expect(q('#verdict').textContent).toContain('Hearing you');
    expect(q('#level-fill').getAttribute('style')).toContain('width: 40%');
  });

  it('renders an in-tune A2 dead centre with the green verdict', () => {
    const { view, q } = mount();
    const a2 = standard.strings[1]; // A2, 110 Hz
    view.render(tuningReading(midiToFrequency(a2.midi)));

    expect(q('#note-name').textContent).toBe('A2');
    expect(q('#note-name').getAttribute('data-state')).toBe('inTune');
    expect(q('#target-freq').textContent).toBe('110.0');
    expect(q('#cents-readout').textContent).toBe('0 ¢');
    expect(q('#needle').getAttribute('style')).toContain('left: 50%');
    expect(q('#verdict').textContent).toContain('IN TUNE');
    expect(q('#verdict').getAttribute('data-state')).toBe('inTune');
  });

  it('clamps the needle and words the verdict for a clearly sharp note', () => {
    const { view, q } = mount();
    const sharp = 110 * 2 ** (30 / 1200); // A2 +30¢
    view.render(tuningReading(sharp));
    expect(q('#verdict').getAttribute('data-state')).toBe('sharp');
    expect(q('#verdict').textContent).toContain('TOO HIGH');
    expect(q('#needle').getAttribute('style')).toContain('left: 80%');
    expect(q('#note-name').getAttribute('data-state')).toBe('sharp');
  });

  it('clamps the needle fully left for a very flat note and shows the target', () => {
    const { view, q } = mount();
    const lowE = standard.strings[0];
    view.render(tuningReading(midiToFrequency(lowE.midi) * 2 ** (-80 / 1200)));
    expect(q('#note-name').textContent).toBe('E2');
    expect(q('#target-freq').textContent).toBe('82.4');
    expect(q('#verdict').textContent).toContain('TOO LOW');
    expect(q('#needle').getAttribute('style')).toContain('left: 0%');
  });

  it('shows the detected frequency, e.g. the spec example 108.7 Hz', () => {
    const { view, q } = mount();
    view.render(tuningReading(108.7));
    expect(q('#detected-freq').textContent).toBe('108.7');
    expect(q('#cents-readout').textContent).toContain('21'); // −20.6 ¢ rounds to −21
  });

  it('highlights the sounding string chip', () => {
    const { view, q } = mount();
    view.setStrings(standard.strings);
    view.render(tuningReading(midiToFrequency(55))); // G3, string 3
    const active = q('#strings-row').querySelector('.string-chip.active .chip-note');
    expect(active?.textContent).toBe('G3');
  });

  it('round-trips manual string locking clicks to the engine callback', () => {
    const { view, q, events } = mount();
    view.setStrings(standard.strings);
    const chips = Array.from(q('#strings-row').querySelectorAll<HTMLButtonElement>('.string-chip'));
    const lowE = chips.find((c) => c.dataset.number === '6')!;

    lowE.click();
    expect(events.string).toEqual([6]);
    expect(lowE.classList.contains('locked')).toBe(true);
    expect(q('#strings-row').querySelector('.string-chip.locked .chip-note')?.textContent).toBe('E2');

    lowE.click();
    expect(events.string).toEqual([6, undefined]);
    expect(lowE.classList.contains('locked')).toBe(false);
  });

  it('forwards tuning preset changes from the picker', () => {
    const { view, q, events } = mount();
    view.setTuningOptions([{ id: 'standard', name: 'Standard (E A D G B E)' }], 'standard');
    view.setStrings(standard.strings);
    const select = q<HTMLSelectElement>('#tuning-select');
    select.value = 'standard';
    select.dispatchEvent(new Event('change'));
    expect(events.tuning).toEqual(['standard']);
  });
});
