/**
 * TunerEngine — the real-time pipeline of the tuner.
 *
 * Data flow (one arrow = one module boundary; every stage is replaceable):
 *
 *   microphone ──AudioInput──▶ frame samples
 *        └─▶ detectPitch (YIN) ─▶ PitchSmoother ─▶ evaluateTuning ─▶ Reading
 *
 * The engine owns the cadence: every `TICK_MS` (~33 ms, ≈30 Hz) it pulls the
 * newest frame from the analyser, runs the detector, feeds the smoother and
 * emits a {@link Reading} to the UI. All thresholds that decide "is this
 * frame a note at all" live here (RMS gate + YIN periodicity), so the pure
 * detector/smoother/evaluator stay testable without a microphone.
 */

import { openMicrophoneInput, describeMicrophoneError, type AudioInputHandle } from '../audio/input';
import { analyzeFrame } from '../audio/frameAnalysis';
import { PitchSmoother } from '../pitch/smoother';
import { type Tuning, type TuningStringDef, tuningById } from '../theory/tunings';
import { evaluateTuning, type TuningResult } from './evaluator';

/** Engine cadence: pull + analyze every ~33 ms (~30 readings/second). */
export const TICK_MS = 33;

/** Re-exported so existing references keep working after the shared-module move. */
export { SILENCE_RMS } from '../audio/frameAnalysis';

export type EngineStatus =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running' }
  | { phase: 'error'; message: string };

export interface TuningReading extends TuningResult {
  readonly status: 'tuning';
  /** Signal level in [0, 1] for the level meter (logarithmic scale). */
  readonly signalLevel: number;
}

export type Reading =
  | { readonly status: 'idle' }
  | { readonly status: 'listening'; readonly signalLevel: number }
  | TuningReading;

export interface TunerEngineEvents {
  /** Emitted on every analyzed frame (≈30 Hz) with the current reading. */
  onReading?(reading: Reading): void;
  /** Emitted when the engine transitions between idle/starting/running/error. */
  onStatusChange?(status: EngineStatus): void;
}

export interface TunerEngineOptions extends TunerEngineEvents {
  /** Initial tuning id, see `theory/tunings.ts`. */
  tuningId?: string;
}

export class TunerEngine {
  private readonly events: TunerEngineEvents;
  private readonly smoother = new PitchSmoother();

  private input: AudioInputHandle | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;

  private status: EngineStatus = { phase: 'idle' };
  private tuning: Tuning;
  private preferredStringNumber: number | undefined;

  constructor(options: TunerEngineOptions = {}) {
    this.events = options;
    const tuning = tuningById(options.tuningId ?? 'standard');
    if (!tuning) {
      throw new Error(`Unknown tuning id "${options.tuningId}".`);
    }
    this.tuning = tuning;
  }

  get statusSnapshot(): EngineStatus {
    return this.status;
  }

  get tuningId(): string {
    return this.tuning.id;
  }

  /** Switch the tuning preset (data-driven, see `theory/tunings.ts`). */
  setTuning(id: string): void {
    const tuning = tuningById(id);
    if (!tuning) {
      throw new Error(`Unknown tuning id "${id}".`);
    }
    this.tuning = tuning;
  }

  /** Lock the target string (1 = high E … 6 = low E) or `undefined` for auto. */
  setPreferredString(number: number | undefined): void {
    this.preferredStringNumber = number;
  }

  /** Ask for the microphone and start the analysis loop. */
  async start(): Promise<void> {
    if (this.status.phase === 'running' || this.status.phase === 'starting') return;
    this.setStatus({ phase: 'starting' });
    try {
      this.input = await openMicrophoneInput();
      this.frame = new Float32Array(this.input.analyser.fftSize);
      this.smoother.reset();
      this.setStatus({ phase: 'running' });
      this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    } catch (error) {
      this.input = null;
      this.setStatus({ phase: 'error', message: describeMicrophoneError(error) });
    }
  }

  /** Stop the loop and release the microphone. */
  stop(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.input?.stop();
    this.input = null;
    this.smoother.reset();
    this.setStatus({ phase: 'idle' });
    this.events.onReading?.({ status: 'idle' });
  }

  /** Analyze one frame and emit a reading. Runs on the tick timer. */
  private tick(): void {
    const input = this.input;
    const frame = this.frame;
    if (!input || !frame) return;

    input.readFrame(frame);

    // Shared analysis: RMS gate + YIN. Silent frames yield pitchFrequency null,
    // which drives the smoother into its silence path (see pitch/smoother.ts).
    const { signalLevel, pitchFrequency } = analyzeFrame(frame, input.sampleRate);
    const smoothedHz = this.smoother.push(pitchFrequency);

    if (smoothedHz === null) {
      this.events.onReading?.({ status: 'listening', signalLevel });
      return;
    }

    const result = evaluateTuning(smoothedHz, this.tuning, this.preferredStringNumber);
    const reading: TuningReading = { status: 'tuning', signalLevel, ...result };
    this.events.onReading?.(reading);
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.events.onStatusChange?.(status);
  }
}

// Re-exported for the UI layer convenience (string defs are plain data).
export type { Tuning, TuningStringDef };
