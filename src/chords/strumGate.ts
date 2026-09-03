/**
 * StrumGate — turns the fast per-frame strum analysis into calm, readable
 * verdicts.
 *
 * `analyzeStrum` runs ~10×/s, and raw frames flicker between "correct" and
 * "issues" (and back to silence while the chord decays). Showing that directly
 * is unreadable. This gate instead:
 *
 *   1. keeps a rolling window of the last `windowFrames` results;
 *   2. only *publishes* a verdict once enough sounding frames accumulated
 *      (≈1–2 s of a real strum), decided by majority (correct vs issues);
 *   3. holds each published verdict for at least `holdMs` — the screen never
 *      flips faster than a human can read;
 *   4. only returns to "listening" after the window is (almost) all silence
 *      and the hold expired — i.e., a genuinely new strum is coming.
 *
 * Pure and unit tested (see strumGate.test.ts) with fake time.
 */

import type { StrumIssue } from './strumCheck';

export type StrumFrameVerdict = 'quiet' | 'correct' | 'issues';

export interface StrumFrame {
  readonly verdict: StrumFrameVerdict;
  /** Issues of the frame (only meaningful for 'issues'). */
  readonly issues?: readonly StrumIssue[];
  /** Frame time in ms (monotonic is fine for tests). */
  readonly nowMs: number;
}

export type StrumGateEvent =
  | { readonly kind: 'listening' }
  | { readonly kind: 'verdict'; readonly verdict: 'correct' | 'issues'; readonly issues: readonly StrumIssue[] };

export interface StrumGateOptions {
  /** Rolling window length in frames (1 frame ≈ 100 ms of mic analysis). */
  windowFrames?: number;
  /** Min sounding frames inside the window before a verdict can be published. */
  minSounding?: number;
  /** Min time a published verdict stays before it may change. */
  holdMs?: number;
  /** Quiet frames needed (of the window) to drop back to "listening". */
  quietToRelisten?: number;
}

export interface StrumGateState {
  /** 'verdict' while a verdict is on screen, else 'listening'. */
  readonly stage: 'listening' | 'verdict';
  readonly verdict: 'correct' | 'issues' | null;
  readonly issues: readonly StrumIssue[];
  /** When the current verdict was published (ms), for stability checks. */
  readonly publishedAtMs: number | null;
}

export class StrumGate {
  private readonly windowFrames: number;
  private readonly minSounding: number;
  private readonly holdMs: number;
  private readonly quietToRelisten: number;

  private window: StrumFrame[] = [];
  private published: { verdict: 'correct' | 'issues'; issues: StrumIssue[]; at: number } | null =
    null;

  constructor(options: StrumGateOptions = {}) {
    this.windowFrames = options.windowFrames ?? 22;
    this.minSounding = options.minSounding ?? 13;
    this.holdMs = options.holdMs ?? 2600;
    this.quietToRelisten = options.quietToRelisten ?? 16;
  }

  state(): StrumGateState {
    if (this.published) {
      return {
        stage: 'verdict',
        verdict: this.published.verdict,
        issues: this.published.issues,
        publishedAtMs: this.published.at,
      };
    }
    return { stage: 'listening', verdict: null, issues: [], publishedAtMs: null };
  }

  /** Reset (mic stop / new chord). */
  reset(): void {
    this.window = [];
    this.published = null;
  }

  /** Feed one analyzed frame; may return a new published event. */
  push(frame: StrumFrame): StrumGateEvent | null {
    this.window.push(frame);
    if (this.window.length > this.windowFrames) this.window.shift();

    const candidate = this.candidate(frame.nowMs);
    const published = this.published;

    // Nothing published yet → publish the first solid candidate.
    if (!published) {
      if (!candidate) return null;
      return this.publish(candidate, frame.nowMs);
    }

    // A verdict is on screen: only act after the hold window.
    if (frame.nowMs - published.at < this.holdMs) return null;

    if (candidate && candidate.verdict !== published.verdict) {
      return this.publish(candidate, frame.nowMs);
    }

    // Verdict unchanged but hold expired: no need to re-publish the same one.

    // Drop back to listening when the strum is over (mostly silence).
    const quietCount = this.window.filter((f) => f.verdict === 'quiet').length;
    if (quietCount >= this.quietToRelisten && !candidate) {
      this.published = null;
      return { kind: 'listening' };
    }

    return null;
  }

  private publish(
    candidate: { verdict: 'correct' | 'issues'; issues: StrumIssue[] },
    nowMs: number,
  ): StrumGateEvent {
    this.published = { ...candidate, at: nowMs };
    return { kind: 'verdict', verdict: candidate.verdict, issues: candidate.issues };
  }

  /** Majority verdict over the window, or null when not enough sound yet. */
  private candidate(nowMs: number): { verdict: 'correct' | 'issues'; issues: StrumIssue[] } | null {
    const sounding = this.window.filter((f) => f.verdict !== 'quiet');
    if (sounding.length < this.minSounding) return null;

    let correct = 0;
    let issues: StrumIssue[] = [];
    let issuesFrames = 0;
    for (const frame of sounding) {
      if (frame.verdict === 'correct') {
        correct += 1;
      } else {
        issuesFrames += 1;
        if (frame.issues && frame.issues.length > issues.length) issues = [...frame.issues];
      }
    }
    const ok = correct >= issuesFrames;
    void nowMs;
    return { verdict: ok ? 'correct' : 'issues', issues: ok ? [] : issues };
  }
}
