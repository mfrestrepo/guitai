/**
 * TechniqueMicSession — microphone plumbing for the guided practice module.
 *
 * Reads analysed frames, feeds them to the {@link NoteStreamDetector} and emits
 * timed note starts (`{ frequency, startMs, level }`) which the session matches
 * against the expected exercise sequence. Thin on purpose: all decisions live in
 * pure modules.
 */

import { openMicrophoneInput, describeMicrophoneError, type AudioInputHandle } from '../audio/input';
import { analyzeFrame, SILENCE_RMS } from '../audio/frameAnalysis';
import { NoteStreamDetector } from '../pitch/noteStream';
import type { DetectedNote } from './sequenceMatcher';

export type TechniqueMicPhase = 'idle' | 'starting' | 'running' | 'error';

/**
 * Analysis cadence. 24 ms is precise enough to compare onsets with the
 * metronome grid while keeping the CPU cost of the (much more reliable) 4096
 * window at a level the tuner already proves works on real machines.
 */
export const TECHNIQUE_TICK_MS = 24;

/**
 * Same window length as the tuner: 4096 samples (~93 ms) gives YIN several
 * periods of the lowest notes of these exercises, which is what makes the
 * difference with a real microphone. A 2048 window was too short in practice.
 */
export const TECHNIQUE_FFT_SIZE = 4096;

export interface TechniqueMicCallbacks {
  onNote(note: DetectedNote): void;
  onStatusChange?(phase: TechniqueMicPhase, errorMessage?: string): void;
  onLevel?(level: number): void;
}

export class TechniqueMicSession {
  private readonly callbacks: TechniqueMicCallbacks;
  private readonly detector = new NoteStreamDetector();

  private input: AudioInputHandle | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;
  private phase: TechniqueMicPhase = 'idle';
  private errorMessage: string | undefined;

  constructor(callbacks: TechniqueMicCallbacks) {
    this.callbacks = callbacks;
  }

  get audioContext(): AudioContext | null {
    return this.input?.context ?? null;
  }

  get status(): TechniqueMicPhase {
    return this.phase;
  }

  async start(): Promise<void> {
    if (this.phase === 'running' || this.phase === 'starting') return;
    this.setPhase('starting');
    try {
      this.input = await openMicrophoneInput({ fftSize: TECHNIQUE_FFT_SIZE });
      this.frame = new Float32Array(this.input.analyser.fftSize);
      this.detector.reset();
      this.setPhase('running');
      this.timer = setInterval(() => this.tick(), TECHNIQUE_TICK_MS);
    } catch (error) {
      this.input = null;
      this.setPhase('error', describeMicrophoneError(error));
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.input?.stop();
    this.input = null;
    this.detector.reset();
    this.setPhase('idle');
  }

  /** Forget the current note (between passes). */
  resetStream(): void {
    this.detector.reset();
  }

  /** Analyze one raw frame (test hook with synthetic audio). */
  feedFrame(frame: Float32Array, sampleRate: number, nowMs = Date.now()): void {
    const analysis = analyzeFrame(frame, sampleRate);
    this.callbacks.onLevel?.(analysis.signalLevel);
    const events = this.detector.push({
      rms: analysis.rms,
      frequency: analysis.pitchFrequency,
      nowMs,
    });
    for (const event of events) {
      if (event.kind === 'start') {
        this.callbacks.onNote({
          frequency: event.frequency,
          startMs: event.startMs,
          level: event.level,
        });
      }
    }
  }

  /** Attach without a microphone (test hook): `feedFrame` then works. */
  beginSession(): void {
    this.detector.reset();
    this.setPhase('running');
  }

  private tick(): void {
    const input = this.input;
    const frame = this.frame;
    if (!input || !frame) return;
    input.readFrame(frame);
    this.feedFrame(frame, input.sampleRate);
  }

  private setPhase(phase: TechniqueMicPhase, errorMessage?: string): void {
    this.phase = phase;
    this.errorMessage = errorMessage;
    this.callbacks.onStatusChange?.(phase, errorMessage);
  }

  /** Last error message (for the UI). */
  get lastError(): string | undefined {
    return this.errorMessage;
  }
}

// Re-exported for the UI's silence hint.
export { SILENCE_RMS };
