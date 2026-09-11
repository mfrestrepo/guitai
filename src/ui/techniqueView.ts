/**
 * TechniqueUi — the "Práctica" module: guided technique sessions.
 *
 * Runner behaviour (Phase 0+1 of `docs/research/technique_research.md`):
 *  - the fretboard diagram shows where the next expected note lives;
 *  - the metronome sets the grid (optional, remembered per exercise);
 *  - the microphone turns played notes into timed events, which the session
 *    matches against the expected sequence;
 *  - at the end of each pass the learner gets the honest metrics (accuracy,
 *    cents, timing stability, pauses) and ONE concrete recommendation, and the
 *    tempo policy (+5 after 3 clean passes, −5 after 2 failures) is applied.
 */

import { TECHNIQUE_LEVELS, techniqueExerciseById, stepMsFor, type TechniqueExercise } from '../technique/exercises';
import { TechniqueSession, type TechniquePassOutcome, type TechniqueSnapshot } from '../technique/techniqueSession';
import { techniqueProgressStore } from '../technique/techniqueProgress';
import { browserProgressStorage, type ProgressStorage } from '../chords/progress';
import { TechniqueMicSession } from '../technique/micSession';
import { Metronome, type AudioContextLike } from '../audio/metronome';
import { playAllTunedFanfare, playTunedChime } from '../audio/chime';
import { fretboardSvg } from './fretboardDiagram';
import { midiToNoteName } from '../theory/music';
import { TECHNIQUE_EXERCISES } from '../technique/exercises';

const METRONOME_KEY = 'guitai.technique.metronome.v1';
const MIC_KEY = 'guitai.technique.mic.v1';
const BPM_KEY = 'guitai.technique.bpm.v1';

export interface TechniqueUiCallbacks {
  isSoundEnabled(): boolean;
  onToggleSound(): void;
}

interface RunnerElements {
  fretboard: HTMLElement;
  currentNote: HTMLElement;
  nextNote: HTMLElement;
  detected: HTMLElement;
  slots: HTMLElement;
  accuracy: HTMLElement;
  cents: HTMLElement;
  timing: HTMLElement;
  best: HTMLElement;
  start: HTMLButtonElement;
  stop: HTMLButtonElement;
  metronomeToggle: HTMLButtonElement;
  bpmValue: HTMLElement;
  bpmDown: HTMLButtonElement;
  bpmUp: HTMLButtonElement;
  micToggle: HTMLButtonElement;
  micStatus: HTMLElement;
  tips: HTMLElement;
  result: HTMLElement;
  resultText: HTMLElement;
  resultDetail: HTMLElement;
  nextPass: HTMLButtonElement;
  finish: HTMLButtonElement;
}

function mustGet<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element in index.html: ${selector}`);
  return el;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class TechniqueUi {
  private readonly callbacks: TechniqueUiCallbacks;
  private readonly storage: ProgressStorage;
  private readonly els: RunnerElements & {
    home: HTMLElement;
    runner: HTMLElement;
    levels: HTMLElement;
    back: HTMLButtonElement;
    title: HTMLElement;
    context: HTMLElement;
    status: HTMLElement;
    soundButton: HTMLButtonElement;
  };

  private exercise: TechniqueExercise | null = null;
  private session: TechniqueSession | null = null;
  private metronome: Metronome | null = null;
  private metronomeContext: AudioContext | null = null;
  private mic: TechniqueMicSession | null = null;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private metronomeEnabled = true;
  private micEnabled = true;
  private bpm = 50;

  constructor(root: ParentNode, callbacks: TechniqueUiCallbacks) {
    this.callbacks = callbacks;
    this.storage = browserProgressStorage();
    this.metronomeEnabled = this.readFlag(METRONOME_KEY, true);
    this.micEnabled = this.readFlag(MIC_KEY, true);

    this.els = {
      home: mustGet(root, '#practice-home'),
      runner: mustGet(root, '#practice-runner'),
      levels: mustGet(root, '#practice-levels'),
      back: mustGet<HTMLButtonElement>(root, '#practice-back'),
      title: mustGet(root, '#practice-title'),
      context: mustGet(root, '#practice-context'),
      status: mustGet(root, '#practice-status'),
      soundButton: mustGet<HTMLButtonElement>(root, '#practice-sound-button'),
      fretboard: mustGet(root, '#technique-fretboard'),
      currentNote: mustGet(root, '#technique-current-note'),
      nextNote: mustGet(root, '#technique-next-note'),
      detected: mustGet(root, '#technique-detected'),
      slots: mustGet(root, '#technique-slots'),
      accuracy: mustGet(root, '#technique-accuracy'),
      cents: mustGet(root, '#technique-cents'),
      timing: mustGet(root, '#technique-timing'),
      best: mustGet(root, '#technique-best'),
      start: mustGet<HTMLButtonElement>(root, '#technique-start'),
      stop: mustGet<HTMLButtonElement>(root, '#technique-stop'),
      metronomeToggle: mustGet<HTMLButtonElement>(root, '#technique-metronome-toggle'),
      bpmValue: mustGet(root, '#technique-bpm-value'),
      bpmDown: mustGet<HTMLButtonElement>(root, '#technique-bpm-down'),
      bpmUp: mustGet<HTMLButtonElement>(root, '#technique-bpm-up'),
      micToggle: mustGet<HTMLButtonElement>(root, '#technique-mic-toggle'),
      micStatus: mustGet(root, '#technique-mic-status'),
      tips: mustGet(root, '#technique-tips'),
      result: mustGet(root, '#technique-result'),
      resultText: mustGet(root, '#technique-result-text'),
      resultDetail: mustGet(root, '#technique-result-detail'),
      nextPass: mustGet<HTMLButtonElement>(root, '#technique-next-pass'),
      finish: mustGet<HTMLButtonElement>(root, '#technique-finish'),
    };

    this.els.back.addEventListener('click', () => this.showHome());
    this.els.start.addEventListener('click', () => void this.startPass());
    this.els.stop.addEventListener('click', () => this.stopRunner());
    this.els.nextPass.addEventListener('click', () => void this.startPass());
    this.els.finish.addEventListener('click', () => this.showHome());
    this.els.soundButton.addEventListener('click', () => this.callbacks.onToggleSound());
    this.els.metronomeToggle.addEventListener('click', () => {
      this.metronomeEnabled = !this.metronomeEnabled;
      this.persistFlag(METRONOME_KEY, this.metronomeEnabled);
      this.renderControls();
      if (!this.metronomeEnabled) this.metronome?.stop();
    });
    this.els.micToggle.addEventListener('click', () => {
      this.micEnabled = !this.micEnabled;
      this.persistFlag(MIC_KEY, this.micEnabled);
      this.renderControls();
      if (!this.micEnabled) this.mic?.stop();
    });
    this.els.bpmDown.addEventListener('click', () => this.changeBpm(-5));
    this.els.bpmUp.addEventListener('click', () => this.changeBpm(+5));
  }

  setSoundEnabled(enabled: boolean): void {
    this.els.soundButton.textContent = enabled ? '🔔' : '🔇';
    this.els.soundButton.setAttribute('aria-pressed', String(enabled));
    this.els.soundButton.classList.toggle('muted', !enabled);
  }

  showHome(): void {
    this.stopRunner();
    this.exercise = null;
    this.els.home.hidden = false;
    this.els.runner.hidden = true;
    this.renderList();
  }

  deactivate(): void {
    this.stopRunner();
  }

  /* ---------------- list ---------------- */

  private renderList(): void {
    const blocks = TECHNIQUE_LEVELS.map((level) => {
      const block = el('section', 'level-block');
      const head = el('div', 'level-head');
      head.appendChild(el('span', 'level-badge', level.label.charAt(0)));
      const titles = el('div', 'level-head-text');
      titles.appendChild(el('h2', 'level-title', level.label));
      head.appendChild(titles);
      block.appendChild(head);

      const grid = el('div', 'exercise-grid');
      for (const exercise of TECHNIQUE_EXERCISES.filter((e) => e.level === level.id)) {
        grid.appendChild(this.renderCard(exercise));
      }
      block.appendChild(grid);
      return block;
    });
    this.els.levels.replaceChildren(...blocks);
  }

  private renderCard(exercise: TechniqueExercise): HTMLElement {
    const card = el('button', 'exercise-card');
    card.type = 'button';
    card.dataset.exercise = exercise.id;

    card.appendChild(el('span', 'exercise-title', exercise.title));
    card.appendChild(el('span', 'exercise-desc', exercise.descriptionEs));

    const meta = el('div', 'exercise-meta');
    meta.appendChild(el('span', 'fact-chip', `${exercise.notes.length} notas`));
    meta.appendChild(el('span', 'fact-chip', `${exercise.startBpm} → ${exercise.targetBpm} BPM`));
    meta.appendChild(
      el('span', 'fact-chip', `≥ ${Math.round(exercise.criteria.minAccuracy * 100)} % y ±${exercise.criteria.maxMedianCents} ¢`),
    );
    const record = techniqueProgressStore(this.storage).get(exercise.id);
    if (record.bestBpm > 0) meta.appendChild(el('span', 'fact-chip', `récord ${record.bestBpm} BPM`));
    card.appendChild(meta);
    card.appendChild(el('span', 'exercise-anchor', `💡 ${exercise.tipsEs[0]}`));
    card.addEventListener('click', () => this.openRunner(exercise));
    return card;
  }

  /* ---------------- runner ---------------- */

  private openRunner(exercise: TechniqueExercise): void {
    this.stopRunner();
    this.exercise = exercise;
    this.els.home.hidden = true;
    this.els.runner.hidden = false;
    this.els.title.textContent = exercise.title;
    this.els.context.textContent = exercise.descriptionEs;
    this.els.tips.replaceChildren(...exercise.tipsEs.map((tip) => el('li', 'runner-tip', tip)));

    const stored = this.readNumber(`${BPM_KEY}.${exercise.id}`, exercise.startBpm);
    this.bpm = stored;

    this.session = new TechniqueSession(
      exercise,
      { bpm: this.bpm, metronomeEnabled: this.metronomeEnabled },
      { onChange: (snapshot) => this.renderRunner(snapshot) },
      { store: techniqueProgressStore(this.storage) },
    );
    this.bpm = this.session.snapshot().bpm; // may resume higher from the record

    this.els.result.hidden = true;
    this.renderControls();
    this.renderSlots([]);
    this.renderIdleReadout();
  }

  private async startPass(): Promise<void> {
    if (!this.session || !this.exercise) return;
    this.els.result.hidden = true;

    const now = Date.now();
    if (!this.session.isRunning) this.session.start(now);
    else this.session.startPass(now);
    if (this.metronomeEnabled) this.startMetronome();
    if (this.micEnabled && this.mic?.status !== 'running') await this.startMic();
    this.mic?.resetStream();

    this.tickTimer = setInterval(() => {
      const outcome = this.session?.autoEndIfDue(Date.now());
      if (outcome) this.onPassEnd(outcome);
      else this.renderRunnerLive();
    }, 120);
  }

  private stopRunner(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.metronome?.stop();
    this.mic?.stop();
    this.mic = null;
    this.session?.stop();
  }

  private startMetronome(): void {
    if (!this.metronome) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.metronomeContext = new Ctor({ latencyHint: 'interactive' });
      this.metronome = new Metronome({
        context: this.metronomeContext as unknown as AudioContextLike,
        bpm: this.bpm,
        beatsPerBar: 4,
      });
    }
    this.metronome.setBpm(this.bpm);
    this.metronome.start();
  }

  private async startMic(): Promise<void> {
    this.mic = new TechniqueMicSession({
      onNote: (note) => this.session?.noteDetected(note),
      onStatusChange: (phase, error) => {
        if (phase === 'error') this.els.micStatus.textContent = error ?? 'Error de micrófono';
        else if (phase === 'running') this.els.micStatus.textContent = 'Te escucho';
        else this.els.micStatus.textContent = '';
      },
      onLevel: () => undefined,
    });
    await this.mic.start();
  }

  private onPassEnd(outcome: TechniquePassOutcome): void {
    this.metronome?.stop();
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    const { result, recommendation } = outcome;
    const hasData = this.micEnabled && this.mic?.status === 'running';
    this.els.result.hidden = false;
    this.els.resultText.textContent = hasData
      ? `${recommendation.headlineEs}${result.pass ? ' ✓' : ''}`
      : 'Práctica libre (sin micrófono)';
    this.els.resultDetail.textContent = hasData
      ? `${recommendation.detailEs} · ${Math.round(result.accuracy * 100)} % aciertos, ` +
        `${result.medianAbsCents === null ? '—' : Math.round(result.medianAbsCents)} ¢, ` +
        `estabilidad ${result.timingStdMs === null ? '—' : Math.round(result.timingStdMs)} ms` +
        (result.pauses > 0 ? `, ${result.pauses} pausa(s)` : '')
      : 'Activa 🎤 para que la app evalúe tus notas y te dé métricas.';

    this.renderResult(result);
    this.bpm = outcome.bpm;
    this.els.bpmValue.textContent = String(this.bpm);

    if (hasData && this.callbacks.isSoundEnabled()) {
      if (recommendation.headlineEs.includes('Objetivo alcanzado')) {
        playAllTunedFanfare(this.mic?.audioContext ?? this.metronomeContext ?? null);
      } else if (result.pass) {
        playTunedChime(this.mic?.audioContext ?? null);
      }
    }
  }

  private changeBpm(delta: number): void {
    this.bpm = Math.min(140, Math.max(40, this.bpm + delta));
    this.persistNumber(`${BPM_KEY}.${this.exercise?.id ?? 'global'}`, this.bpm);
    this.session?.setBpm(this.bpm);
    this.metronome?.setBpm(this.bpm);
    this.renderControls();
  }

  /* ---------------- rendering ---------------- */

  private renderControls(): void {
    this.els.bpmValue.textContent = String(this.bpm);
    this.els.metronomeToggle.setAttribute('aria-pressed', String(this.metronomeEnabled));
    this.els.metronomeToggle.classList.toggle('active-toggle', this.metronomeEnabled);
    this.els.micToggle.setAttribute('aria-pressed', String(this.micEnabled));
    this.els.micToggle.classList.toggle('active-toggle', this.micEnabled);
  }

  private renderIdleReadout(): void {
    const exercise = this.exercise;
    if (!exercise) return;
    const first = exercise.notes[0];
    this.els.fretboard.innerHTML = fretboardSvg(exercise, { current: first });
    this.els.currentNote.textContent = midiToNoteName(first.midi);
    this.els.nextNote.textContent = exercise.notes[1] ? midiToNoteName(exercise.notes[1].midi) : '—';
    this.els.detected.textContent = 'Pulsa "Empezar pase"';
    this.els.accuracy.textContent = '—';
    this.els.cents.textContent = '—';
    this.els.timing.textContent = '—';
    this.renderSlots([]);
  }

  private renderRunner(snapshot: TechniqueSnapshot): void {
    this.els.start.hidden = snapshot.passing;
    this.els.stop.hidden = !snapshot.passing;
    this.els.best.textContent = snapshot.bestBpm > 0 ? `${snapshot.bestBpm}` : '—';
    this.els.status.textContent = snapshot.passing
      ? `pase ${snapshot.passNumber + 1}`
      : `racha ${snapshot.passStreak}/${this.exercise?.criteria.cleanPassesToIncrease ?? 3}`;
    this.bpm = snapshot.bpm;
    this.els.bpmValue.textContent = String(snapshot.bpm);
    if (!snapshot.passing && snapshot.lastResult) return; // result panel already rendered
  }

  /** Live update while a pass is running (called from the timer). */
  private renderRunnerLive(): void {
    const exercise = this.exercise;
    const session = this.session;
    if (!exercise || !session || !session.isPassing) return;
    const snapshot = session.snapshot();
    const stepMs = stepMsFor(exercise, snapshot.bpm);
    const slot = Math.min(exercise.notes.length - 1, Math.floor(snapshot.elapsedMs / stepMs));
    const note = exercise.notes[slot];

    this.els.fretboard.innerHTML = fretboardSvg(exercise, { current: note });
    this.els.currentNote.textContent = midiToNoteName(note.midi);
    this.els.nextNote.textContent =
      exercise.notes[slot + 1] ? midiToNoteName(exercise.notes[slot + 1].midi) : '—';

    const detectedCount = snapshot.detectedNotes;
    if (detectedCount === 0) {
      this.els.detected.textContent = 'Escuchando…';
    } else {
      this.els.detected.textContent = `${detectedCount} nota(s) detectada(s)`;
    }
    this.els.timing.textContent = `${Math.max(0, Math.round(snapshot.elapsedMs / 1000))} s`;
  }

  private renderResult(result: NonNullable<TechniqueSnapshot['lastResult']>): void {
    this.els.accuracy.textContent = `${Math.round(result.accuracy * 100)} %`;
    this.els.cents.textContent =
      result.medianAbsCents === null ? '—' : `${Math.round(result.medianAbsCents)} ¢`;
    this.els.timing.textContent =
      result.timingStdMs === null ? '—' : `${Math.round(result.timingStdMs)} ms`;
    this.renderSlots(result.slots);
  }

  private renderSlots(slots: readonly { expectedLabel: string; correct: boolean; cents: number | null }[]): void {
    this.els.slots.replaceChildren(
      ...slots.map((slot) => {
        const chip = el('span', `technique-slot ${slot.correct ? 'ok' : 'wrong'}`);
        chip.textContent = slot.expectedLabel;
        chip.title = slot.cents === null ? 'sin sonar' : `${Math.round(slot.cents)} ¢`;
        return chip;
      }),
    );
  }

  /* ---------------- persistence helpers ---------------- */

  private readNumber(key: string, fallback: number): number {
    const raw = this.storage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? Math.round(value) : fallback;
  }

  private persistNumber(key: string, value: number): void {
    this.storage.setItem(key, String(value));
  }

  private readFlag(key: string, fallback: boolean): boolean {
    const raw = this.storage.getItem(key);
    return raw === null ? fallback : raw === 'on';
  }

  private persistFlag(key: string, value: boolean): void {
    this.storage.setItem(key, value ? 'on' : 'off');
  }

  /** Test hooks. */
  currentExercise(): TechniqueExercise | null {
    return this.exercise;
  }

  currentSession(): TechniqueSession | null {
    return this.session;
  }

  openExercise(id: string): boolean {
    const exercise = techniqueExerciseById(id);
    if (!exercise) return false;
    this.openRunner(exercise);
    return true;
  }

  /** Feed a synthetic detected note (tests, no microphone needed). */
  simulateNote(frequency: number, startMs: number): void {
    this.session?.noteDetected({ frequency, startMs });
  }

  /** Test hook: pretend the microphone is running (no getUserMedia). */
  beginMicSession(): void {
    if (!this.mic) {
      this.mic = new TechniqueMicSession({
        onNote: (note) => this.session?.noteDetected(note),
        onStatusChange: () => undefined,
      });
    }
    this.mic.beginSession();
  }

  /** Test hook: finish the current pass and render its result. */
  simulatePassEnd(nowMs = Date.now()): TechniquePassOutcome | null {
    const outcome = this.session?.endPass(nowMs) ?? null;
    if (outcome) this.onPassEnd(outcome);
    return outcome;
  }
}
