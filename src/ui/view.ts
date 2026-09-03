/**
 * TunerView — renders the engine's {@link Reading} into the DOM.
 *
 * This is the only module that touches `document`. It is a thin presenter:
 * no pitch logic lives here. It owns:
 *  - the tuning preset <select>
 *  - the six clickable string chips (manual target lock)
 *  - the big note name, frequency readouts and cents
 *  - the needle gauge, the verdict banner and the signal meter
 *
 * The verdict → colour/wording mapping is centralized here so tuning
 * constants (see `tuner/evaluator.ts`) stay UI-free.
 */

import type { Reading, EngineStatus } from '../tuner/engine';
import type { TuningStringDef } from '../theory/tunings';

export interface TuningOption {
  readonly id: string;
  readonly name: string;
}

export interface TunerViewCallbacks {
  /** Toggle microphone: start when idle/error, stop when running. */
  onStartStop(): void;
  /** User picked a tuning preset id. */
  onTuningChange(id: string): void;
  /** User clicked a string chip; `undefined` means "auto". */
  onStringSelect(number: number | undefined): void;
}

interface TunerViewElements {
  tuningSelect: HTMLSelectElement;
  micButton: HTMLButtonElement;
  stringsRow: HTMLElement;
  noteName: HTMLElement;
  detectedFreq: HTMLElement;
  targetFreq: HTMLElement;
  needle: HTMLElement;
  centsReadout: HTMLElement;
  verdict: HTMLElement;
  meter: HTMLElement;
  statusText: HTMLElement;
  levelFill: HTMLElement;
}

/** How far a needle may travel on each side, in cents (display clamp). */
export const NEEDLE_RANGE_CENTS = 50;

const VERDICT_TEXT: Record<string, string> = {
  inTune: '¡AFINADA! ✓',
  nearlyFlat: 'Casi afinada ♭ — sube un poco',
  nearlySharp: 'Casi afinada ♯ — baja un poco',
  flat: 'DEMASIADO BAJA ♭ — sube',
  sharp: 'DEMASIADO ALTA ♯ — baja',
};

const VERDICT_COLORS: Record<string, string> = {
  inTune: '#34d399',
  nearlyFlat: '#fbbf24',
  nearlySharp: '#fbbf24',
  flat: '#60a5fa',
  sharp: '#f87171',
};

function mustGet<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element in index.html: ${selector}`);
  return el;
}

export class TunerView {
  private readonly el: TunerViewElements;
  private readonly callbacks: TunerViewCallbacks;
  /** Physically locked target string (1–6) or null for auto-detect. */
  private lockedStringNumber: number | null = null;

  constructor(root: ParentNode, callbacks: TunerViewCallbacks) {
    this.callbacks = callbacks;
    this.el = {
      tuningSelect: mustGet<HTMLSelectElement>(root, '#tuning-select'),
      micButton: mustGet<HTMLButtonElement>(root, '#mic-button'),
      stringsRow: mustGet(root, '#strings-row'),
      noteName: mustGet(root, '#note-name'),
      detectedFreq: mustGet(root, '#detected-freq'),
      targetFreq: mustGet(root, '#target-freq'),
      needle: mustGet(root, '#needle'),
      centsReadout: mustGet(root, '#cents-readout'),
      verdict: mustGet(root, '#verdict'),
      meter: mustGet(root, '#meter'),
      statusText: mustGet(root, '#status-text'),
      levelFill: mustGet(root, '#level-fill'),
    };

    this.el.tuningSelect.addEventListener('change', () => {
      this.callbacks.onTuningChange(this.el.tuningSelect.value);
    });
    this.el.micButton.addEventListener('click', () => this.callbacks.onStartStop());

    this.el.noteName.textContent = '—';
    this.resetDisplay();
  }

  /** Reset the readout to the "no note" state (e.g. after a tuning change). */
  resetDisplay(): void {
    this.renderIdleVisuals();
  }

  /** Fill the tuning <select> (called once with all available presets). */
  setTuningOptions(options: readonly TuningOption[], selectedId?: string): void {
    this.el.tuningSelect.replaceChildren(
      ...options.map((option) => {
        const el = document.createElement('option');
        el.value = option.id;
        el.textContent = option.name;
        return el;
      }),
    );
    if (selectedId) this.el.tuningSelect.value = selectedId;
  }

  /** Rebuild the string chips when the active tuning changes. */
  setStrings(strings: readonly TuningStringDef[]): void {
    this.lockedStringNumber = null;
    this.el.stringsRow.replaceChildren(
      ...strings.map((string) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'string-chip';
        chip.dataset.number = String(string.number);
        chip.setAttribute('aria-pressed', 'false');
        chip.title = `String ${string.number} — ${string.name} (${stringFrequencyDisplay(string)} Hz)`;

        const num = document.createElement('span');
        num.className = 'chip-string-number';
        num.textContent = String(string.number);

        const note = document.createElement('span');
        note.className = 'chip-note';
        note.textContent = string.name;

        const freq = document.createElement('span');
        freq.className = 'chip-freq mono';
        freq.textContent = stringFrequencyDisplay(string);

        chip.append(num, note, freq);
        chip.addEventListener('click', () => {
          const number = Number(chip.dataset.number);
          this.lockedStringNumber = this.lockedStringNumber === number ? null : number;
          this.callbacks.onStringSelect(this.lockedStringNumber ?? undefined);
          this.refreshChips(null);
        });
        return chip;
      }),
    );
  }

  /** Render one analyzed frame (≈30 Hz). */
  render(reading: Reading): void {
    if (reading.status === 'idle') {
      this.renderIdleVisuals();
      return;
    }
    if (reading.status === 'listening') {
      this.renderListening(reading.signalLevel);
      return;
    }

    // status === 'tuning'
    const { verdict } = reading;
    this.el.noteName.textContent = reading.string.name;
    this.el.noteName.dataset.state = verdict;
    this.el.detectedFreq.textContent = reading.detectedFrequency.toFixed(1);
    this.el.targetFreq.textContent = reading.targetFrequency.toFixed(1);
    this.el.centsReadout.textContent = formatCents(reading.cents);

    const color = VERDICT_COLORS[verdict];
    this.el.needle.style.background = color;
    this.el.meter.classList.toggle('in-tune', verdict === 'inTune');

    const rawPercent = 50 + clamp(reading.cents, -NEEDLE_RANGE_CENTS, NEEDLE_RANGE_CENTS) * (50 / NEEDLE_RANGE_CENTS);
    this.el.needle.style.left = `${Math.round(rawPercent * 100) / 100}%`;

    this.el.verdict.textContent = VERDICT_TEXT[verdict];
    this.el.verdict.dataset.state = verdict;
    this.el.levelFill.style.width = `${Math.round(reading.signalLevel * 100)}%`;

    this.refreshChips(reading.string.number);
  }

  /** Reflect engine lifecycle (idle/starting/running/error) on the button. */
  setStatus(status: EngineStatus): void {
    const button = this.el.micButton;
    switch (status.phase) {
      case 'idle':
        button.textContent = 'Iniciar micrófono';
        button.disabled = false;
        this.el.statusText.textContent = 'En espera de empezar.';
        break;
      case 'starting':
        button.textContent = 'Iniciando…';
        button.disabled = true;
        this.el.statusText.textContent = 'Pidiendo acceso al micrófono…';
        break;
      case 'running':
        button.textContent = 'Detener';
        button.disabled = false;
        this.el.statusText.textContent = 'Escuchando — toca una cuerda cada vez.';
        break;
      case 'error':
        button.textContent = 'Iniciar micrófono';
        button.disabled = false;
        this.el.statusText.textContent = status.message;
        break;
    }
  }

  private renderIdleVisuals(): void {
    this.el.noteName.textContent = '—';
    this.el.noteName.dataset.state = 'idle';
    this.el.detectedFreq.textContent = '--.-';
    this.el.targetFreq.textContent = '--.-';
    this.el.centsReadout.textContent = '±0 ¢';
    this.el.needle.style.left = '50%';
    this.el.needle.style.background = '#64748b';
    this.el.meter.classList.remove('in-tune');
    this.el.verdict.textContent = 'Toca una sola cuerda…';
    this.el.verdict.dataset.state = 'idle';
    this.el.levelFill.style.width = '0%';
    this.refreshChips(null);
  }

  private renderListening(signalLevel: number): void {
    this.el.noteName.textContent = '…';
    this.el.noteName.dataset.state = 'idle';
    this.el.verdict.textContent =
      signalLevel > 0.02 ? 'Te oigo — toca una nota clara…' : 'Escuchando…';
    this.el.verdict.dataset.state = 'idle';
    this.el.needle.style.left = '50%';
    this.el.needle.style.background = '#64748b';
    this.el.meter.classList.remove('in-tune');
    this.el.levelFill.style.width = `${Math.round(signalLevel * 100)}%`;
  }

  /** Highlight the chip that is locked (if any) or currently sounding. */
  private refreshChips(soundingNumber: number | null): void {
    for (const chip of this.el.stringsRow.querySelectorAll<HTMLButtonElement>('.string-chip')) {
      const number = Number(chip.dataset.number);
      const isLocked = number === this.lockedStringNumber;
      const isSounding = soundingNumber !== null && number === soundingNumber;
      chip.classList.toggle('locked', isLocked);
      chip.classList.toggle('active', !isLocked && isSounding);
      chip.setAttribute('aria-pressed', String(isLocked));
    }
  }
}

function stringFrequencyDisplay(string: TuningStringDef): string {
  // Duplicate of theory/music.midiToFrequency kept local to avoid a dependency
  // from the view; equals A4 · 2^((midi − 69)/12).
  return (440 * 2 ** ((string.midi - 69) / 12)).toFixed(1);
}

function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return '0 ¢';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} ¢`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
