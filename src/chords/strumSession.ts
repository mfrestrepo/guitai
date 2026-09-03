/**
 * StrumMicSession — microphone plumbing for the sustained-strum (rasgueo) mode.
 *
 * Reads the newest STRUM_FRAME_SIZE samples on a slow cadence (~10 Hz — the
 * frame already covers ~370 ms of audio) and runs {@link analyzeStrum} on
 * every frame, emitting a snapshot the UI can render live while the learner
 * holds the strum. Like the per-string session, all decisions live in pure
 * modules; this class only owns the mic and the loop.
 */

import { openMicrophoneInput, describeMicrophoneError, type AudioInputHandle } from '../audio/input';
import { analyzeStrum, STRUM_FRAME_SIZE, type StrumCheckResult } from './strumCheck';
import { chordById, type ChordDef } from './catalog';

export type StrumMicPhase = 'idle' | 'starting' | 'running' | 'error';

export interface StrumSessionSnapshot {
  readonly mic: StrumMicPhase;
  readonly errorMessage?: string;
  readonly chordId: string | null;
  /** Latest spectral check (updated ~10×/s while the mic is running). */
  readonly result: StrumCheckResult | null;
  /** Consecutive "correct" verdicts so far (used for the mastery badge). */
  readonly correctStreak: number;
}

export interface StrumSessionCallbacks {
  onChange(snapshot: StrumSessionSnapshot): void;
}

export class StrumMicSession {
  private readonly callbacks: StrumSessionCallbacks;

  private input: AudioInputHandle | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;

  private mic: StrumMicPhase = 'idle';
  private errorMessage: string | undefined;
  private chord: ChordDef | null = null;
  private result: StrumCheckResult | null = null;
  private correctStreak = 0;

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
      this.result = null;
      this.correctStreak = 0;
      this.mic = 'running';
      this.emit();
      this.timer = setInterval(() => this.tick(), 100);
    } catch (error) {
      this.input = null;
      this.chord = null;
      this.result = null;
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
    this.result = null;
    this.correctStreak = 0;
    this.mic = 'idle';
    this.errorMessage = undefined;
    this.emit();
  }

  snapshot(): StrumSessionSnapshot {
    return {
      mic: this.mic,
      errorMessage: this.errorMessage,
      chordId: this.chord?.id ?? null,
      result: this.result,
      correctStreak: this.correctStreak,
    };
  }

  /** Analyze one raw frame (also usable by tests with synthetic audio). */
  feedFrame(frame: Float32Array, sampleRate: number): void {
    if (this.chord === null || this.mic !== 'running') return;
    this.result = analyzeStrum(this.chord, frame, sampleRate);
    if (this.result.verdict === 'correct') {
      this.correctStreak += 1;
    } else if (this.result.verdict === 'quiet') {
      // Silence between strums resets nothing — a fresh correct strum continues.
    } else {
      this.correctStreak = 0;
    }
    this.emit();
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
