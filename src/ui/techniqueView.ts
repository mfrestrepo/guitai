/**
 * TechniqueUi — the "Práctica" module: guided technique sessions.
 *
 * Learning-design rules applied here (from the research and user feedback):
 *  - every exercise is explained **visually** before playing: goal, short steps,
 *    right-hand alternation and left-hand finger numbers;
 *  - the learner gets **preparation time**: the microphone is opened *before*
 *    the count-in, and the exercise grid starts on a click after 4 count-in
 *    beats (aligned to the metronome's audio clock, so timing is fair);
 *  - the app always shows what it is hearing (level meter + detected note), and
 *    explains itself when it cannot (hints instead of silence);
 *  - jargon lives in a glossary with plain-language meanings.
 */

import {
  TECHNIQUE_LEVELS,
  TECHNIQUE_EXERCISES,
  stepMsFor,
  techniqueExerciseById,
  type TechniqueExercise,
} from '../technique/exercises';
import { explanationFor, TECHNIQUE_GLOSSARY } from '../technique/explanations';
import {
  TechniqueSession,
  type TechniquePassOutcome,
  type TechniqueSnapshot,
} from '../technique/techniqueSession';
import { techniqueProgressStore } from '../technique/techniqueProgress';
import { browserProgressStorage, type ProgressStorage } from '../chords/progress';
import { TechniqueMicSession } from '../technique/micSession';
import { Metronome, type AudioContextLike } from '../audio/metronome';
import { playAllTunedFanfare, playTunedChime } from '../audio/chime';
import { fretboardSvg } from './fretboardDiagram';
import { clickAndNoteSvg, leftHandSvg, rightHandSvg } from './handDiagram';
import { centsBetween, frequencyToMidi, midiToFrequency, midiToNoteName } from '../theory/music';
import type { DetectedNote } from '../technique/sequenceMatcher';

const METRONOME_KEY = 'guitai.technique.metronome.v1';
const MIC_KEY = 'guitai.technique.mic.v1';
const BPM_KEY = 'guitai.technique.bpm.v1';

/** Preparation beats before the exercise grid starts (plus the starting beat). */
export const COUNT_IN_BEATS = 4;

export interface TechniqueUiCallbacks {
  isSoundEnabled(): boolean;
  onToggleSound(): void;
}

type Phase = 'idle' | 'arming' | 'countIn' | 'passing' | 'result';

interface RunnerElements {
  fretboard: HTMLElement;
  countdown: HTMLElement;
  currentNote: HTMLElement;
  nextNote: HTMLElement;
  detected: HTMLElement;
  hint: HTMLElement;
  levelFill: HTMLElement;
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
    status: HTMLElement;
    soundButton: HTMLButtonElement;
    goal: HTMLElement;
    how: HTMLElement;
    handRight: HTMLElement;
    handLeft: HTMLElement;
    handClick: HTMLElement;
    glossaryBody: HTMLElement;
  };

  private exercise: TechniqueExercise | null = null;
  private session: TechniqueSession | null = null;
  private metronome: Metronome | null = null;
  private metronomeContext: AudioContext | null = null;
  private mic: TechniqueMicSession | null = null;

  private phase: Phase = 'idle';
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimers: ReturnType<typeof setTimeout>[] = [];

  private metronomeEnabled = true;
  private micEnabled = true;
  private micRunning = false;
  private bpm = 50;

  /** Grid anchor in the wall-clock (Date.now) domain, aligned to the clicks. */
  private gridStartMs = 0;
  private audioOffsetMs = 0;
  private countInRemaining = 0;

  /** Live feedback. */
  private level = 0;
  private lastNoteAtMs = 0;
  private hintText = '';

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
      status: mustGet(root, '#practice-status'),
      soundButton: mustGet<HTMLButtonElement>(root, '#practice-sound-button'),
      goal: mustGet(root, '#technique-goal'),
      how: mustGet(root, '#technique-how'),
      handRight: mustGet(root, '#technique-hand-right'),
      handLeft: mustGet(root, '#technique-hand-left'),
      handClick: mustGet(root, '#technique-hand-click'),
      glossaryBody: mustGet(root, '#technique-glossary-body'),
      fretboard: mustGet(root, '#technique-fretboard'),
      countdown: mustGet(root, '#technique-countdown'),
      currentNote: mustGet(root, '#technique-current-note'),
      nextNote: mustGet(root, '#technique-next-note'),
      detected: mustGet(root, '#technique-detected'),
      hint: mustGet(root, '#technique-hint'),
      levelFill: mustGet(root, '#technique-level-fill'),
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
      if (!this.micEnabled) {
        this.mic?.stop();
        this.mic = null;
        this.micRunning = false;
        this.els.micStatus.textContent = 'Micrófono apagado';
      }
    });
    this.els.bpmDown.addEventListener('click', () => this.changeBpm(-5));
    this.els.bpmUp.addEventListener('click', () => this.changeBpm(+5));

    this.renderGlossary();
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
    const explanation = explanationFor(exercise);
    const card = el('button', 'exercise-card');
    card.type = 'button';
    card.dataset.exercise = exercise.id;

    const top = el('div', 'exercise-card-top');
    const diagram = el('div', 'exercise-mini');
    diagram.innerHTML = fretboardSvg(exercise, { showLabels: false });
    const text = el('div', 'exercise-card-text');
    text.appendChild(el('span', 'exercise-title', exercise.title));
    text.appendChild(el('span', 'exercise-goal', `🎯 ${explanation.goalEs}`));
    text.appendChild(el('span', 'exercise-desc', exercise.descriptionEs));
    top.append(diagram, text);
    card.appendChild(top);

    const meta = el('div', 'exercise-meta');
    meta.appendChild(el('span', 'fact-chip', `${exercise.notes.length} notas`));
    meta.appendChild(el('span', 'fact-chip', `⏱ ${exercise.startBpm} → ${exercise.targetBpm} BPM`));
    meta.appendChild(
      el(
        'span',
        'fact-chip',
        `🎯 ≥ ${Math.round(exercise.criteria.minAccuracy * 100)} % · 🎚️ ±${exercise.criteria.maxMedianCents} ¢`,
      ),
    );
    const record = techniqueProgressStore(this.storage).get(exercise.id);
    if (record.bestBpm > 0) meta.appendChild(el('span', 'fact-chip', `🏆 ${record.bestBpm} BPM`));
    card.appendChild(meta);
    card.addEventListener('click', () => this.openRunner(exercise));
    return card;
  }

  /* ---------------- runner ---------------- */

  private openRunner(exercise: TechniqueExercise): void {
    this.stopRunner();
    this.exercise = exercise;
    const explanation = explanationFor(exercise);

    this.els.home.hidden = true;
    this.els.runner.hidden = false;
    this.els.title.textContent = exercise.title;

    // Visual explanation.
    this.els.goal.textContent = explanation.goalEs;
    this.els.how.replaceChildren(
      ...explanation.howEs.map((step) => el('li', 'technique-how-step', step)),
    );
    this.els.handRight.innerHTML = rightHandSvg(explanation.alternation);
    this.els.handLeft.innerHTML = leftHandSvg(explanation.leftHand);
    this.els.handClick.innerHTML = clickAndNoteSvg();

    const stored = this.readNumber(`${BPM_KEY}.${exercise.id}`, exercise.startBpm);
    this.bpm = stored;

    this.session = new TechniqueSession(
      exercise,
      { bpm: this.bpm, metronomeEnabled: this.metronomeEnabled },
      { onChange: (snapshot) => this.renderRunner(snapshot) },
      { store: techniqueProgressStore(this.storage) },
    );
    this.bpm = this.session.snapshot().bpm; // may resume higher from the record

    this.phase = 'idle';
    this.els.result.hidden = true;
    this.els.countdown.hidden = true;
    this.renderControls();
    this.renderIdleReadout();
  }

  /**
   * Start a pass properly: open the microphone FIRST (permission + warm-up),
   * then run a 4-beat count-in and start the grid on the following click.
   */
  private async startPass(): Promise<void> {
    if (!this.exercise || !this.session) return;
    this.clearCountdownTimers();
    this.els.result.hidden = true;
    this.phase = 'arming';
    this.setStatus('preparando…');
    this.els.start.hidden = true;
    this.els.stop.hidden = false;

    // 1) Microphone first, so no note is lost while the browser asks permission.
    if (this.micEnabled) {
      if (!this.mic || !this.micRunning) await this.startMic();
      this.micRunning = this.mic?.status === 'running';
    } else {
      this.micRunning = false;
    }

    // 2) Count-in: with the metronome we align to its clicks (audio clock);
    //    without it we simply give four beats of visual preparation.
    if (this.metronomeEnabled) {
      this.ensureMetronome();
      if (this.metronome && this.metronomeContext) {
        this.audioOffsetMs = Date.now() - this.metronomeContext.currentTime * 1000;
        this.countInRemaining = COUNT_IN_BEATS + 1;
        this.phase = 'countIn';
        this.renderCountdown(COUNT_IN_BEATS);
        this.metronome.setBpm(this.bpm);
        this.metronome.start();
        this.setStatus('prepárate…');
        this.startTicker();
        return;
      }
    }
    this.runVisualCountIn();
  }

  /** Count-in without metronome: four beats by timer, then start. */
  private runVisualCountIn(): void {
    const beatMs = 60000 / Math.max(40, this.bpm);
    this.phase = 'countIn';
    for (let i = 0; i < COUNT_IN_BEATS; i++) {
      this.countdownTimers.push(
        setTimeout(() => this.renderCountdown(COUNT_IN_BEATS - i), i * beatMs),
      );
    }
    this.countdownTimers.push(
      setTimeout(() => {
        this.renderCountdown(0);
        this.beginGrid(Date.now());
      }, COUNT_IN_BEATS * beatMs),
    );
    this.setStatus('prepárate…');
  }

  private renderCountdown(secondsLeft: number): void {
    this.els.countdown.hidden = false;
    this.els.countdown.textContent = secondsLeft > 0 ? String(secondsLeft) : '¡ya!';
    this.els.countdown.classList.toggle('go', secondsLeft === 0);
  }

  /** The exercise grid starts here: the session and the metronome agree. */
  private beginGrid(startMs: number): void {
    if (!this.session) return;
    this.gridStartMs = startMs;
    this.lastNoteAtMs = Date.now();
    this.mic?.resetStream();
    if (this.session.isRunning) this.session.startPass(startMs);
    else this.session.start(startMs);
    this.phase = 'passing';
    this.els.countdown.hidden = true;
    this.els.start.hidden = true;
    this.els.stop.hidden = false;
    this.setStatus('tocando');
    this.setHint('');
    this.startTicker();
  }

  private startTicker(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = setInterval(() => {
      if (this.phase !== 'passing') return;
      const outcome = this.session?.autoEndIfDue(Date.now());
      if (outcome) this.onPassEnd(outcome);
      else {
        this.renderRunnerLive();
        this.updateHint();
      }
    }, 120);
  }

  private stopRunner(): void {
    this.clearCountdownTimers();
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.metronome?.stop();
    this.mic?.stop();
    this.mic = null;
    this.micRunning = false;
    this.session?.stop();
    this.phase = 'idle';
    this.els.countdown.hidden = true;
    this.els.levelFill.style.width = '0%';
    this.setHint('');
  }

  private ensureMetronome(): void {
    if (this.metronome) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.metronomeContext = new Ctor({ latencyHint: 'interactive' });
    this.metronome = new Metronome({
      context: this.metronomeContext as unknown as AudioContextLike,
      bpm: this.bpm,
      beatsPerBar: 4,
      onBeat: (event) => this.onBeat(event.time),
    });
  }

  /** Metronome clicks: count-in, then the grid starts on the following click. */
  private onBeat(audioTime: number): void {
    if (this.phase !== 'countIn') return;
    if (this.countInRemaining > 1) {
      this.countInRemaining -= 1;
      this.renderCountdown(this.countInRemaining - 1);
      return;
    }
    // This is the starting click: align the grid with the *audio* clock.
    this.countInRemaining = 0;
    this.beginGrid(this.audioOffsetMs + audioTime * 1000);
  }

  private async startMic(): Promise<void> {
    this.mic = new TechniqueMicSession({
      onNote: (note) => this.onDetectedNote(note),
      onStatusChange: (phase, error) => this.onMicStatus(phase, error),
      onLevel: (level) => this.onLevel(level),
    });
    await this.mic.start();
    this.micRunning = this.mic.status === 'running';
  }

  private onMicStatus(phase: string, error?: string): void {
    if (phase === 'error') {
      this.micRunning = false;
      this.els.micStatus.textContent = error ?? 'Error de micrófono';
      this.setHint('Sin micrófono no hay corrección: activa 🎤 o revisa los permisos.');
    } else if (phase === 'running') {
      this.micRunning = true;
      this.els.micStatus.textContent = 'Te escucho';
      this.setHint('');
    } else {
      this.micRunning = false;
      this.els.micStatus.textContent = '';
    }
  }

  private onLevel(level: number): void {
    this.level = level;
    this.els.levelFill.style.width = `${Math.round(level * 100)}%`;
  }

  private onDetectedNote(note: DetectedNote): void {
    this.lastNoteAtMs = Date.now();
    if (this.phase !== 'passing') return;
    // Ignore notes that were already ringing before the grid started.
    if (note.startMs < this.gridStartMs - 30) return;
    this.session?.noteDetected(note);
    this.renderLiveNote(note);
  }

  private onPassEnd(outcome: TechniquePassOutcome): void {
    this.metronome?.stop();
    this.phase = 'result';
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.els.countdown.hidden = true;
    this.els.start.hidden = false;
    this.els.stop.hidden = true;

    const { result, recommendation } = outcome;
    const evaluated = this.micEnabled && this.micRunning;
    this.els.result.hidden = false;
    this.els.resultText.textContent = evaluated
      ? `${recommendation.headlineEs}${result.pass ? ' ✓' : ''}`
      : 'Práctica libre (sin micrófono)';
    this.els.resultDetail.textContent = evaluated
      ? `${recommendation.detailEs}\n` +
        `${Math.round(result.accuracy * 100)} % de aciertos · ` +
        `${result.medianAbsCents === null ? '—' : Math.round(result.medianAbsCents)} ¢ · ` +
        `estabilidad ${result.timingStdMs === null ? '—' : Math.round(result.timingStdMs)} ms` +
        (result.pauses > 0 ? ` · ${result.pauses} pausa(s)` : '')
      : 'Activa 🎤 para que la app escuche cada nota y te dé métricas.';

    this.renderResult(result);
    this.bpm = outcome.bpm;
    this.els.bpmValue.textContent = String(this.bpm);
    this.setStatus(evaluated ? (result.pass ? 'pase limpio' : 'a revisar') : 'libre');
    this.setHint('');

    if (evaluated && this.callbacks.isSoundEnabled()) {
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

  private renderGlossary(): void {
    this.els.glossaryBody.replaceChildren(
      ...TECHNIQUE_GLOSSARY.map((term) => {
        const item = el('div', 'glossary-item');
        item.appendChild(el('span', 'glossary-icon', term.icon));
        item.appendChild(el('span', 'glossary-term', term.termEs));
        item.appendChild(el('span', 'glossary-meaning', term.meaningEs));
        return item;
      }),
    );
  }

  private renderIdleReadout(): void {
    const exercise = this.exercise;
    if (!exercise) return;
    const first = exercise.notes[0];
    this.els.fretboard.innerHTML = fretboardSvg(exercise, { current: first });
    this.els.currentNote.textContent = midiToNoteName(first.midi);
    this.els.nextNote.textContent = exercise.notes[1] ? midiToNoteName(exercise.notes[1].midi) : '—';
    this.els.detected.textContent = 'Pulsa "Empezar"';
    this.els.detected.dataset.state = 'idle';
    this.els.accuracy.textContent = '—';
    this.els.cents.textContent = '—';
    this.els.timing.textContent = '—';
    if (exercise) {
      const record = techniqueProgressStore(this.storage).get(exercise.id);
      this.els.best.textContent = record.bestBpm > 0 ? `${record.bestBpm}` : '—';
    }
    this.renderSlots([]);
    this.setHint('Escucharé tus notas y te diré qué mejorar.');
  }

  private renderRunner(snapshot: TechniqueSnapshot): void {
    const busy = this.phase === 'passing' || this.phase === 'countIn' || this.phase === 'arming';
    this.els.start.hidden = busy;
    this.els.stop.hidden = this.phase === 'idle';
    this.els.best.textContent = snapshot.bestBpm > 0 ? `${snapshot.bestBpm}` : '—';
    if (this.phase === 'idle') this.setStatus('listo');
    this.bpm = snapshot.bpm;
    this.els.bpmValue.textContent = String(snapshot.bpm);
  }

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
  }

  private renderLiveNote(note: DetectedNote): void {
    const exercise = this.exercise;
    if (!exercise) return;
    const stepMs = stepMsFor(exercise, this.bpm);
    const relative = Math.max(0, note.startMs - this.gridStartMs);
    const slot = Math.min(exercise.notes.length - 1, Math.floor(relative / stepMs));
    const expected = exercise.notes[slot];
    const cents = centsBetween(note.frequency, midiToFrequency(expected.midi));
    const detectedName = midiToNoteName(frequencyToMidi(note.frequency));
    const sign = cents >= 0 ? '+' : '−';
    this.els.detected.textContent = `oí ${detectedName} ${sign}${Math.abs(Math.round(cents))} ¢`;
    this.els.detected.dataset.state = Math.abs(cents) <= 35 ? 'ok' : 'wrong';
  }

  private updateHint(): void {
    if (this.phase !== 'passing') return;
    const quietFor = Date.now() - this.lastNoteAtMs;
    if (this.level > 0.12 && quietFor > 2500) {
      this.setHint('Te oigo, pero no distingo la nota: toca una cuerda a la vez y deja sonar.');
    } else if (this.level < 0.04 && quietFor > 2500) {
      this.setHint('No te oigo: acerca la guitarra al micrófono y comprueba el permiso.');
    } else {
      this.setHint('');
    }
  }

  private setHint(text: string): void {
    if (text === this.hintText) return;
    this.hintText = text;
    this.els.hint.textContent = text;
    this.els.hint.hidden = text.length === 0;
  }

  private setStatus(text: string): void {
    this.els.status.textContent = text;
  }

  private renderResult(result: NonNullable<TechniqueSnapshot['lastResult']>): void {
    this.els.accuracy.textContent = `${Math.round(result.accuracy * 100)} %`;
    this.els.cents.textContent =
      result.medianAbsCents === null ? '—' : `${Math.round(result.medianAbsCents)} ¢`;
    this.els.timing.textContent =
      result.timingStdMs === null ? '—' : `${Math.round(result.timingStdMs)} ms`;
    this.renderSlots(result.slots);
  }

  private renderSlots(
    slots: readonly { expectedLabel: string; correct: boolean; cents: number | null }[],
  ): void {
    this.els.slots.replaceChildren(
      ...slots.map((slot) => {
        const chip = el('span', `technique-slot ${slot.correct ? 'ok' : 'wrong'}`);
        chip.textContent = slot.expectedLabel;
        chip.title = slot.cents === null ? 'sin sonar' : `${Math.round(slot.cents)} ¢`;
        return chip;
      }),
    );
  }

  private clearCountdownTimers(): void {
    for (const timer of this.countdownTimers) clearTimeout(timer);
    this.countdownTimers = [];
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

  /* ---------------- test hooks ---------------- */

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

  /** Pretend the microphone is running (no getUserMedia in tests). */
  beginMicSession(): void {
    if (!this.mic) {
      this.mic = new TechniqueMicSession({
        onNote: (note) => this.onDetectedNote(note),
        onStatusChange: () => undefined,
        onLevel: (level) => this.onLevel(level),
      });
    }
    this.mic.beginSession();
    this.micRunning = true;
    this.els.micStatus.textContent = 'Te escucho';
  }

  /** Skip the count-in and start the grid immediately (tests / no metronome). */
  beginPassImmediately(nowMs = Date.now()): void {
    this.phase = 'arming';
    this.beginGrid(nowMs);
  }

  simulateNote(frequency: number, startMs: number): void {
    this.session?.noteDetected({ frequency, startMs });
    this.renderLiveNote({ frequency, startMs });
  }

  simulatePassEnd(nowMs = Date.now()): TechniquePassOutcome | null {
    const outcome = this.session?.endPass(nowMs) ?? null;
    if (outcome) this.onPassEnd(outcome);
    return outcome;
  }
}
