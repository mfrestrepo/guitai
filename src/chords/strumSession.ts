/**
 * StrumMicSession — microphone plumbing for the sustained-strum (rasgueo) mode.
 *
 * Reads the newest STRUM_FRAME_SIZE samples ~16×/s and runs {@link analyzeStrum}
 * on each frame. The raw results are aggregated by {@link StrumAttemptTracker},
 * which publishes a verdict as soon as a strum has enough evidence (~0.3 s) and
 * keeps it readable afterwards. Snapshots are emitted every frame so the UI can
 * show live per-string states (which string sounds / which one fails).
 */

import { openMicrophoneInput, describeMicrophoneError, type AudioInputHandle } from '../audio/input';
import {
  analyzeStrum,
  frameRms,
  STRUM_FRAME_SIZE,
  type StrumCheckResult,
  type StrumIssue,
} from './strumCheck';
import { StrumAttemptTracker, type LiveStringState } from './strumAttempt';
import { chordById, type ChordDef } from './catalog';

export type StrumMicPhase = 'idle' | 'starting' | 'running' | 'error';

/** Mic polling cadence (ms): frequent enough for live feedback, cheap enough. */
export const STRUM_TICK_MS = 60;

export interface StrumSessionSnapshot {
  readonly mic: StrumMicPhase;
  readonly errorMessage?: string;
  readonly chordId: string | null;
  /** 'verdict' while a readable verdict is on screen, else 'listening'. */
  readonly stage: 'listening' | 'verdict';
  readonly verdict: 'correct' | 'issues' | null;
  readonly issues: readonly StrumIssue[];
  /** How long the current verdict has been on screen (ms). */
  readonly stableMs: number;
  /** Increments on every new verdict → the UI plays the cue once per verdict. */
  readonly verdictSeq: number;
  /** 0…1 evidence gathered for the current strum (progress bar). */
  readonly progress: number;
  /** Per-string live diagnosis: 'ok' sounds right, 'wrong' is a culprit. */
  readonly liveStates: Readonly<Record<number, LiveStringState>>;
  /** Aggregated per-string ratios for the string lights. */
  readonly stringScores: Readonly<Record<number, number>>;
  /** Latest raw spectral analysis (kept for fallbacks/diagnostics). */
  readonly analysis: StrumCheckResult | null;
}

export interface StrumSessionCallbacks {
  onChange(snapshot: StrumSessionSnapshot): void;
}

export class StrumMicSession {
  private readonly callbacks: StrumSessionCallbacks;
  private readonly tracker = new StrumAttemptTracker();

  private input: AudioInputHandle | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;

  private mic: StrumMicPhase = 'idle';
  private errorMessage: string | undefined;
  private chord: ChordDef | null = null;
  private analysis: StrumCheckResult | null = null;

  constructor(callbacks: StrumSessionCallbacks) {
    this.callbacks = callbacks;
    this.emit();
  }

  /** Audio context of the running mic (used to play the validation cue). */
  get audioContext(): AudioContext | null {
    return this.input?.context ?? null;
  }

  async start(chordId: string): Promise<void> {
    if (this.mic === 'running' || this.mic === 'starting') return;
    const chord = chordById(chordId);
    if (!chord) {
      this.errorMessage = `Acorde desconocido: ${chordId}`;
      this.mic = 'error';
      this.emit();
      return;
    }
    this.mic = 'starting';
    this.errorMessage = undefined;
    this.emit();
    try {
      this.input = await openMicrophoneInput({ fftSize: STRUM_FRAME_SIZE });
      this.frame = new Float32Array(this.input.analyser.fftSize);
      this.chord = chord;
      this.tracker.reset();
      this.analysis = null;
      this.mic = 'running';
      this.emit();
      this.timer = setInterval(() => this.tick(), STRUM_TICK_MS);
    } catch (error) {
      this.input = null;
      this.chord = null;
      this.analysis = null;
      this.mic = 'error';
      this.errorMessage = describeMicrophoneError(error);
      this.emit();
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.input?.stop();
    this.input = null;
    this.chord = null;
    this.analysis = null;
    this.tracker.reset();
    this.mic = 'idle';
    this.errorMessage = undefined;
    this.emit();
  }

  /** Analyze one raw frame (also usable by tests with synthetic audio). */
  feedFrame(frame: Float32Array, sampleRate: number, nowMs = Date.now()): void {
    if (this.chord === null) return;
    const analysis = analyzeStrum(this.chord, frame, sampleRate);
    this.analysis = analysis;
    this.tracker.push({
      verdict: analysis.verdict,
      issues: analysis.issues,
      scores: analysis.scores,
      rms: frameRms(frame),
      nowMs,
    });
    // Emit every frame so the UI can show live per-string states.
    this.emit();
  }

  snapshot(): StrumSessionSnapshot {
    const state = this.tracker.snapshot();
    const now = Date.now();
    return {
      mic: this.mic,
      errorMessage: this.errorMessage,
      chordId: this.chord?.id ?? null,
      stage: state.stage,
      verdict: state.verdict,
      issues: state.issues,
      stableMs:
        state.verdict !== null && state.publishedAtMs !== null
          ? Math.max(0, now - state.publishedAtMs)
          : 0,
      verdictSeq: state.verdictSeq,
      progress: state.progress,
      liveStates: state.liveStates,
      stringScores: state.stringScores,
      analysis: this.analysis,
    };
  }

  /**
   * Attach a chord WITHOUT opening the microphone (test hook): after this,
   * `feedFrame` can be driven with synthetic frames.
   */
  beginSession(chordId: string): boolean {
    if (this.mic === 'running' || this.mic === 'starting') return false;
    const chord = chordById(chordId);
    if (!chord) return false;
    this.chord = chord;
    this.tracker.reset();
    this.analysis = null;
    return true;
  }

  private tick(): void {
    const input = this.input;
    const frame = this.frame;
    if (!input || !frame) return;
    input.readFrame(frame);
    this.feedFrame(frame, input.sampleRate);
  }

  private emit(): void {
    this.callbacks.onChange(this.snapshot());
  }
}
