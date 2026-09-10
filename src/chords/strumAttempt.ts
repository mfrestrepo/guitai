/**
 * StrumAttemptTracker — turns a stream of strum analyses into a fast, readable
 * verdict plus a live per-string diagnosis.
 *
 * Why this replaces the old rolling-window "gate" (which felt stuck): it models
 * a *strum attempt*. An attempt starts as soon as sound appears, its frames are
 * aggregated (maximum per-string presence, which survives the decay), and a
 * verdict is published as soon as enough evidence exists — typically ~0.25–0.4 s
 * after the strum. Silence ends the attempt; the verdict then stays on screen
 * for `holdMs` so it can be read; and a *new* strum immediately yields a *new*
 * verdict, so retrying feels responsive.
 *
 * It also computes `liveStates` per string — that is what the UI lights up on
 * the chord diagram ("this string sounds" / "this one is the problem").
 *
 * Pure + unit tested with fake time (strumAttempt.test.ts).
 */

import type { StringNumber } from './catalog';
import type { StrumIssue, StrumStringScore } from './strumCheck';

export type LiveStringState = 'ok' | 'wrong';

export interface StrumFrameObservation {
  readonly verdict: 'quiet' | 'correct' | 'issues';
  readonly issues: readonly StrumIssue[];
  readonly scores: readonly StrumStringScore[];
  /** Frame RMS (0…1): a clear jump means *a new strum* started. */
  readonly rms: number;
  readonly nowMs: number;
}

export interface StrumAttemptSnapshot {
  readonly stage: 'listening' | 'verdict';
  readonly verdict: 'correct' | 'issues' | null;
  readonly issues: readonly StrumIssue[];
  readonly publishedAtMs: number | null;
  /** Increments each time a new verdict is published (used to trigger the chime). */
  readonly verdictSeq: number;
  /** 0…1 evidence gathered for the current attempt (drives the progress bar). */
  readonly progress: number;
  /** Aggregated per-string ratios (0…1+), for the string lights. */
  readonly stringScores: Readonly<Record<number, number>>;
  /** Per-string diagnosis: 'ok' sounds right, 'wrong' is a culprit. */
  readonly liveStates: Readonly<Record<number, LiveStringState>>;
}

export interface StrumAttemptOptions {
  /** Sounding frames needed before a verdict can be published. */
  minFrames?: number;
  /** Hard cap for one attempt (a long ring is analysed, then frozen). */
  maxAttemptMs?: number;
  /** How long a published verdict stays before it may be cleared. */
  holdMs?: number;
  /** Silence duration that ends the current attempt. */
  silenceToEndMs?: number;
  /** RMS jump factor that counts as a new strum while sound continues. */
  onsetFactor?: number;
  /** Aggregated ratio below which a sounding string counts as missing. */
  missingRatio?: number;
  /** Aggregated ratio above which a muted string counts as ringing. */
  mutedRingRatio?: number;
}

interface StringMeta {
  /** Expected note label (letters) or null when the string is muted ("x"). */
  readonly expectedLabel: string | null;
}

interface Attempt {
  readonly startedAtMs: number;
  soundFrames: number;
  published: boolean;
  /** Frames in which the detector marked each string as present/ringing. */
  readonly presentVotes: Map<number, number>;
  /** Maximum presence ratio seen per string (for the lights' intensity). */
  readonly stringMax: Map<number, number>;
  /** Per-string metadata collected from the analysed frames. */
  readonly meta: Map<number, StringMeta>;
  /** Foreign-note votes keyed by note label. */
  readonly foreignVotes: Map<string, { count: number; issue: StrumIssue }>;
}

const DEFAULTS: Required<StrumAttemptOptions> = {
  minFrames: 4,
  maxAttemptMs: 2500,
  holdMs: 2600,
  silenceToEndMs: 500,
  onsetFactor: 1.7,
  missingRatio: 0.25,
  mutedRingRatio: 0.45,
};

export interface StrumVerdictEvent {
  readonly verdict: 'correct' | 'issues';
  readonly issues: readonly StrumIssue[];
}

export class StrumAttemptTracker {
  private readonly opts: Required<StrumAttemptOptions>;

  private attempt: Attempt | null = null;
  private published: { verdict: 'correct' | 'issues'; issues: StrumIssue[]; at: number } | null =
    null;
  private verdictSeq = 0;
  private silentSinceMs: number | null = null;
  /** Previous frame RMS, used to detect a new strum by its attack. */
  private previousRms = 0;

  /** Last aggregated diagnosis, kept on screen after the attempt ends. */
  private liveStates: Record<number, LiveStringState> = {};
  private stringScores: Record<number, number> = {};

  constructor(options: StrumAttemptOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.attempt = null;
    this.published = null;
    this.verdictSeq = 0;
    this.silentSinceMs = null;
    this.previousRms = 0;
    this.liveStates = {};
    this.stringScores = {};
  }

  /** Feed one analysed frame; returns the verdict published by *this* frame. */
  push(frame: StrumFrameObservation): StrumVerdictEvent | null {
    return frame.verdict === 'quiet' ? this.onSilence(frame.nowMs) : this.onSound(frame);
  }

  snapshot(): StrumAttemptSnapshot {
    const progress = this.attempt
      ? Math.min(1, this.attempt.soundFrames / this.opts.minFrames)
      : this.published
        ? 1
        : 0;
    return {
      stage: this.published ? 'verdict' : 'listening',
      verdict: this.published?.verdict ?? null,
      issues: this.published?.issues ?? [],
      publishedAtMs: this.published?.at ?? null,
      verdictSeq: this.verdictSeq,
      progress,
      stringScores: this.stringScores,
      liveStates: this.liveStates,
    };
  }

  /* ---------------- internals ---------------- */

  private onSilence(nowMs: number): StrumVerdictEvent | null {
    this.previousRms = 0;
    if (this.silentSinceMs === null) this.silentSinceMs = nowMs;
    const silentFor = nowMs - this.silentSinceMs;

    let publishedNow: StrumVerdictEvent | null = null;

    // End of the strum: freeze the diagnosis (publish it if we never did).
    if (this.attempt && silentFor >= this.opts.silenceToEndMs) {
      if (!this.attempt.published && this.attempt.soundFrames > 0) {
        publishedNow = this.publish(this.attempt, nowMs);
      }
      this.attempt = null;
    }

    // Clear the verdict once it has been on screen long enough.
    if (this.published && nowMs - this.published.at >= this.opts.holdMs) {
      this.published = null;
    }
    return publishedNow;
  }

  private onSound(frame: StrumFrameObservation): StrumVerdictEvent | null {
    this.silentSinceMs = null;

    // A new strum can start while the previous chord still rings: a clear jump
    // in level is a fresh attack, so finalize the old attempt and start over.
    let publishedNow: StrumVerdictEvent | null = null;
    const isNewOnset =
      this.attempt !== null &&
      this.attempt.soundFrames >= 2 &&
      this.previousRms > 0 &&
      frame.rms >= this.previousRms * this.opts.onsetFactor &&
      frame.nowMs - this.attempt.startedAtMs > 120;
    if (isNewOnset && this.attempt) {
      if (!this.attempt.published && this.attempt.soundFrames > 0) {
        publishedNow = this.publish(this.attempt, frame.nowMs);
      }
      this.attempt = null;
    }
    this.previousRms = frame.rms;

    if (!this.attempt) {
      // Fresh attempt: its verdict will replace the previous one when ready.
      this.attempt = {
        startedAtMs: frame.nowMs,
        soundFrames: 0,
        published: false,
        presentVotes: new Map(),
        stringMax: new Map(),
        meta: new Map(),
        foreignVotes: new Map(),
      };
    }

    const attempt = this.attempt;
    attempt.soundFrames += 1;

    for (const score of frame.scores) {
      attempt.meta.set(score.stringNumber, { expectedLabel: score.expectedLabel });
      const previous = attempt.stringMax.get(score.stringNumber) ?? 0;
      if (score.score > previous) attempt.stringMax.set(score.stringNumber, score.score);
      if (score.ringing) {
        attempt.presentVotes.set(
          score.stringNumber,
          (attempt.presentVotes.get(score.stringNumber) ?? 0) + 1,
        );
      }
    }
    for (const issue of frame.issues) {
      if (issue.kind !== 'foreign' || !issue.noteLabel) continue;
      const entry = attempt.foreignVotes.get(issue.noteLabel);
      if (entry) entry.count += 1;
      else attempt.foreignVotes.set(issue.noteLabel, { count: 1, issue });
    }

    this.updateLive(attempt);

    const ready = attempt.soundFrames >= this.opts.minFrames;
    const timedOut = frame.nowMs - attempt.startedAtMs >= this.opts.maxAttemptMs;
    if (!attempt.published && (ready || timedOut)) {
      return this.publish(attempt, frame.nowMs);
    }
    return publishedNow;
  }

  /** Aggregate the attempt, publish it, and return the published verdict. */
  private publish(attempt: Attempt, nowMs: number): StrumVerdictEvent {
    const issues = aggregateIssues(attempt, this.opts);
    const verdict: 'correct' | 'issues' = issues.length === 0 ? 'correct' : 'issues';
    attempt.published = true;
    this.published = { verdict, issues, at: nowMs };
    this.verdictSeq += 1;
    return { verdict, issues };
  }

  /** Per-string diagnosis used by the live diagram/lights. */
  private updateLive(attempt: Attempt): void {
    const states: Record<number, LiveStringState> = {};
    const scores: Record<number, number> = {};

    const voteThreshold = presenceThreshold(attempt.soundFrames);
    for (const [number, meta] of attempt.meta) {
      scores[number] = attempt.stringMax.get(number) ?? 0;
      if (attempt.soundFrames < 2) continue; // too early to judge
      const present = (attempt.presentVotes.get(number) ?? 0) >= voteThreshold;
      if (meta.expectedLabel === null) {
        if (present) states[number] = 'wrong'; // a muted string is ringing
      } else {
        states[number] = present ? 'ok' : 'wrong';
      }
    }

    this.liveStates = states;
    this.stringScores = scores;
  }
}

/** Frames a string must be detected in to count as present (≈ half + 1). */
function presenceThreshold(soundFrames: number): number {
  return Math.max(1, Math.ceil(soundFrames / 2));
}

/** Turn an attempt's aggregated data into user-facing issues. */
function aggregateIssues(attempt: Attempt, _opts: Required<StrumAttemptOptions>): StrumIssue[] {
  const issues: StrumIssue[] = [];

  const voteThreshold = presenceThreshold(attempt.soundFrames);
  for (const [number, meta] of attempt.meta) {
    const present = (attempt.presentVotes.get(number) ?? 0) >= voteThreshold;
    if (meta.expectedLabel === null) {
      if (present) issues.push({ kind: 'muted-ring', stringNumber: number as StringNumber });
    } else if (!present) {
      issues.push({
        kind: 'missing',
        stringNumber: number as StringNumber,
        noteLabel: meta.expectedLabel,
      });
    }
  }

  // Foreign notes: reported when they persist across the attempt.
  const minVotes = Math.max(2, Math.round(attempt.soundFrames * 0.4));
  let foreignCount = 0;
  for (const [, entry] of attempt.foreignVotes) {
    if (entry.count >= minVotes && foreignCount < 2) {
      issues.push(entry.issue);
      foreignCount += 1;
    }
  }

  const order: Record<StrumIssue['kind'], number> = { missing: 0, 'muted-ring': 1, foreign: 2 };
  return issues.sort((a, b) => order[a.kind] - order[b.kind]);
}
