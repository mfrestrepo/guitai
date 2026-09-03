/**
 * NoteEventDetector — turns a stream of per-frame observations into discrete
 * "a note started" events, ignoring the continuous ringing in between.
 *
 * The arpeggio validator needs *events*, not a pitch meter: it must notice
 * when the learner plucks a string, report the pitch once, and then wait for
 * the string to be silenced (or a clearly different new note) before the next
 * pluck can be heard. A raw YIN stream would otherwise re-report the same
 * ringing string every frame.
 *
 * Pure state machine (no DOM, no mic) → fully unit tested in `events.test.ts`
 * with synthetic observation sequences.
 */

import { centsBetween } from '../theory/music';

export interface FrameObservation {
  /** RMS level of the frame (0…1). */
  readonly rms: number;
  /** Detected pitch in Hz, or null when the frame is unpitched/silent. */
  readonly frequency: number | null;
}

export interface NoteStartEvent {
  readonly kind: 'noteStart';
  readonly frequency: number;
}

export interface NoteEventDetectorOptions {
  /** Frames with rms ≥ this value count as "sound present". */
  soundRms?: number;
  /** Consecutive consistent voiced frames needed to confirm a note. */
  confirmFrames?: number;
  /** Max cents between consecutive frames to consider them the same note. */
  confirmCents?: number;
  /** Consecutive silent frames needed before a new onset can be heard. */
  releaseSilenceFrames?: number;
  /**
   * While a note still rings, a new pitch at least this many cents away
   * (sustained for `retriggerFrames` frames) is treated as the *next* pluck.
   */
  retriggerCents?: number;
  /** Consecutive differing frames needed to accept a new note over a ringing one. */
  retriggerFrames?: number;
}

type Phase = 'quiet' | 'arming' | 'ringing';

export class NoteEventDetector {
  private readonly opts: Required<NoteEventDetectorOptions>;
  private phase: Phase = 'quiet';
  /** Recent voiced frames while arming (to confirm and to median). */
  private armBuffer: number[] = [];
  /** Consecutive silent frames while ringing. */
  private quietStreak = 0;
  /** Recent different-pitch frames while ringing. */
  private altBuffer: number[] = [];
  /** Pitch of the last emitted note. */
  private lastEmitted: number | null = null;

  constructor(options: NoteEventDetectorOptions = {}) {
    this.opts = {
      soundRms: 0.004,
      confirmFrames: 3,
      confirmCents: 45,
      releaseSilenceFrames: 4,
      retriggerCents: 80,
      retriggerFrames: 3,
      ...options,
    };
  }

  reset(): void {
    this.phase = 'quiet';
    this.armBuffer = [];
    this.quietStreak = 0;
    this.altBuffer = [];
    this.lastEmitted = null;
  }

  /** Feed one analyzed frame; returns an event at most every few frames. */
  push(observation: FrameObservation): NoteStartEvent | null {
    const voiced = observation.frequency !== null && Number.isFinite(observation.frequency);
    const sound = observation.rms >= this.opts.soundRms && voiced;

    if (!sound) {
      this.armBuffer = [];
      if (this.phase === 'ringing') {
        this.quietStreak += 1;
        if (this.quietStreak >= this.opts.releaseSilenceFrames) {
          this.phase = 'quiet';
          this.quietStreak = 0;
        }
      }
      return null;
    }

    const freq = observation.frequency as number;

    if (this.phase === 'ringing') {
      this.quietStreak = 0;
      const differs =
        this.lastEmitted !== null &&
        Math.abs(centsBetween(freq, this.lastEmitted)) >= this.opts.retriggerCents;
      if (!differs) {
        this.altBuffer = [];
        return null;
      }
      // A new, clearly different pitch while the previous note still rings:
      // count it, and only accept once it has been consistent for a few frames.
      this.altBuffer.push(freq);
      if (this.altBuffer.length > this.opts.retriggerFrames) this.altBuffer.shift();
      if (this.altBuffer.length < this.opts.retriggerFrames) return null;
      const consistent = this.altBuffer.every(
        (f) => Math.abs(centsBetween(f, this.altBuffer[0])) <= this.opts.confirmCents,
      );
      if (!consistent) {
        this.altBuffer.shift();
        return null;
      }
      const median = medianOf(this.altBuffer);
      this.altBuffer = [];
      this.lastEmitted = median;
      return { kind: 'noteStart', frequency: median };
    }

    // quiet / arming: confirm a fresh onset.
    if (this.phase === 'quiet') {
      this.phase = 'arming';
      this.armBuffer = [freq];
      return null;
    }

    // arming: the note must stay consistent for `confirmFrames` frames.
    const last = this.armBuffer[this.armBuffer.length - 1];
    if (Math.abs(centsBetween(freq, last)) > this.opts.confirmCents) {
      this.armBuffer = [freq]; // transient glitch — restart with this frame
      return null;
    }
    this.armBuffer.push(freq);
    if (this.armBuffer.length < this.opts.confirmFrames) return null;

    const median = medianOf(this.armBuffer);
    this.armBuffer = [];
    this.phase = 'ringing';
    this.lastEmitted = median;
    return { kind: 'noteStart', frequency: median };
  }
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
