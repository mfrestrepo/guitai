/**
 * StrumMicSession — microphone plumbing for the sustained-strum (rasgueo) mode.
 *
 * Reads the newest STRUM_FRAME_SIZE samples at ~10 Hz (the frame covers ~370 ms
 * of audio) and runs {@link analyzeStrum} on every frame. Raw frames flicker,
 * so the results are fed into a {@link StrumGate}, which only *publishes* a
 * verdict after ~1–2 s of consistent sound and then holds it on screen for a
 * readable amount of time. This class owns the mic + loop only; the gate and
 * the spectral analysis are pure and unit tested.
 */

import { openMicrophoneInput, describeMicrophoneError, type AudioInputHandle } from '../audio/input';
import { analyzeStrum, STRUM_FRAME_SIZE, type StrumCheckResult, type StrumIssue } from './strumCheck';
import { StrumGate, type StrumFrameVerdict } from './strumGate';
import { chordById, type ChordDef } from './catalog';

export type StrumMicPhase = 'idle' | 'starting' | 'running' | 'error';

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
  /** Latest raw analysis (only used for the string lights). */
  readonly analysis: StrumCheckResult | null;
}

export interface StrumSessionCallbacks {
  onChange(snapshot: StrumSessionSnapshot): void;
}

export class StrumMicSession {
  private readonly callbacks: StrumSessionCallbacks;
  private readonly gate = new StrumGate();

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
      this.gate.reset();
      this.analysis = null;
      this.mic = 'running';
      this.emit();
      this.timer = setInterval(() => this.tick(), 100);
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
    this.gate.reset();
    this.mic = 'idle';
    this.errorMessage = undefined;
    this.emit();
  }

  /** Analyze one raw frame (also usable by tests with synthetic audio). */
  feedFrame(frame: Float32Array, sampleRate: number, nowMs = Date.now()): void {
    if (this.chord === null) return;
    this.analysis = analyzeStrum(this.chord, frame, sampleRate);

    const verdict: StrumFrameVerdict =
      this.analysis.verdict === 'quiet'
        ? 'quiet'
        : this.analysis.verdict === 'correct'
          ? 'correct'
          : 'issues';

    const event = this.gate.push({
      verdict,
      issues: verdict === 'issues' ? this.analysis.issues : [],
      nowMs,
    });
    if (event) this.emit();
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
    this.gate.reset();
    this.analysis = null;
    return true;
  }

  snapshot(): StrumSessionSnapshot {
    const state = this.gate.state();
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
      analysis: this.analysis,
    };
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
