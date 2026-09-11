/**
 * TechniqueSession — the pure state machine of a guided practice session.
 *
 * A session is a sequence of **passes** over the exercise's expected notes:
 *  - `startPass(nowMs)` begins collecting detected notes for that pass;
 *  - the UI feeds detected notes (from the microphone) while the pass runs;
 *  - `endPass(nowMs)` (or `autoEndIfDue`) matches the pass with
 *    {@link matchSequence}, updates streaks and the record, applies the
 *    researched tempo policy (+5 BPM after N clean passes, −5 after M fails)
 *    and returns a concrete recommendation.
 *
 * Mic-free and audio-free → fully testable with fake notes and fake time.
 */

import type { TechniqueExercise } from './exercises';
import { passDurationMs } from './exercises';
import { matchSequence, type DetectedNote, type SequenceMatchResult } from './sequenceMatcher';
import { recommend, type PracticeMetrics, type Recommendation } from './recommendations';
import {
  emptyRecord,
  type TechniqueProgressStore,
  type TechniqueRecord,
} from './techniqueProgress';

export interface TechniqueSessionSettings {
  bpm: number;
  metronomeEnabled: boolean;
}

export interface TechniquePassOutcome {
  readonly result: SequenceMatchResult;
  readonly recommendation: Recommendation;
  readonly bpm: number;
  /** Tempo the next pass will use (after the policy). */
  readonly nextBpm: number;
}

export interface TechniqueSnapshot {
  readonly exerciseId: string;
  readonly running: boolean;
  readonly passing: boolean;
  readonly bpm: number;
  readonly metronomeEnabled: boolean;
  readonly passNumber: number;
  readonly passStreak: number;
  readonly failStreak: number;
  readonly bestBpm: number;
  readonly bestAccuracy: number;
  readonly detectedNotes: number;
  readonly lastResult: SequenceMatchResult | null;
  readonly lastRecommendation: Recommendation | null;
  readonly elapsedMs: number;
}

export interface TechniqueSessionCallbacks {
  onChange(snapshot: TechniqueSnapshot): void;
}

export interface TechniqueSessionDeps {
  readonly store?: TechniqueProgressStore;
  /** Injectable matcher (tests). */
  readonly match?: typeof matchSequence;
}

export class TechniqueSession {
  private readonly exercise: TechniqueExercise;
  private readonly callbacks: TechniqueSessionCallbacks;
  private readonly store: TechniqueProgressStore | undefined;
  private readonly match: typeof matchSequence;

  private settings: TechniqueSessionSettings;
  private record: TechniqueRecord;

  private running = false;
  private passing = false;
  private passStartMs = 0;
  private passNumber = 0;
  private collected: DetectedNote[] = [];
  private lastResult: SequenceMatchResult | null = null;
  private lastRecommendation: Recommendation | null = null;
  private nowMs = 0;

  constructor(
    exercise: TechniqueExercise,
    settings: TechniqueSessionSettings,
    callbacks: TechniqueSessionCallbacks,
    deps: TechniqueSessionDeps = {},
  ) {
    this.exercise = exercise;
    this.callbacks = callbacks;
    this.settings = { ...settings };
    this.store = deps.store;
    this.match = deps.match ?? matchSequence;
    this.record = this.store?.get(exercise.id) ?? emptyRecord();
    // Resume from the tempo the learner was working at (or the best clean one),
    // never below startBpm and never above the exercise target.
    const resumeBpm = Math.max(
      settings.bpm,
      this.record.currentBpm || 0,
      this.record.bestBpm,
    );
    this.settings.bpm = Math.max(
      exercise.startBpm,
      Math.min(exercise.targetBpm, Math.round(resumeBpm)),
    );
  }

  get exerciseId(): string {
    return this.exercise.id;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPassing(): boolean {
    return this.passing;
  }

  /** Begin a session and its first pass. */
  start(nowMs: number): void {
    this.running = true;
    this.passNumber = 0;
    this.nowMs = nowMs;
    this.beginPass(nowMs);
    this.emit();
  }

  stop(): void {
    if (!this.running && !this.passing) return;
    this.running = false;
    this.passing = false;
    this.collected = [];
    this.emit();
  }

  /** Start the next pass (after the learner has seen the previous result). */
  startPass(nowMs: number): void {
    if (!this.running) {
      this.start(nowMs);
      return;
    }
    this.beginPass(nowMs);
    this.emit();
  }

  /** A note detected by the microphone during the current pass. */
  noteDetected(note: DetectedNote): void {
    if (!this.passing) return;
    this.collected = [...this.collected, note];
    this.emit();
  }

  /**
   * Finish the pass, evaluate it, apply the tempo policy and store the record.
   * Returns the outcome (or null when no pass was running).
   */
  endPass(nowMs: number): TechniquePassOutcome | null {
    if (!this.passing) return null;
    this.nowMs = nowMs;

    const result = this.match(this.exercise, this.settings.bpm, this.collected, this.passStartMs);
    const metrics: PracticeMetrics = {
      accuracy: result.accuracy,
      medianAbsCents: result.medianAbsCents,
      timingStdMs: result.timingStdMs,
      pauses: result.pauses,
      extraNotes: result.extraNotes,
      rushing: result.rushing,
      dragging: result.dragging,
      levelStd: result.levelStd,
    };

    // Streaks and best record.
    if (result.pass) {
      this.record = { ...this.record, passStreak: this.record.passStreak + 1, failStreak: 0 };
      const isBetterBpm = this.settings.bpm > this.record.bestBpm;
      const isBetterAccuracy =
        this.settings.bpm === this.record.bestBpm && result.accuracy > this.record.bestAccuracy;
      if (isBetterBpm || isBetterAccuracy || this.record.bestBpm === 0) {
        this.record = {
          ...this.record,
          bestBpm: Math.max(this.record.bestBpm, this.settings.bpm),
          bestAccuracy: isBetterBpm ? result.accuracy : Math.max(this.record.bestAccuracy, result.accuracy),
        };
      }
      const bestTiming =
        result.timingStdMs !== null &&
        (this.record.bestTimingStdMs === null || result.timingStdMs < this.record.bestTimingStdMs)
          ? result.timingStdMs
          : this.record.bestTimingStdMs;
      this.record = { ...this.record, bestTimingStdMs: bestTiming };
    } else {
      this.record = { ...this.record, failStreak: this.record.failStreak + 1, passStreak: 0 };
    }
    this.record = {
      ...this.record,
      passesCompleted: this.record.passesCompleted + 1,
      updatedAtMs: nowMs,
    };

    // Advice from the metrics (before the automatic tempo policy).
    const baseRecommendation = recommend({
      metrics,
      exercise: this.exercise,
      bpm: this.settings.bpm,
      passStreak: this.record.passStreak - (result.pass ? 1 : 0),
      failStreak: this.record.failStreak - (result.pass ? 0 : 1),
    });

    let recommendation = baseRecommendation;
    // Tempo policy: +5 after N clean passes in a row, −5 after M failures.
    if (result.pass && this.record.passStreak >= this.exercise.criteria.cleanPassesToIncrease) {
      if (this.settings.bpm < this.exercise.targetBpm) {
        const nextBpm = Math.min(this.exercise.targetBpm, this.settings.bpm + 5);
        this.settings = { ...this.settings, bpm: nextBpm };
        this.record = { ...this.record, passStreak: 0 };
        recommendation = {
          action: 'increase-tempo',
          headlineEs: '¡Bien! Subimos +5 BPM',
          detailEs: `Tres pasadas limpias seguidas: el siguiente pase va a ${nextBpm} BPM.`,
          nextBpm,
        };
      } else {
        this.record = { ...this.record, passStreak: 0 };
        recommendation = {
          action: 'repeat',
          headlineEs: '🏆 Objetivo alcanzado',
          detailEs: `Tocas a ${this.settings.bpm} BPM, el objetivo del ejercicio. Mantenlo y pasa a otro.`,
        };
      }
    } else if (
      !result.pass &&
      this.record.failStreak >= this.exercise.criteria.failsToDecrease &&
      this.settings.bpm > this.exercise.startBpm
    ) {
      const nextBpm = Math.max(this.exercise.startBpm, this.settings.bpm - 5);
      this.settings = { ...this.settings, bpm: nextBpm };
      this.record = { ...this.record, failStreak: 0 };
      recommendation = {
        action: 'decrease-tempo',
        headlineEs: 'Bajamos −5 BPM',
        detailEs: `Dos intentos con errores: el siguiente pase va a ${nextBpm} BPM para consolidar.`,
        nextBpm,
      };
    }

    // Remember the working tempo for the next session.
    this.record = { ...this.record, currentBpm: this.settings.bpm };
    this.passing = false;
    this.lastResult = result;
    this.lastRecommendation = recommendation;
    this.passNumber += 1;
    this.store?.set(this.exercise.id, this.record);
    this.emit();

    return {
      result,
      recommendation,
      bpm: this.settings.bpm,
      nextBpm: recommendation.nextBpm ?? this.settings.bpm,
    };
  }

  /** Called from the UI timer: ends the pass automatically when it is due. */
  autoEndIfDue(nowMs: number): TechniquePassOutcome | null {
    if (!this.passing) return null;
    const graceMs = 600; // let the last note ring before judging
    if (nowMs - this.passStartMs >= passDurationMs(this.exercise, this.settings.bpm) + graceMs) {
      return this.endPass(nowMs);
    }
    this.nowMs = nowMs;
    return null;
  }

  setBpm(bpm: number): void {
    this.settings = { ...this.settings, bpm: Math.max(40, Math.min(140, Math.round(bpm))) };
    this.emit();
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, metronomeEnabled: enabled };
    this.emit();
  }

  snapshot(nowMs = this.nowMs): TechniqueSnapshot {
    return {
      exerciseId: this.exercise.id,
      running: this.running,
      passing: this.passing,
      bpm: this.settings.bpm,
      metronomeEnabled: this.settings.metronomeEnabled,
      passNumber: this.passNumber,
      passStreak: this.record.passStreak,
      failStreak: this.record.failStreak,
      bestBpm: this.record.bestBpm,
      bestAccuracy: this.record.bestAccuracy,
      detectedNotes: this.collected.length,
      lastResult: this.lastResult,
      lastRecommendation: this.lastRecommendation,
      elapsedMs: this.running ? Math.max(0, nowMs - this.passStartMs) : 0,
    };
  }

  private beginPass(nowMs: number): void {
    this.passing = true;
    this.passStartMs = nowMs;
    this.nowMs = nowMs;
    this.collected = [];
  }

  private emit(): void {
    this.callbacks.onChange(this.snapshot());
  }
}
