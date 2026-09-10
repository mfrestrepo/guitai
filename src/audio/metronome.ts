/**
 * Metronome — optional practice metronome for the chord-change drills.
 *
 * Uses the standard Web Audio "look-ahead" scheduler: a timer wakes up often
 * (25 ms) and schedules the clicks that fall inside the next ~120 ms window on
 * the audio clock. That keeps the tempo rock-steady even if the UI is busy,
 * which matters when the main thread is also running pitch analysis.
 *
 * The click is synthesized (no assets): a short sine burst, higher and louder
 * on the first beat of the bar so the learner can feel the bar.
 *
 * The scheduling maths and the audio-context dependency are both injectable,
 * so the whole thing is unit tested with a fake context (metronome.test.ts).
 */

export const MIN_BPM = 40;
export const MAX_BPM = 140;

/** Minimal slice of AudioContext the metronome needs (fakeable in tests). */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  resume?(): Promise<void>;
  createOscillator(): {
    type: string;
    frequency: { setValueAtTime(value: number, time: number): void };
    connect(target: unknown): unknown;
    start(time: number): void;
    stop(time: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(value: number, time: number): void;
      exponentialRampToValueAtTime(value: number, time: number): void;
    };
    connect(target: unknown): unknown;
  };
}

export interface BeatEvent {
  /** Beat index inside the bar (0 = first beat). */
  readonly beat: number;
  /** True on the first beat of the bar. */
  readonly accent: boolean;
  /** Audio-clock time of the click. */
  readonly time: number;
}

export interface MetronomeOptions {
  readonly context: AudioContextLike;
  /** Called (roughly) when each click should be heard — drives the visuals. */
  onBeat?(event: BeatEvent): void;
  bpm?: number;
  beatsPerBar?: number;
  /** Click volume 0…1 (default 0.22). */
  volume?: number;
  /** How far ahead clicks are scheduled, in seconds (default 0.12). */
  lookaheadSeconds?: number;
  /** Scheduler wake-up interval in ms (default 25). */
  tickMs?: number;
}

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/** Seconds per beat for a tempo. */
export function secondsPerBeat(bpm: number): number {
  return 60 / clampBpm(bpm);
}

export class Metronome {
  private readonly context: AudioContextLike;
  private readonly onBeat: ((event: BeatEvent) => void) | undefined;
  private readonly volume: number;
  private readonly lookaheadSeconds: number;
  private readonly tickMs: number;

  private bpmValue: number;
  private beatsPerBarValue: number;
  private beatIndexInBar = 0;
  private nextBeatTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(options: MetronomeOptions) {
    this.context = options.context;
    this.onBeat = options.onBeat;
    this.volume = options.volume ?? 0.22;
    this.lookaheadSeconds = options.lookaheadSeconds ?? 0.12;
    this.tickMs = options.tickMs ?? 25;
    this.bpmValue = clampBpm(options.bpm ?? 80);
    this.beatsPerBarValue = options.beatsPerBar ?? 4;
  }

  get bpm(): number {
    return this.bpmValue;
  }

  get beatsPerBar(): number {
    return this.beatsPerBarValue;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setBpm(bpm: number): void {
    this.bpmValue = clampBpm(bpm);
  }

  setBeatsPerBar(beats: number): void {
    this.beatsPerBarValue = Math.max(1, Math.min(8, Math.round(beats)));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.beatIndexInBar = 0;
    // Small offset so the first click is not rushed.
    this.nextBeatTime = this.context.currentTime + 0.06;
    void this.context.resume?.();
    this.schedule(this.context.currentTime + this.lookaheadSeconds);
    this.timer = setInterval(() => {
      this.schedule(this.context.currentTime + this.lookaheadSeconds);
    }, this.tickMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Schedule every click that falls before `untilTime` (audio clock).
   * Exposed so tests can drive the scheduler without real timers.
   */
  schedule(untilTime: number): BeatEvent[] {
    const events: BeatEvent[] = [];
    while (this.running && this.nextBeatTime < untilTime) {
      const accent = this.beatIndexInBar === 0;
      this.click(this.nextBeatTime, accent);
      const event: BeatEvent = { beat: this.beatIndexInBar, accent, time: this.nextBeatTime };
      events.push(event);
      this.onBeat?.(event);

      this.beatIndexInBar = (this.beatIndexInBar + 1) % this.beatsPerBarValue;
      this.nextBeatTime += secondsPerBeat(this.bpmValue);
    }
    return events;
  }

  private click(time: number, accent: boolean): void {
    try {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(accent ? 1500 : 1000, time);
      const peak = this.volume * (accent ? 1 : 0.6);
      gain.gain.setValueAtTime(Math.max(0.0001, peak), time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start(time);
      osc.stop(time + 0.06);
    } catch {
      // Audio refused/unavailable: the metronome is a helper, never fatal.
    }
  }
}
