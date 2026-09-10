/**
 * TuningSession — pure state machine that decides when a string counts as
 * *tuned*.
 *
 * Why it exists: the raw tuner reading flickers around the ±5¢ band, so
 * celebrating on the very first "in tune" frame would ring the confirmation
 * chime constantly. This session instead requires the string to stay in tune
 * for a short hold before confirming it, then marks it with a ✓, and only
 * clears that mark if the string drifts clearly out of tune for another hold.
 *
 * It is mic-free, audio-free and DOM-free: the engine feeds it readings and
 * plays a sound when it reports `string-tuned`. Unit tested with fake time.
 */

import type { Verdict } from './evaluator';

export interface TuningSessionOptions {
  /** |cents| within which the string is considered in tune (default 5). */
  inTuneMaxCents?: number;
  /** How long the string must stay in tune before being confirmed (ms). */
  holdMs?: number;
  /** |cents| beyond which a confirmed string is considered lost (default 30). */
  outOfTuneCents?: number;
  /** How long it must be out of tune before losing the ✓ (ms). */
  outOfTuneHoldMs?: number;
}

export interface TuningReadingForSession {
  readonly stringNumber: number;
  readonly cents: number;
  readonly verdict: Verdict;
}

export type TuningSessionEvent =
  | { readonly kind: 'string-tuned'; readonly stringNumber: number }
  | { readonly kind: 'string-lost'; readonly stringNumber: number }
  | { readonly kind: 'all-tuned' };

interface StringState {
  /** When the current in-tune streak started (ms) or null. */
  inTuneSince: number | null;
  /** When the current out-of-tune streak started (ms) or null. */
  outSince: number | null;
  tuned: boolean;
}

const DEFAULTS: Required<TuningSessionOptions> = {
  inTuneMaxCents: 5,
  holdMs: 450,
  outOfTuneCents: 30,
  outOfTuneHoldMs: 600,
};

export class TuningSession {
  private readonly opts: Required<TuningSessionOptions>;
  private readonly states = new Map<number, StringState>();
  /** Total number of strings of the instrument being tuned (6 for guitar). */
  private readonly stringCount: number;

  constructor(stringCount: number, options: TuningSessionOptions = {}) {
    this.stringCount = stringCount;
    this.opts = { ...DEFAULTS, ...options };
  }

  /**
   * Feed one reading (or null when nothing is being played / silence).
   * Returns the events that happened with this reading.
   */
  update(reading: TuningReadingForSession | null, nowMs: number): TuningSessionEvent[] {
    const events: TuningSessionEvent[] = [];
    if (reading === null) {
      // Silence: keep the ✓ marks, but stop any pending streak.
      for (const state of this.states.values()) {
        state.inTuneSince = null;
        state.outSince = null;
      }
      return events;
    }

    const state = this.stateFor(reading.stringNumber);
    const magnitude = Math.abs(reading.cents);

    if (magnitude <= this.opts.inTuneMaxCents) {
      state.outSince = null;
      if (!state.tuned) {
        if (state.inTuneSince === null) state.inTuneSince = nowMs;
        if (nowMs - state.inTuneSince >= this.opts.holdMs) {
          state.tuned = true;
          state.inTuneSince = null;
          events.push({ kind: 'string-tuned', stringNumber: reading.stringNumber });
          if (this.allTuned()) events.push({ kind: 'all-tuned' });
        }
      }
      return events;
    }

    // Out of the in-tune band.
    state.inTuneSince = null;
    if (!state.tuned) {
      state.outSince = null;
      return events;
    }
    if (magnitude < this.opts.outOfTuneCents) {
      // Slightly off but not "lost": keep the ✓, reset the drift timer.
      state.outSince = null;
      return events;
    }
    if (state.outSince === null) state.outSince = nowMs;
    if (nowMs - state.outSince >= this.opts.outOfTuneHoldMs) {
      state.tuned = false;
      state.outSince = null;
      events.push({ kind: 'string-lost', stringNumber: reading.stringNumber });
    }
    return events;
  }

  /** String numbers currently confirmed as tuned (ascending). */
  tunedStrings(): number[] {
    return [...this.states.entries()]
      .filter(([, s]) => s.tuned)
      .map(([n]) => n)
      .sort((a, b) => a - b);
  }

  isTuned(stringNumber: number): boolean {
    return this.states.get(stringNumber)?.tuned === true;
  }

  allTuned(): boolean {
    return this.tunedStrings().length >= this.stringCount;
  }

  reset(): void {
    this.states.clear();
  }

  private stateFor(stringNumber: number): StringState {
    let state = this.states.get(stringNumber);
    if (!state) {
      state = { inTuneSince: null, outSince: null, tuned: false };
      this.states.set(stringNumber, state);
    }
    return state;
  }
}
