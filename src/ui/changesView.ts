/**
 * ChangesUi — the "Cambios de acorde" module: exercise list + runner.
 *
 * The runner combines three things that already exist elsewhere:
 *  - {@link ExerciseSession}: pure drill state machine (chords, counters, timer);
 *  - {@link Metronome}: optional, synthesized, tempo selectable;
 *  - {@link StrumMicSession}: optional microphone validation, so a change only
 *    counts as *clean* when the chord really sounds right — the same live
 *    per-string diagnosis (green/red on the diagram) is reused here.
 */

import { chordById } from '../chords/catalog';
import type { ChordDef } from '../chords/catalog';
import {
  CHORD_EXERCISES,
  EXERCISE_LEVELS,
  anchorFingerTip,
  exerciseById,
  type ChordExercise,
} from '../chords/exercises';
import { ExerciseSession, type ExerciseSettings, type ExerciseSnapshot } from '../chords/exerciseSession';
import { exerciseBestStore } from '../chords/exerciseProgress';
import { browserProgressStorage, type ProgressStorage } from '../chords/progress';
import { Metronome, type AudioContextLike } from '../audio/metronome';
import { StrumMicSession, type StrumSessionSnapshot } from '../chords/strumSession';
import { chordDiagramSvg, type StringState } from './chordDiagram';
import { playAllTunedFanfare, playTunedChime } from '../audio/chime';
import type { StringNumber } from '../chords/catalog';

const BPM_KEY = 'guitai.changes.bpm.v1';
const BEATS_KEY = 'guitai.changes.beats.v1';
const METRONOME_KEY = 'guitai.changes.metronome.v1';
const MIC_KEY = 'guitai.changes.mic.v1';

export interface ChangesUiCallbacks {
  isSoundEnabled(): boolean;
  onToggleSound(): void;
}

interface RunnerElements {
  current: HTMLElement;
  next: HTMLElement;
  diagram: HTMLElement;
  beats: HTMLElement;
  changes: HTMLElement;
  clean: HTMLElement;
  cleanWrap: HTMLElement;
  best: HTMLElement;
  start: HTMLButtonElement;
  stop: HTMLButtonElement;
  timer: HTMLElement;
  metronomeToggle: HTMLButtonElement;
  bpmValue: HTMLElement;
  bpmDown: HTMLButtonElement;
  bpmUp: HTMLButtonElement;
  beatsSelect: HTMLSelectElement;
  micToggle: HTMLButtonElement;
  tips: HTMLElement;
  finished: HTMLElement;
  finishedText: HTMLElement;
  repeat: HTMLButtonElement;
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

export class ChangesUi {
  private readonly callbacks: ChangesUiCallbacks;
  private readonly storage: ProgressStorage;
  private readonly els: {
    home: HTMLElement;
    runner: HTMLElement;
    levels: HTMLElement;
    back: HTMLButtonElement;
    title: HTMLElement;
    context: HTMLElement;
    soundButton: HTMLButtonElement;
  } & RunnerElements;

  private exercise: ChordExercise | null = null;
  private session: ExerciseSession | null = null;
  private metronome: Metronome | null = null;
  private metronomeContext: AudioContext | null = null;
  private strum: StrumMicSession | null = null;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastVerdictSeq = 0;
  private bpm = 60;
  private beatsPerChord = 4;
  private metronomeEnabled = false;
  private validateWithMic = false;

  constructor(root: ParentNode, callbacks: ChangesUiCallbacks) {
    this.callbacks = callbacks;
    this.storage = browserProgressStorage();
    this.bpm = this.readNumber(BPM_KEY, 60, 40, 140);
    this.beatsPerChord = this.readNumber(BEATS_KEY, 4, 1, 4);
    this.metronomeEnabled = this.readFlag(METRONOME_KEY, false);
    this.validateWithMic = this.readFlag(MIC_KEY, false);

    this.els = {
      home: mustGet(root, '#changes-home'),
      runner: mustGet(root, '#changes-runner'),
      levels: mustGet(root, '#changes-levels'),
      back: mustGet<HTMLButtonElement>(root, '#changes-back'),
      title: mustGet(root, '#changes-title'),
      context: mustGet(root, '#changes-context'),
      soundButton: mustGet<HTMLButtonElement>(root, '#changes-sound-button'),
      current: mustGet(root, '#runner-current'),
      next: mustGet(root, '#runner-next'),
      diagram: mustGet(root, '#runner-diagram'),
      beats: mustGet(root, '#runner-beats'),
      changes: mustGet(root, '#runner-changes'),
      clean: mustGet(root, '#runner-clean'),
      cleanWrap: mustGet(root, '#runner-clean-wrap'),
      best: mustGet(root, '#runner-best'),
      start: mustGet<HTMLButtonElement>(root, '#runner-start'),
      stop: mustGet<HTMLButtonElement>(root, '#runner-stop'),
      timer: mustGet(root, '#changes-timer'),
      metronomeToggle: mustGet<HTMLButtonElement>(root, '#metronome-toggle'),
      bpmValue: mustGet(root, '#bpm-value'),
      bpmDown: mustGet<HTMLButtonElement>(root, '#bpm-down'),
      bpmUp: mustGet<HTMLButtonElement>(root, '#bpm-up'),
      beatsSelect: mustGet<HTMLSelectElement>(root, '#beats-per-chord'),
      micToggle: mustGet<HTMLButtonElement>(root, '#mic-validate'),
      tips: mustGet(root, '#runner-tips'),
      finished: mustGet(root, '#runner-finished'),
      finishedText: mustGet(root, '#runner-finished-text'),
      repeat: mustGet<HTMLButtonElement>(root, '#runner-repeat'),
      finish: mustGet<HTMLButtonElement>(root, '#runner-finish'),
    };

    this.els.back.addEventListener('click', () => this.showHome());
    this.els.start.addEventListener('click', () => void this.startRunner());
    this.els.stop.addEventListener('click', () => this.stopRunner());
    this.els.repeat.addEventListener('click', () => void this.startRunner());
    this.els.finish.addEventListener('click', () => this.showHome());
    this.els.soundButton.addEventListener('click', () => this.callbacks.onToggleSound());
    this.els.metronomeToggle.addEventListener('click', () => {
      this.metronomeEnabled = !this.metronomeEnabled;
      this.persistFlag(METRONOME_KEY, this.metronomeEnabled);
      this.renderControls();
      if (this.metronomeEnabled && this.session?.isRunning) this.startMetronome();
      else this.metronome?.stop();
    });
    this.els.micToggle.addEventListener('click', () => {
      this.validateWithMic = !this.validateWithMic;
      this.persistFlag(MIC_KEY, this.validateWithMic);
      this.renderControls();
      this.session?.setValidateWithMic(this.validateWithMic);
      if (this.session?.isRunning) void this.syncValidation();
      else this.stopValidation();
    });
    this.els.bpmDown.addEventListener('click', () => this.changeBpm(-5));
    this.els.bpmUp.addEventListener('click', () => this.changeBpm(+5));
    this.els.beatsSelect.addEventListener('change', () => {
      this.beatsPerChord = Number(this.els.beatsSelect.value) || 4;
      this.persistNumber(BEATS_KEY, this.beatsPerChord);
      this.session?.setBeatsPerChord(this.beatsPerChord);
      this.updateMetronome();
    });

    this.renderControls();
  }

  /** Update the shared validation-sound button. */
  setSoundEnabled(enabled: boolean): void {
    this.els.soundButton.textContent = enabled ? '🔔' : '🔇';
    this.els.soundButton.setAttribute('aria-pressed', String(enabled));
    this.els.soundButton.classList.toggle('muted', !enabled);
  }

  /** Exercise list, grouped by difficulty. */
  showHome(): void {
    this.stopRunner();
    this.exercise = null;
    this.els.home.hidden = false;
    this.els.runner.hidden = true;
    this.renderList();
  }

  /** Stop everything (leaving the tab). */
  deactivate(): void {
    this.stopRunner();
  }

  /* ---------------- exercise list ---------------- */

  private renderList(): void {
    const blocks = EXERCISE_LEVELS.map((level) => {
      const block = el('section', 'level-block');
      const head = el('div', 'level-head');
      head.appendChild(el('span', 'level-badge', level.label.charAt(0)));
      const titles = el('div', 'level-head-text');
      titles.appendChild(el('h2', 'level-title', level.label));
      head.appendChild(titles);
      head.appendChild(el('span', 'level-count', level.hint));
      block.appendChild(head);

      const grid = el('div', 'exercise-grid');
      for (const exercise of CHORD_EXERCISES.filter((e) => e.level === level.id)) {
        grid.appendChild(this.renderExerciseCard(exercise));
      }
      block.appendChild(grid);
      return block;
    });
    this.els.levels.replaceChildren(...blocks);
  }

  private renderExerciseCard(exercise: ChordExercise): HTMLElement {
    const card = el('button', 'exercise-card');
    card.type = 'button';
    card.dataset.exercise = exercise.id;

    const chain = el('div', 'exercise-chain');
    exercise.chordIds.forEach((id, index) => {
      if (index > 0) chain.appendChild(el('span', 'exercise-arrow', '→'));
      chain.appendChild(el('span', 'exercise-chord', chordById(id)?.displayName ?? id));
    });
    card.appendChild(chain);
    card.appendChild(el('span', 'exercise-title', exercise.title));
    card.appendChild(el('span', 'exercise-desc', exercise.descriptionEs));

    const meta = el('div', 'exercise-meta');
    meta.appendChild(
      el(
        'span',
        'fact-chip',
        exercise.targetBpm
          ? `${exercise.startBpm} → ${exercise.targetBpm} BPM`
          : `${exercise.startBpm} BPM`,
      ),
    );
    if (exercise.targetChanges) meta.appendChild(el('span', 'fact-chip', `meta ${exercise.targetChanges} limpios`));
    if (exercise.silent) meta.appendChild(el('span', 'fact-chip', 'sin sonido'));
    if (exercise.kind === 'random') meta.appendChild(el('span', 'fact-chip', '🎲 al azar'));
    card.appendChild(meta);

    const anchor = anchorFingerTip(exercise);
    if (anchor) card.appendChild(el('span', 'exercise-anchor', anchor));
    card.addEventListener('click', () => this.openRunner(exercise));
    return card;
  }

  /* ---------------- runner ---------------- */

  private openRunner(exercise: ChordExercise): void {
    this.stopRunner();
    this.exercise = exercise;
    this.els.home.hidden = true;
    this.els.runner.hidden = false;
    this.els.title.textContent = exercise.title;
    this.els.context.textContent = exercise.descriptionEs;

    this.els.tips.replaceChildren(
      ...exercise.tipsEs.map((tip) => el('li', 'runner-tip', tip)),
    );

    // Suggested tempo: the exercise's starting point, unless the learner has
    // already chosen a tempo for this exercise.
    const storedBpm = this.readNumber(`${BPM_KEY}.${exercise.id}`, exercise.startBpm, 40, 140);
    this.bpm = storedBpm;
    this.beatsPerChord = exercise.beatsPerChord;
    this.persistNumber(BEATS_KEY, this.beatsPerChord);

    this.session = new ExerciseSession(
      exercise,
      this.currentSettings(),
      { onChange: (snapshot) => this.renderRunner(snapshot) },
      { store: exerciseBestStore(this.storage) },
    );

    this.lastVerdictSeq = 0;
    this.renderControls();
    this.resetRunnerVisuals();
    // Show the first chord (and the next one) before the drill starts.
    this.renderRunner(this.session.snapshot());
  }

  private currentSettings(): ExerciseSettings {
    return {
      bpm: this.bpm,
      metronomeEnabled: this.metronomeEnabled,
      beatsPerChord: this.beatsPerChord,
      validateWithMic: this.validateWithMic && !this.exercise?.silent,
    };
  }

  private async startRunner(): Promise<void> {
    if (!this.session || !this.exercise) return;
    this.els.finished.hidden = true;
    this.session.setBpm(this.bpm);
    this.session.setBeatsPerChord(this.beatsPerChord);
    this.session.setValidateWithMic(this.validateWithMic && !this.exercise.silent);
    this.session.start(Date.now());

    if (this.metronomeEnabled) this.startMetronome();

    this.tickTimer = setInterval(() => {
      this.session?.tick(Date.now());
    }, 200);

    await this.syncValidation();
  }

  private stopRunner(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.metronome?.stop();
    this.session?.stop();
    this.stopValidation();
    if (this.session) this.renderRunner(this.session.snapshot());
  }

  private startMetronome(): void {
    if (!this.metronome) {
      // The metronome has its own audio context: it works without the mic.
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.metronomeContext = new Ctor({ latencyHint: 'interactive' });
      this.metronome = new Metronome({
        context: this.metronomeContext as unknown as AudioContextLike,
        bpm: this.bpm,
        beatsPerBar: 4,
        onBeat: (event) => this.onBeat(event.beat, event.accent),
      });
    }
    this.metronome.setBpm(this.bpm);
    this.metronome.start();
  }

  private updateMetronome(): void {
    this.metronome?.setBpm(this.bpm);
  }

  private onBeat(beat: number, accent: boolean): void {
    this.session?.onBeat(Date.now());
    this.pulseBeat(beat, accent);
    void this.syncValidation();
  }

  /** Start/stop/retarget the microphone validation session as needed. */
  private async syncValidation(): Promise<void> {
    if (!this.session || !this.exercise) return;
    const running = this.session.snapshot().running;
    const wantValidation = this.validateWithMic && !this.exercise.silent && running;

    if (!wantValidation) {
      this.stopValidation();
      return;
    }

    const chordId = this.session.snapshot().chordId;
    if (!chordId) return;

    if (!this.strum) {
      this.strum = new StrumMicSession({ onChange: (snapshot) => this.onValidation(snapshot) });
      await this.strum.start(chordId);
      return;
    }
    if (this.strum.snapshot().chordId !== chordId) this.strum.changeChord(chordId);
  }

  private stopValidation(): void {
    this.strum?.stop();
    this.strum = null;
    this.renderDiagram(undefined);
  }

  private onValidation(snapshot: StrumSessionSnapshot): void {
    if (!this.session) return;
    // Keep the diagram in sync with the live per-string diagnosis.
    this.renderDiagram(snapshot.liveStates);

    if (snapshot.verdictSeq > this.lastVerdictSeq) {
      this.lastVerdictSeq = snapshot.verdictSeq;
      if (snapshot.verdict === 'correct') {
        this.session.reportValidation('correct');
        if (this.callbacks.isSoundEnabled()) playTunedChime(this.strum?.audioContext ?? null);
      } else if (snapshot.verdict === 'issues') {
        this.session.reportValidation('issues');
      }
    }
  }

  private changeBpm(delta: number): void {
    this.bpm = Math.min(140, Math.max(40, this.bpm + delta));
    this.persistNumber(BPM_KEY, this.bpm);
    if (this.exercise) this.persistNumber(`${BPM_KEY}.${this.exercise.id}`, this.bpm);
    this.session?.setBpm(this.bpm);
    this.updateMetronome();
    this.renderControls();
  }

  /* ---------------- rendering ---------------- */

  private renderControls(): void {
    this.els.bpmValue.textContent = String(this.bpm);
    this.els.metronomeToggle.setAttribute('aria-pressed', String(this.metronomeEnabled));
    this.els.metronomeToggle.classList.toggle('active-toggle', this.metronomeEnabled);
    this.els.micToggle.setAttribute('aria-pressed', String(this.validateWithMic));
    this.els.micToggle.classList.toggle('active-toggle', this.validateWithMic);
    this.els.micToggle.disabled = this.exercise?.silent === true;
    this.els.beatsSelect.value = String(this.beatsPerChord);
    this.els.cleanWrap.hidden = !this.validateWithMic;
  }

  private resetRunnerVisuals(): void {
    this.els.current.textContent = '—';
    this.els.next.textContent = '—';
    this.els.changes.textContent = '0';
    this.els.clean.textContent = '0';
    this.els.best.textContent = '—';
    this.els.timer.textContent = this.exercise?.durationSeconds
      ? `${this.exercise.durationSeconds} s`
      : 'libre';
    this.els.finished.hidden = true;
    this.renderDiagram(undefined);
    this.renderBeats(0, 4);
  }

  private renderRunner(snapshot: ExerciseSnapshot): void {
    const exercise = this.exercise;
    if (!exercise) return;

    this.els.current.textContent = snapshot.chordId
      ? (chordById(snapshot.chordId)?.displayName ?? '—')
      : '—';
    this.els.next.textContent = snapshot.nextChordId
      ? (chordById(snapshot.nextChordId)?.displayName ?? '—')
      : '🎲';
    this.els.changes.textContent = String(snapshot.changes);
    this.els.clean.textContent = String(snapshot.cleanChanges);
    this.els.best.textContent = snapshot.best === null ? '—' : String(snapshot.best);
    this.els.start.hidden = snapshot.running;
    this.els.stop.hidden = !snapshot.running;

    if (snapshot.remainingMs !== null) {
      this.els.timer.textContent = `${Math.ceil(snapshot.remainingMs / 1000)} s`;
    } else {
      this.els.timer.textContent = snapshot.running ? `cambio ${snapshot.changes + 1}` : 'libre';
    }

    if (snapshot.chordId) this.renderCurrentDiagram(snapshot.chordId);
    this.renderBeats(snapshot.beatsIntoChord, snapshot.beatsPerChord);

    if (snapshot.finished) this.renderFinished(snapshot);
  }

  private renderFinished(snapshot: ExerciseSnapshot): void {
    this.metronome?.stop();
    this.stopValidation();
    this.els.finished.hidden = false;
    const metric = snapshot.validateWithMic
      ? `${snapshot.cleanChanges} cambios limpios`
      : `${snapshot.changes} cambios`;
    const target = this.exercise?.targetChanges;
    const reached = target !== undefined && (snapshot.validateWithMic ? snapshot.cleanChanges : snapshot.changes) >= target;
    this.els.finishedText.textContent = `${reached ? '🏆' : '💪'} ${metric}${target ? ` (meta ${target})` : ''} · récord: ${snapshot.best ?? '—'}`;
    if (reached && this.callbacks.isSoundEnabled()) {
      playAllTunedFanfare(this.strum?.audioContext ?? this.metronomeContext ?? null);
    }
  }

  private renderCurrentDiagram(chordId: string): void {
    if (this.strum) return; // the live validation draws it (with colours)
    const chord = chordById(chordId);
    if (!chord) return;
    const key = `plain:${chordId}`;
    if (key === this.lastDiagramKey) return;
    this.lastDiagramKey = key;
    this.els.diagram.innerHTML = chordDiagramSvg(chord, { scale: 0.55 });
  }

  private renderDiagram(liveStates: Readonly<Record<number, 'ok' | 'wrong'>> | undefined): void {
    const chord = this.session?.snapshot().chordId;
    if (!chord) {
      this.els.diagram.replaceChildren();
      this.lastDiagramKey = '';
      return;
    }
    const definition = chordById(chord);
    if (!definition) return;

    const highlight: Partial<Record<StringNumber, StringState>> = {};
    for (const [number, state] of Object.entries(liveStates ?? {})) {
      highlight[Number(number) as StringNumber] = state;
    }
    const key = `${chord}:${JSON.stringify(highlight)}`;
    if (key === this.lastDiagramKey) return;
    this.lastDiagramKey = key;
    this.els.diagram.innerHTML = chordDiagramSvg(definition, { highlight, scale: 0.55 });
  }

  private lastDiagramKey = '';

  private renderBeats(beatsIntoChord: number, beatsPerChord: number): void {
    const dots: HTMLElement[] = [];
    for (let i = 0; i < beatsPerChord; i++) {
      const dot = el('span', `beat-dot${i < beatsIntoChord ? ' past' : ''}${i === 0 ? ' accent' : ''}`);
      dots.push(dot);
    }
    this.els.beats.replaceChildren(...dots);
  }

  private pulseBeat(beat: number, accent: boolean): void {
    const dots = this.els.beats.querySelectorAll('.beat-dot');
    const dot = dots[beat];
    if (!dot) return;
    dot.classList.add('pulse');
    if (accent) dot.classList.add('accent-pulse');
    setTimeout(() => dot.classList.remove('pulse', 'accent-pulse'), 120);
  }

  /* ---------------- small persistence helpers ---------------- */

  private readNumber(key: string, fallback: number, min: number, max: number): number {
    const raw = this.storage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
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

  /** Access to the current session (used by tests). */
  currentSession(): ExerciseSession | null {
    return this.session;
  }

  /** Expose the loaded exercise (used by tests). */
  currentExercise(): ChordExercise | null {
    return this.exercise;
  }

  /** Open a runner by exercise id (used by tests and deep links). */
  openExercise(id: string): boolean {
    const exercise = exerciseById(id);
    if (!exercise) return false;
    this.openRunner(exercise);
    return true;
  }

  /** Chord definition helper for the UI (kept here to avoid extra imports). */
  static chordById(id: string): ChordDef | undefined {
    return chordById(id);
  }
}
