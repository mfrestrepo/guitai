/**
 * ChordMicSession — microphone plumbing for chord practice.
 *
 * Bridges three layers:
 *
 *   microphone ──AudioInput──▶ frames
 *        └─▶ analyzeFrame (shared with the tuner) ─▶ NoteEventDetector
 *              └─▶ ChordPractice (the pure validation state machine)
 *
 * It owns the mic lifecycle and the ~30 Hz polling loop only; all decisions
 * live in the pure modules so they can be tested with synthetic audio.
 */

import { openMicrophoneInput, describeMicrophoneError, type AudioInputHandle } from '../audio/input';
import { analyzeFrame, SOUND_RMS } from '../audio/frameAnalysis';
import { NoteEventDetector } from './events';
import { chordById, type ChordDef } from './catalog';
import { ChordPractice, type PracticeSnapshot } from './practice';

export type ChordMicPhase = 'idle' | 'starting' | 'running' | 'error';

export interface ChordSessionSnapshot {
  readonly mic: ChordMicPhase;
  readonly errorMessage?: string;
  readonly chordId: string | null;
  readonly practice: PracticeSnapshot | null;
  /** True when a voiced pitch was heard recently (enables "ya la toqué"). */
  readonly canForceCheck: boolean;
}

export interface ChordSessionCallbacks {
  onChange(snapshot: ChordSessionSnapshot): void;
}

export class ChordMicSession {
  private readonly callbacks: ChordSessionCallbacks;
  private readonly detector = new NoteEventDetector({ soundRms: SOUND_RMS });

  private input: AudioInputHandle | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;

  private mic: ChordMicPhase = 'idle';
  private errorMessage: string | undefined;
  private chord: ChordDef | null = null;
  private practice: ChordPractice | null = null;

  private lastVoicedPitch: number | null = null;
  private lastVoicedAtMs = 0;

  constructor(callbacks: ChordSessionCallbacks) {
    this.callbacks = callbacks;
    this.emit();
  }

  /** Start a practice session for `chordId` (requests the microphone). */
  async start(chordId: string): Promise<void> {
    if (this.mic === 'running' || this.mic === 'starting') return;
    this.mic = 'starting';
    this.errorMessage = undefined;
    this.emit();
    try {
      this.input = await openMicrophoneInput();
      this.frame = new Float32Array(this.input.analyser.fftSize);
      this.configureChord(chordId);
      this.mic = 'running';
      this.emit();
      this.timer = setInterval(() => this.tick(), 33);
    } catch (error) {
      this.input = null;
      this.teardownChord();
      this.mic = 'error';
      this.errorMessage = describeMicrophoneError(error);
      this.emit();
    }
  }

  /**
   * Attach a practice session WITHOUT opening the microphone (test hook):
   * after this, `feedFrame` can be driven with synthetic frames.
   */
  beginSession(chordId: string): boolean {
    if (this.mic === 'running' || this.mic === 'starting') return false;
    if (!chordById(chordId)) return false;
    this.configureChord(chordId);
    return true;
  }

  /**
   * Move on to another chord without reopening the microphone (drill flow).
   * Only valid while running; otherwise use {@link beginSession} or {@link start}.
   */
  changeChord(chordId: string): boolean {
    if (this.mic !== 'running') return this.beginSession(chordId);
    try {
      this.configureChord(chordId);
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  private configureChord(chordId: string): void {
    const chord = chordById(chordId);
    if (!chord) throw new Error(`Unknown chord id "${chordId}"`);
    this.detector.reset();
    this.lastVoicedPitch = null;
    this.lastVoicedAtMs = 0;
    this.chord = chord;
    this.practice = new ChordPractice(chord, () => this.emit());
  }

  private teardownChord(): void {
    this.chord = null;
    this.practice = null;
    this.lastVoicedPitch = null;
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.input?.stop();
    this.input = null;
    this.teardownChord();
    this.mic = 'idle';
    this.errorMessage = undefined;
    this.emit();
  }

  /** Manual fallback: "ya la toqué" — check the most recent voiced pitch. */
  forceCheckNow(): boolean {
    if (this.practice === null) return false;
    if (this.lastVoicedPitch === null) return false;
    if (Date.now() - this.lastVoicedAtMs > 1500) return false;
    this.practice.handleNoteStart(this.lastVoicedPitch);
    return true;
  }

  skipCurrent(): void {
    this.practice?.skipCurrent();
  }

  snapshot(): ChordSessionSnapshot {
    return {
      mic: this.mic,
      errorMessage: this.errorMessage,
      chordId: this.chord?.id ?? null,
      practice: this.practice?.snapshot() ?? null,
      canForceCheck: this.lastVoicedPitch !== null && Date.now() - this.lastVoicedAtMs <= 1500,
    };
  }

  /** Analyze one raw frame (also used by tests with synthetic audio). */
  feedFrame(frame: Float32Array, sampleRate: number): void {
    if (this.practice === null) return;
    const analysis = analyzeFrame(frame, sampleRate);
    if (analysis.pitchFrequency !== null) {
      this.lastVoicedPitch = analysis.pitchFrequency;
      this.lastVoicedAtMs = Date.now();
    }
    const event = this.detector.push({
      rms: analysis.rms,
      frequency: analysis.pitchFrequency,
    });
    if (event) {
      this.practice.handleNoteStart(event.frequency);
    }
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
