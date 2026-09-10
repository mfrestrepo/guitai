// @vitest-environment jsdom
/**
 * DOM integration test for the tuner UI (v2: arc gauge + pegs with ✓).
 *
 * Mounts the real `index.html` in jsdom and drives {@link TunerView} with
 * fabricated readings, proving: ids exist, pegs/select build, the needle
 * rotates, verdicts/colours update, the ✓ marks follow `tunedStrings`, the
 * confirmation-sound toggle works, and locking round-trips to the engine.
 */

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import htmlSource from '../../index.html?raw';
import { TunerView, centsToAngle } from './view';
import { evaluateTuning } from '../tuner/evaluator';
import { tuningById } from '../theory/tunings';
import { midiToFrequency } from '../theory/music';
import type { TuningReading } from '../tuner/engine';

const standard = tuningById('standard')!;

function mount(): {
  view: TunerView;
  q: <T extends Element>(selector: string) => T;
  events: {
    startStop: number;
    tuning: string[];
    string: (number | undefined)[];
    soundToggles: number;
  };
} {
  const dom = new JSDOM(htmlSource, { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  // The view uses the global `document` to create elements; point it at ours.
  (globalThis as Record<string, unknown>).document = window.document;

  const events = {
    startStop: 0,
    tuning: [] as string[],
    string: [] as (number | undefined)[],
    soundToggles: 0,
  };
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
    onToggleSound: () => {
      events.soundToggles += 1;
    },
  });
  const q = <T extends Element>(selector: string) => {
    const el = window.document.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element ${selector}`);
    return el;
  };
  return { view, q, events };
}

function tuningReading(
  detectedHz: number,
  options: { signalLevel?: number; tunedStrings?: number[] } = {},
): TuningReading {
  return {
    status: 'tuning',
    signalLevel: options.signalLevel ?? 0.5,
    tunedStrings: options.tunedStrings ?? [],
    ...evaluateTuning(detectedHz, standard),
  };
}

const chipNames = (q: <T extends Element>(s: string) => T) =>
  Array.from(q('#strings-row').querySelectorAll('.chip-note')).map((n) => n.textContent);

const needleAngle = (q: <T extends Element>(s: string) => T): number => {
  const transform = q('#needle').getAttribute('transform') ?? '';
  const match = /rotate\(([-\d.]+)/.exec(transform);
  if (!match) throw new Error(`unexpected needle transform: ${transform}`);
  return Number(match[1]);
};

describe('TunerView v2 against index.html', () => {
  it('renders the gauge SVG and six string pegs', () => {
    const { view, q } = mount();
    view.setTuningOptions([{ id: 'standard', name: 'Standard (E A D G B E)' }], 'standard');
    view.setStrings(standard.strings);

    expect(q('#gauge-host').querySelector('svg')).not.toBeNull();
    expect(q('#gauge-host').querySelectorAll('.gauge-zone').length).toBe(3);
    expect(q('#gauge-host').querySelectorAll('.gauge-tick').length).toBe(21);
    expect(q('#needle')).not.toBeNull();
    expect(chipNames(q)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(q<HTMLButtonElement>('#mic-button').textContent).toBe('Iniciar');
    expect(q('#note-name').textContent).toBe('—');
    expect(q('#verdict').getAttribute('data-state')).toBe('idle');
  });

  it('maps cents to needle angles with full-scale clamp', () => {
    expect(centsToAngle(0)).toBe(0);
    expect(centsToAngle(25)).toBeCloseTo(45, 6);
    expect(centsToAngle(80)).toBe(90); // clamped at ±50¢
    expect(centsToAngle(-80)).toBe(-90);
  });

  it('renders an idle reading as dashes with the needle centred', () => {
    const { view, q } = mount();
    view.render({ status: 'idle' });
    expect(q('#note-name').textContent).toBe('—');
    expect(q('#detected-freq').textContent).toBe('--.-');
    expect(q('#target-freq').textContent).toBe('--.-');
    expect(needleAngle(q)).toBe(0);
  });

  it('renders a listening reading with the live signal meter', () => {
    const { view, q } = mount();
    view.render({ status: 'listening', signalLevel: 0.4 });
    expect(q('#verdict').textContent).toContain('Te oigo');
    expect(q('#level-fill').getAttribute('style')).toContain('width: 40%');
    expect(needleAngle(q)).toBe(0);
  });

  it('renders an in-tune A2 dead centre with the green verdict', () => {
    const { view, q } = mount();
    const a2 = standard.strings[1]; // A2, 110 Hz
    view.render(tuningReading(midiToFrequency(a2.midi)));

    expect(q('#note-name').textContent).toBe('A2');
    expect(q('#note-name').getAttribute('data-state')).toBe('inTune');
    expect(q('#target-freq').textContent).toBe('110.0');
    expect(q('#cents-readout').textContent).toBe('0 ¢');
    expect(needleAngle(q)).toBe(0);
    expect(q('#meter').classList.contains('in-tune')).toBe(true);
    expect(q('#verdict').textContent).toContain('Afinada');
    expect(q('#verdict').getAttribute('data-state')).toBe('inTune');
  });

  it('rotates the needle and words the verdict for a sharp note', () => {
    const { view, q } = mount();
    const sharp = 110 * 2 ** (30 / 1200); // A2 +30¢
    view.render(tuningReading(sharp));
    expect(q('#verdict').getAttribute('data-state')).toBe('sharp');
    expect(q('#verdict').textContent).toContain('Muy alta');
    expect(needleAngle(q)).toBeCloseTo(54, 1); // 30¢ × 1.8°/¢
    expect(q('#note-name').getAttribute('data-state')).toBe('sharp');
  });

  it('clamps the needle fully left for a very flat note', () => {
    const { view, q } = mount();
    const lowE = standard.strings[0];
    view.render(tuningReading(midiToFrequency(lowE.midi) * 2 ** (-80 / 1200)));
    expect(q('#note-name').textContent).toBe('E2');
    expect(q('#target-freq').textContent).toBe('82.4');
    expect(q('#verdict').textContent).toContain('Muy baja');
    expect(needleAngle(q)).toBe(-90);
  });

  it('shows the detected frequency, e.g. the spec example 108.7 Hz', () => {
    const { view, q } = mount();
    view.render(tuningReading(108.7));
    expect(q('#detected-freq').textContent).toBe('108.7');
    expect(q('#cents-readout').textContent).toContain('21'); // −20.6 ¢ rounds to −21
  });

  it('highlights the sounding peg', () => {
    const { view, q } = mount();
    view.setStrings(standard.strings);
    view.render(tuningReading(midiToFrequency(55))); // G3, string 3
    const active = q('#strings-row').querySelector('.string-chip.active .chip-note');
    expect(active?.textContent).toBe('G3');
  });

  it('stamps a green ✓ on the strings confirmed as tuned', () => {
    const { view, q } = mount();
    view.setStrings(standard.strings);
    view.render(tuningReading(110, { tunedStrings: [5, 6] }));

    const tuned = Array.from(
      q('#strings-row').querySelectorAll<HTMLButtonElement>('.string-chip.tuned'),
    ).map((c) => c.dataset.number);
    expect(tuned).toEqual(['6', '5']);
    const lowE = q('#strings-row').querySelector<HTMLButtonElement>('.string-chip[data-number="6"]')!;
    expect(lowE.querySelector('.chip-check')?.textContent).toBe('✓');
  });

  it('clears the ✓ marks when the engine goes idle (new session)', () => {
    const { view, q } = mount();
    view.setStrings(standard.strings);
    view.render(tuningReading(110, { tunedStrings: [5] }));
    expect(q('#strings-row').querySelectorAll('.string-chip.tuned').length).toBe(1);
    view.render({ status: 'idle' });
    expect(q('#strings-row').querySelectorAll('.string-chip.tuned').length).toBe(0);
  });

  it('keeps the ✓ marks while a string is only being listened to', () => {
    const { view, q } = mount();
    view.setStrings(standard.strings);
    view.render(tuningReading(110, { tunedStrings: [5] }));
    view.render({ status: 'listening', signalLevel: 0.1 });
    expect(q('#strings-row').querySelectorAll('.string-chip.tuned').length).toBe(1);
  });

  it('toggles the confirmation-sound button state', () => {
    const { view, q, events } = mount();
    const button = q<HTMLButtonElement>('#sound-button');
    view.setSoundEnabled(true);
    expect(button.textContent).toBe('🔔');
    view.setSoundEnabled(false);
    expect(button.textContent).toBe('🔇');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(events.soundToggles).toBe(1);
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
