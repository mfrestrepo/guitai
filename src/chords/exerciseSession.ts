/**
 * ExerciseSession — pure state machine for a chord-change drill.
 *
 * It owns everything the runner UI needs and none of the audio:
 *  - which chord is expected now and which comes next;
 *  - the metronome position (beats inside the current chord, bar count);
 *  - how many changes were completed, and how many were *clean* (the
 *    microphone validation confirmed the chord sounded right);
 *  - the countdown of timed drills (the classic one-minute changes);
 *  - the best score achieved for that exercise, via an injectable store.
 *
 * The UI feeds it metronome beats, validation results and time ticks, which
 * makes it fully testable with fake time (exerciseSession.test.ts).
 */

import { chordById } from './catalog';
import type { ChordExercise } from './exercises';

export interface ExerciseSettings {
  bpm: number;
  metronomeEnabled: boolean;
  beatsPerChord: number;
  /** Validate each chord with the microphone (counts "clean" changes). */
  validateWithMic: boolean;
}

export interface ExerciseSnapshot {
  readonly exerciseId: string;
  readonly running: boolean;
  readonly finished: boolean;
  readonly chordId: string | null;
  /** Next chord id, or null when it is picked at random / unknown. */
  readonly nextChordId: string | null;
  /** Completed changes (switches to the next chord). */
  readonly changes: number;
  /** Changes whose chord was confirmed by the microphone. */
  readonly cleanChanges: number;
  /** The chord currently expected has sounded correct at least once. */
  readonly currentClean: boolean;
  readonly beatsIntoChord: number;
  readonly bar: number;
  readonly elapsedMs: number;
  readonly remainingMs: number | null;
  readonly bpm: number;
  readonly metronomeEnabled: boolean;
  readonly beatsPerChord: number;
  readonly validateWithMic: boolean;
  /** Chords played so far (most recent last) — useful in random drills. */
  readonly history: readonly string[];
  /** Best score recorded for this exercise (changes, or clean changes). */
  readonly best: number | null;
}

export interface ExerciseSessionCallbacks {
  onChange(snapshot: ExerciseSnapshot): void;
}

/** Persistence of best results (localStorage in the browser, memory in tests). */
export interface ExerciseBestStore {
  getBest(exerciseId: string): number | undefined;
  setBest(exerciseId: string, value: number): void;
}

export interface ExerciseSessionOptions {
  /** Injectable RNG for the random drills (seedable in tests). */
  random?: () => number;
  store?: ExerciseBestStore;
}

export class ExerciseSession {
  private readonly exercise: ChordExercise;
  private readonly callbacks: ExerciseSessionCallbacks;
  private readonly random: () => number;
  private readonly store: ExerciseBestStore | undefined;

  private settings: ExerciseSettings;
  private running = false;
  private finished = false;
  private startedAtMs = 0;
  private history: string[] = [];
  private beatsIntoChord = 0;
  private bar = 0;
  private changes = 0;
  private cleanChanges = 0;
  private currentClean = false;
  /** Last known time (from start/onBeat/tick) — snapshot() must not need the clock. */
  private nowMs = 0;
  private best: number | null;

  constructor(
    exercise: ChordExercise,
    settings: ExerciseSettings,
    callbacks: ExerciseSessionCallbacks,
    options: ExerciseSessionOptions = {},
  ) {
    this.exercise = exercise;
    this.callbacks = callbacks;
    this.settings = { ...settings };
    this.random = options.random ?? Math.random;
    this.store = options.store;
    this.best = this.store?.getBest(exercise.id) ?? null;
    this.resetSequence();
  }

  get exerciseId(): string {
    return this.exercise.id;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Start (or restart) the drill. */
  start(nowMs: number): void {
    this.resetSequence();
    this.running = true;
    this.finished = false;
    this.startedAtMs = nowMs;
    this.nowMs = nowMs;
    this.emit();
  }

  stop(): void {
    if (!this.running && !this.finished) return;
    this.running = false;
    this.emit();
  }

  setBpm(bpm: number): void {
    this.settings = { ...this.settings, bpm };
    this.emit();
  }

  setBeatsPerChord(beats: number): void {
    this.settings = { ...this.settings, beatsPerChord: Math.max(1, Math.round(beats)) };
    this.beatsIntoChord = 0;
    this.emit();
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, metronomeEnabled: enabled };
    this.emit();
  }

  setValidateWithMic(enabled: boolean): void {
    this.settings = { ...this.settings, validateWithMic: enabled };
    this.emit();
  }

  /** A metronome beat happened: advance the chord when its slot is over. */
  onBeat(nowMs: number): void {
    if (!this.running) return;
    this.nowMs = nowMs;
    this.beatsIntoChord += 1;
    if (this.beatsIntoChord >= this.settings.beatsPerChord) {
      this.advanceChord();
    }
    this.emit();
  }

  /**
   * Live microphone validation for the chord currently expected.
   * `correct` marks the current change as clean (once per change).
   */
  reportValidation(verdict: 'correct' | 'issues' | 'quiet' | null): void {
    if (!this.running || verdict !== 'correct' || this.currentClean) return;
    this.currentClean = true;
    this.emit();
  }

  /** Time tick: updates the countdown and finishes timed drills. */
  tick(nowMs: number): void {
    if (!this.running) return;
    this.nowMs = nowMs;
    const elapsed = nowMs - this.startedAtMs;
    const duration = this.exercise.durationSeconds;
    if (duration !== undefined && elapsed >= duration * 1000) {
      this.finish();
      return;
    }
    this.emit();
  }

  snapshot(nowMs = this.nowMs): ExerciseSnapshot {
    const elapsedMs = this.running || this.finished ? Math.max(0, nowMs - this.startedAtMs) : 0;
    const duration = this.exercise.durationSeconds;
    const remainingMs =
      duration !== undefined && this.running
        ? Math.max(0, duration * 1000 - elapsedMs)
        : duration !== undefined
          ? 0
          : null;
    const current = this.history[this.history.length - 1] ?? null;
    return {
      exerciseId: this.exercise.id,
      running: this.running,
      finished: this.finished,
      chordId: current,
      nextChordId: this.nextChordId(),
      changes: this.changes,
      cleanChanges: this.cleanChanges,
      currentClean: this.currentClean,
      beatsIntoChord: this.beatsIntoChord,
      bar: this.bar,
      elapsedMs,
      remainingMs,
      bpm: this.settings.bpm,
      metronomeEnabled: this.settings.metronomeEnabled,
      beatsPerChord: this.settings.beatsPerChord,
      validateWithMic: this.settings.validateWithMic,
      history: this.history,
      best: this.best,
    };
  }

  /* ---------------- internals ---------------- */

  private resetSequence(): void {
    this.history = [this.exercise.chordIds[0]];
    this.beatsIntoChord = 0;
    this.bar = 0;
    this.changes = 0;
    this.cleanChanges = 0;
    this.currentClean = false;
  }

  private advanceChord(): void {
    // Close the current slot: count the change, and whether it sounded clean.
    this.changes += 1;
    if (this.settings.validateWithMic && this.currentClean) this.cleanChanges += 1;

    const next = this.pickNextChord();
    this.history = [...this.history, next];
    this.beatsIntoChord = 0;
    this.currentClean = false;
    this.bar += 1;
  }

  private pickNextChord(): string {
    if (this.exercise.kind === 'random') {
      const pool = this.exercise.randomPoolChordIds ?? this.exercise.chordIds;
      const current = this.history[this.history.length - 1];
      const candidates = pool.filter((id) => id !== current);
      const choices = candidates.length > 0 ? candidates : pool;
      return choices[Math.floor(this.random() * choices.length) % choices.length];
    }
    const sequence = this.exercise.chordIds;
    const current = this.history[this.history.length - 1];
    const index = sequence.indexOf(current);
    return sequence[(index + 1) % sequence.length];
  }

  private nextChordId(): string | null {
    // Random drills pick the next chord when the change happens, so there is
    // nothing concrete to preview (the UI shows a 🎲 instead).
    if (this.exercise.kind === 'random') return null;
    const sequence = this.exercise.chordIds;
    const current = this.history[this.history.length - 1];
    const index = sequence.indexOf(current);
    return sequence[(index + 1) % sequence.length] ?? null;
  }

  private finish(): void {
    this.running = false;
    this.finished = true;
    const score = this.settings.validateWithMic ? this.cleanChanges : this.changes;
    if (this.store && (this.best === null || score > this.best)) {
      this.best = score;
      this.store.setBest(this.exercise.id, score);
    }
    this.emit();
  }

  /** Convenience for the UI: the chord definition currently expected. */
  currentChordId(): string | null {
    return this.history[this.history.length - 1] ?? null;
  }

  /** Convenience for the UI: the chord definition of the next change. */
  nextChord(): ReturnType<typeof chordById> {
    const id = this.nextChordId();
    return id ? chordById(id) : undefined;
  }

  private emit(): void {
    this.callbacks.onChange(this.snapshot());
  }
}
