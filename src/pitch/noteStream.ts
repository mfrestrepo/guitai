/**
 * NoteStreamDetector — turns a stream of analysed frames into *timed* note
 * events (start/end with millisecond timestamps).
 *
 * The chord module already had a note-onset detector (`chords/events.ts`), but
 * the technique module additionally needs **when** each note happened and how
 * long it lasted, in order to compare a scale or a chromatic exercise against
 * the metronome grid.
 *
 * It is monophonic by design (one note at a time), exactly like the exercises
 * it serves: scales, chromatic 1-2-3-4, repeated-note drills.
 *
 * Rules:
 *  - a note starts after `confirmFrames` consistent voiced frames (rejects pick
 *    noise and single-frame blips);
 *  - a clearly different pitch (> `differentNoteCents`) sustained for
 *    `differentNoteFrames` starts the next note immediately (guitar strings
 *    ring over each other, so silence is not required between notes);
 *  - after `silenceFrames` silent frames the current note ends.
 *
 * Pure (no mic, no DOM) and unit tested with fake frames.
 */

export interface NoteFrame {
  /** Frame RMS (0…1). */
  readonly rms: number;
  /** Detected fundamental in Hz, or null when unpitched/silent. */
  readonly frequency: number | null;
  /** Frame timestamp in ms (monotonic). */
  readonly nowMs: number;
}

export interface NoteStartEvent {
  readonly kind: 'start';
  readonly frequency: number;
  readonly startMs: number;
  /** Peak RMS observed during the note (used for attack regularity). */
  readonly level: number;
}

export interface NoteEndEvent {
  readonly kind: 'end';
  readonly frequency: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly level: number;
}

export type NoteStreamEvent = NoteStartEvent | NoteEndEvent;

export interface NoteStreamOptions {
  /** Frames with rms ≥ this count as sound. */
  soundRms?: number;
  /** Consistent voiced frames needed to confirm a note. */
  confirmFrames?: number;
  /** Max cents between frames to consider them the same note. */
  confirmCents?: number;
  /** A new pitch at least this far away is treated as the next note. */
  differentNoteCents?: number;
  /** Consecutive different-pitch frames needed to accept the next note. */
  differentNoteFrames?: number;
  /** Silent frames needed to end the current note. */
  silenceFrames?: number;
}

interface BufferedFrame {
  readonly frequency: number;
  readonly nowMs: number;
  readonly rms: number;
}

type Phase = 'quiet' | 'arming' | 'sounding';

const DEFAULTS: Required<NoteStreamOptions> = {
  soundRms: 0.004,
  confirmFrames: 2,
  confirmCents: 60,
  differentNoteCents: 60,
  differentNoteFrames: 2,
  silenceFrames: 3,
};

export class NoteStreamDetector {
  private readonly opts: Required<NoteStreamOptions>;
  private phase: Phase = 'quiet';
  private buffer: BufferedFrame[] = [];
  /** Currently sounding note (once confirmed). */
  private current: { frequency: number; startMs: number; level: number } | null = null;
  private silentStreak = 0;
  private altBuffer: BufferedFrame[] = [];

  constructor(options: NoteStreamOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.phase = 'quiet';
    this.buffer = [];
    this.current = null;
    this.silentStreak = 0;
    this.altBuffer = [];
  }

  /** Feed one analysed frame; returns the events it produced (0–2). */
  push(frame: NoteFrame): NoteStreamEvent[] {
    const voiced = frame.frequency !== null && Number.isFinite(frame.frequency);
    const sound = voiced && frame.rms >= this.opts.soundRms;

    if (!sound) return this.onSilence(frame);

    const frequency = frame.frequency as number;
    const buffered: BufferedFrame = { frequency, nowMs: frame.nowMs, rms: frame.rms };

    if (this.phase === 'quiet') {
      this.phase = 'arming';
      this.buffer = [buffered];
      return [];
    }

    if (this.phase === 'arming') {
      const last = this.buffer[this.buffer.length - 1];
      if (Math.abs(centsBetween(frequency, last.frequency)) > this.opts.confirmCents) {
        this.buffer = [buffered]; // transient — restart the confirmation
        return [];
      }
      this.buffer.push(buffered);
      if (this.buffer.length < this.opts.confirmFrames) return [];

      const first = this.buffer[0];
      const median = medianOf(this.buffer.map((b) => b.frequency));
      this.current = {
        frequency: median,
        startMs: first.nowMs,
        level: Math.max(...this.buffer.map((b) => b.rms)),
      };
      this.buffer = [];
      this.phase = 'sounding';
      return [
        { kind: 'start', frequency: median, startMs: first.nowMs, level: this.current.level },
      ];
    }

    // phase === 'sounding'
    this.silentStreak = 0;
    if (this.current === null) return [];
    this.current.level = Math.max(this.current.level, frame.rms);

    if (Math.abs(centsBetween(frequency, this.current.frequency)) < this.opts.differentNoteCents) {
      this.altBuffer = [];
      return [];
    }

    // A clearly different pitch may be the next note of the exercise.
    this.altBuffer.push(buffered);
    if (this.altBuffer.length < this.opts.differentNoteFrames) return [];

    const events: NoteStreamEvent[] = [];
    const first = this.altBuffer[0];
    events.push({
      kind: 'end',
      frequency: this.current.frequency,
      endMs: first.nowMs,
      durationMs: Math.max(0, first.nowMs - this.current.startMs),
      level: this.current.level,
    });
    const median = medianOf(this.altBuffer.map((b) => b.frequency));
    this.current = {
      frequency: median,
      startMs: first.nowMs,
      level: Math.max(...this.altBuffer.map((b) => b.rms)),
    };
    this.altBuffer = [];
    events.push({
      kind: 'start',
      frequency: median,
      startMs: first.nowMs,
      level: this.current.level,
    });
    return events;
  }

  /** Close the current note (e.g. when the pass ends or the mic stops). */
  flush(nowMs: number): NoteStreamEvent[] {
    if (!this.current) return [];
    const note = this.current;
    this.current = null;
    this.phase = 'quiet';
    this.buffer = [];
    this.altBuffer = [];
    return [
      {
        kind: 'end',
        frequency: note.frequency,
        endMs: nowMs,
        durationMs: Math.max(0, nowMs - note.startMs),
        level: note.level,
      },
    ];
  }

  private onSilence(frame: NoteFrame): NoteStreamEvent[] {
    this.buffer = [];
    this.altBuffer = [];
    if (this.phase !== 'sounding' || this.current === null) {
      this.phase = 'quiet';
      return [];
    }
    this.silentStreak += 1;
    if (this.silentStreak < this.opts.silenceFrames) return [];
    const note = this.current;
    this.current = null;
    this.phase = 'quiet';
    this.silentStreak = 0;
    return [
      {
        kind: 'end',
        frequency: note.frequency,
        endMs: frame.nowMs,
        durationMs: Math.max(0, frame.nowMs - note.startMs),
        level: note.level,
      },
    ];
  }
}

function centsBetween(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
