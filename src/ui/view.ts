/**
 * TunerView — renders the engine's {@link Reading} into the DOM.
 *
 * Visual language (GuitarTuna/Yousician-inspired):
 *  - a semicircular **arc gauge** with flat / in-tune / sharp zones and a
 *    needle that rotates smoothly (±50¢ full scale);
 *  - **string pegs** that light up, can be locked by clicking and show a green
 *    ✓ once the string is confirmed tuned;
 *  - big note + cents readout, and a single short verdict line.
 *
 * This is the only DOM-touching module of the tuner; no pitch logic here.
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
  /** User clicked a string peg; `undefined` means "auto". */
  onStringSelect(number: number | undefined): void;
  /** User toggled the confirmation sound. */
  onToggleSound(): void;
}

/** Full-scale deflection of the gauge, in cents. */
export const GAUGE_MAX_CENTS = 50;

/** Gauge geometry (SVG user units). */
const GAUGE = { cx: 160, cy: 162, radius: 122, tickInner: 96 };

interface TunerViewElements {
  tuningSelect: HTMLSelectElement;
  micButton: HTMLButtonElement;
  soundButton: HTMLButtonElement;
  stringsRow: HTMLElement;
  gaugeHost: HTMLElement;
  meter: HTMLElement;
  noteName: HTMLElement;
  detectedFreq: HTMLElement;
  targetFreq: HTMLElement;
  needle: SVGLineElement;
  centsReadout: HTMLElement;
  verdict: HTMLElement;
  statusText: HTMLElement;
  levelFill: HTMLElement;
}

const VERDICT_TEXT: Record<string, string> = {
  inTune: '¡Afinada! ✓',
  nearlyFlat: 'Casi · sube un poco',
  nearlySharp: 'Casi · baja un poco',
  flat: 'Muy baja · sube',
  sharp: 'Muy alta · baja',
};

function mustGet<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element in index.html: ${selector}`);
  return el;
}

/** Map a cents deviation to a needle angle in degrees (0 = straight up). */
export function centsToAngle(cents: number): number {
  const clamped = Math.min(GAUGE_MAX_CENTS, Math.max(-GAUGE_MAX_CENTS, cents));
  return clamped * (90 / GAUGE_MAX_CENTS);
}

function pointOnArc(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: GAUGE.cx + radius * Math.cos(rad), y: GAUGE.cy - radius * Math.sin(rad) };
}

/** Angle for a cents value: −50¢ → 180°, 0 → 90° (up), +50¢ → 0°. */
const angleForCents = (cents: number) => 90 - centsToAngle(cents);

function arcPath(fromCents: number, toCents: number, radius: number): string {
  const from = pointOnArc(angleForCents(fromCents), radius);
  const to = pointOnArc(angleForCents(toCents), radius);
  // Decreasing angle (left → right over the top) is clockwise → sweep flag 1.
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/** Full gauge SVG: zones, ticks, end labels, needle and hub. */
function gaugeMarkup(): string {
  const zone = (from: number, to: number, cls: string) =>
    `<path class="gauge-zone ${cls}" d="${arcPath(from, to, GAUGE.radius)}" />`;

  const ticks: string[] = [];
  for (let cents = -GAUGE_MAX_CENTS; cents <= GAUGE_MAX_CENTS; cents += 5) {
    const major = cents % 10 === 0;
    const center = cents === 0;
    const outer = pointOnArc(angleForCents(cents), GAUGE.tickInner + (major ? 14 : 8));
    const inner = pointOnArc(angleForCents(cents), GAUGE.tickInner);
    ticks.push(
      `<line class="gauge-tick${major ? ' major' : ''}${center ? ' center' : ''}" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" />`,
    );
  }

  const leftLabel = pointOnArc(angleForCents(-GAUGE_MAX_CENTS), GAUGE.radius + 18);
  const rightLabel = pointOnArc(angleForCents(GAUGE_MAX_CENTS), GAUGE.radius + 18);
  const needleTip = pointOnArc(90, 96);

  return `<svg class="gauge-svg" viewBox="0 0 320 186" role="img" aria-label="Medidor de afinación">
    ${zone(-GAUGE_MAX_CENTS, -5, 'zone-flat')}
    ${zone(-5, 5, 'zone-intune')}
    ${zone(5, GAUGE_MAX_CENTS, 'zone-sharp')}
    ${ticks.join('')}
    <text class="gauge-end flat" x="${leftLabel.x.toFixed(1)}" y="${(leftLabel.y + 6).toFixed(1)}">♭</text>
    <text class="gauge-end sharp" x="${rightLabel.x.toFixed(1)}" y="${(rightLabel.y + 6).toFixed(1)}">♯</text>
    <line id="needle" class="gauge-needle" x1="${GAUGE.cx}" y1="${GAUGE.cy}" x2="${GAUGE.cx}" y2="${needleTip.y.toFixed(2)}" transform="rotate(0 ${GAUGE.cx} ${GAUGE.cy})" />
    <circle class="gauge-hub" cx="${GAUGE.cx}" cy="${GAUGE.cy}" r="7" />
  </svg>`;
}

export class TunerView {
  private readonly el: TunerViewElements;
  private readonly callbacks: TunerViewCallbacks;
  /** Physically locked target string (1–6) or null for auto-detect. */
  private lockedStringNumber: number | null = null;

  constructor(root: ParentNode, callbacks: TunerViewCallbacks) {
    this.callbacks = callbacks;
    const gaugeHost = mustGet<HTMLElement>(root, '#gauge-host');
    gaugeHost.innerHTML = gaugeMarkup();

    this.el = {
      tuningSelect: mustGet<HTMLSelectElement>(root, '#tuning-select'),
      micButton: mustGet<HTMLButtonElement>(root, '#mic-button'),
      soundButton: mustGet<HTMLButtonElement>(root, '#sound-button'),
      stringsRow: mustGet<HTMLElement>(root, '#strings-row'),
      gaugeHost,
      meter: mustGet<HTMLElement>(root, '#meter'),
      noteName: mustGet(root, '#note-name'),
      detectedFreq: mustGet(root, '#detected-freq'),
      targetFreq: mustGet(root, '#target-freq'),
      needle: mustGet<SVGLineElement>(gaugeHost, '#needle'),
      centsReadout: mustGet(root, '#cents-readout'),
      verdict: mustGet(root, '#verdict'),
      statusText: mustGet(root, '#status-text'),
      levelFill: mustGet(root, '#level-fill'),
    };

    this.el.tuningSelect.addEventListener('change', () => {
      this.callbacks.onTuningChange(this.el.tuningSelect.value);
    });
    this.el.micButton.addEventListener('click', () => this.callbacks.onStartStop());
    this.el.soundButton.addEventListener('click', () => this.callbacks.onToggleSound());

    this.resetDisplay();
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

  /** Rebuild the string pegs when the active tuning changes. */
  setStrings(strings: readonly TuningStringDef[]): void {
    this.lockedStringNumber = null;
    this.el.stringsRow.replaceChildren(
      ...strings.map((string) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'string-chip';
        chip.dataset.number = String(string.number);
        chip.setAttribute('aria-pressed', 'false');
        chip.title = `Cuerda ${string.number} — ${string.name}`;

        const note = document.createElement('span');
        note.className = 'chip-note';
        note.textContent = string.name;

        const check = document.createElement('span');
        check.className = 'chip-check';
        check.textContent = '✓';

        chip.append(note, check);
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

  /** Update the confirmation-sound button (🔔 on / 🔇 off). */
  setSoundEnabled(enabled: boolean): void {
    this.el.soundButton.textContent = enabled ? '🔔' : '🔇';
    this.el.soundButton.setAttribute('aria-pressed', String(enabled));
    this.el.soundButton.classList.toggle('muted', !enabled);
  }

  /** Reset the readout to the "no note" state. */
  resetDisplay(): void {
    this.renderIdleVisuals();
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
    this.el.meter.classList.toggle('in-tune', verdict === 'inTune');

    this.el.needle.setAttribute(
      'transform',
      `rotate(${centsToAngle(reading.cents).toFixed(2)} ${GAUGE.cx} ${GAUGE.cy})`,
    );

    this.el.verdict.textContent = VERDICT_TEXT[verdict];
    this.el.verdict.dataset.state = verdict;
    this.el.levelFill.style.width = `${Math.round(reading.signalLevel * 100)}%`;

    this.refreshChips(reading.string.number, reading.tunedStrings);
  }

  /** Reflect engine lifecycle (idle/starting/running/error) on the button. */
  setStatus(status: EngineStatus): void {
    const button = this.el.micButton;
    switch (status.phase) {
      case 'idle':
        button.textContent = 'Iniciar';
        button.disabled = false;
        this.el.statusText.textContent = 'Pulsa Iniciar';
        break;
      case 'starting':
        button.textContent = '…';
        button.disabled = true;
        this.el.statusText.textContent = 'Conectando…';
        break;
      case 'running':
        button.textContent = 'Parar';
        button.disabled = false;
        this.el.statusText.textContent = 'Escuchando';
        break;
      case 'error':
        button.textContent = 'Iniciar';
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
    this.el.needle.setAttribute('transform', `rotate(0 ${GAUGE.cx} ${GAUGE.cy})`);
    this.el.meter.classList.remove('in-tune');
    this.el.verdict.textContent = 'Toca una cuerda…';
    this.el.verdict.dataset.state = 'idle';
    this.el.levelFill.style.width = '0%';
    this.refreshChips(null);
  }

  private renderListening(signalLevel: number): void {
    this.el.noteName.textContent = '…';
    this.el.noteName.dataset.state = 'idle';
    this.el.centsReadout.textContent = '±0 ¢';
    this.el.verdict.textContent = signalLevel > 0.02 ? 'Te oigo…' : 'Toca una cuerda…';
    this.el.verdict.dataset.state = 'idle';
    this.el.needle.setAttribute('transform', `rotate(0 ${GAUGE.cx} ${GAUGE.cy})`);
    this.el.meter.classList.remove('in-tune');
    this.el.levelFill.style.width = `${Math.round(signalLevel * 100)}%`;
  }

  /**
   * Highlight the peg that is locked and/or sounding, and stamp a green ✓ on
   * the strings already confirmed in tune.
   */
  private refreshChips(soundingNumber: number | null, tunedStrings: readonly number[] = []): void {
    const tuned = new Set(tunedStrings);
    for (const chip of this.el.stringsRow.querySelectorAll<HTMLButtonElement>('.string-chip')) {
      const number = Number(chip.dataset.number);
      const isLocked = number === this.lockedStringNumber;
      const isSounding = soundingNumber !== null && number === soundingNumber;
      chip.classList.toggle('locked', isLocked);
      chip.classList.toggle('active', !isLocked && isSounding);
      chip.classList.toggle('tuned', tuned.has(number));
      chip.setAttribute('aria-pressed', String(isLocked));
    }
  }
}

function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return '0 ¢';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} ¢`;
}
