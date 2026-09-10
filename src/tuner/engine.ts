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
import { TuningSession } from './tuningSession';

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
  /** String numbers already confirmed as tuned in this session (✓ marks). */
  readonly tunedStrings: readonly number[];
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
  /** A string has just been confirmed in tune → play the confirmation cue. */
  onStringTuned?(stringNumber: number): void;
  /** Every string of the tuning is now tuned → play the fanfare. */
  onAllTuned?(): void;
}

export interface TunerEngineOptions extends TunerEngineEvents {
  /** Initial tuning id, see `theory/tunings.ts`. */
  tuningId?: string;
}

export class TunerEngine {
  private readonly events: TunerEngineEvents;
  private readonly smoother = new PitchSmoother();
  /** Tracks per-string confirmation (✓ marks + chime triggers). */
  private session: TuningSession;

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
    this.session = new TuningSession(tuning.strings.length);
  }

  get statusSnapshot(): EngineStatus {
    return this.status;
  }

  get tuningId(): string {
    return this.tuning.id;
  }

  /** Audio context of the running mic (used to play confirmation cues). */
  get audioContext(): AudioContext | null {
    return this.input?.context ?? null;
  }

  /** Switch the tuning preset (data-driven, see `theory/tunings.ts`). */
  setTuning(id: string): void {
    const tuning = tuningById(id);
    if (!tuning) {
      throw new Error(`Unknown tuning id "${id}".`);
    }
    this.tuning = tuning;
    // A different tuning may have a different number of strings.
    this.session = new TuningSession(tuning.strings.length);
    this.session.reset();
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
      this.session.reset();
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
    this.session.reset();
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
      // Silence: keep the ✓ marks, drop any pending confirmation streak.
      this.session.update(null, Date.now());
      this.events.onReading?.({ status: 'listening', signalLevel });
      return;
    }

    const result = evaluateTuning(smoothedHz, this.tuning, this.preferredStringNumber);

    // Confirmation tracking (✓ marks + chime): a string counts as tuned only
    // after staying in tune for a short hold (see tuningSession.ts).
    const sessionEvents = this.session.update(
      { stringNumber: result.string.number, cents: result.cents, verdict: result.verdict },
      Date.now(),
    );
    for (const event of sessionEvents) {
      if (event.kind === 'string-tuned') this.events.onStringTuned?.(event.stringNumber);
      else if (event.kind === 'all-tuned') this.events.onAllTuned?.();
    }

    const reading: TuningReading = {
      status: 'tuning',
      signalLevel,
      tunedStrings: this.session.tunedStrings(),
      ...result,
    };
    this.events.onReading?.(reading);
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.events.onStatusChange?.(status);
  }
}

// Re-exported for the UI layer convenience (string defs are plain data).
export type { Tuning, TuningStringDef };
