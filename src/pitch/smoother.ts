/**
 * PitchSmoother — turns the raw per-frame estimates of {@link detectPitch} into
 * a stable, low-latency pitch that a tuner can display.
 *
 * Why smoothing is needed (see also `docs/pitch-detection.md`):
 *   - Raw estimates jitter by a few cents even on a perfectly steady string.
 *     A needle that dances ±5¢ every frame is unusable.
 *   - Transient noise / a stray harmonic / a brush of another string can
 *     produce a single wildly wrong frame. One bad frame must not yank the
 *     display around.
 *   - When the player deliberately moves to another string the pitch legitimately
 *     jumps ~500 cents, and the tuner must follow — quickly, but not on a
 *     one-frame glitch.
 *
 * The design below is deliberately simple and frame-based (the engine calls it
 * at a fixed cadence of ~30 Hz), and is unit tested in `smoother.test.ts`.
 *
 * Behavior:
 *   1. A voiced frame within `maxJumpCents` of the current anchor is accepted:
 *      the anchor moves toward it with exponential smoothing
 *      (`responsiveness` per frame ≈ 100–150 ms time constant).
 *   2. A voiced frame farther than `maxJumpCents` away, or a silent frame, is
 *      counted as "unstable". While the streak is shorter than `resetAfter`,
 *      the previous anchor is held (the needle sticks through brief drop-outs
 *      and rejects spikes).
 *   3. Once the unstable streak reaches `resetAfter` (~100 ms of sustained
 *      disagreement or silence), the anchor is retuned: silence → idle;
 *      a sustained new pitch → the new note is adopted.
 *
 * All comparisons and smoothing happen in the cents domain (logarithmic in
 * frequency), because 5 cents of error at 82 Hz and at 330 Hz are perceptually
 * the same and should be treated identically.
 */

import { centsBetween, frequencyFromCentsOffset, A4_FREQUENCY_HZ } from '../theory/music';

export interface SmoothingOptions {
  /**
   * Largest one-frame jump (in cents) still considered "the same note".
   * Default 50¢ ≈ half a semitone. String changes (~500¢) exceed this and go
   * through the retune path.
   */
  maxJumpCents?: number;
  /**
   * Consecutive unstable (out-of-range or silent) frames needed to abandon the
   * current anchor. Default 3 ≈ 100 ms at a 30 Hz cadence.
   */
  resetAfter?: number;
  /**
   * Per-frame anchor responsiveness in (0, 1]. Higher = faster but noisier.
   * Default 0.35 per frame at ~30 Hz ≈ a ~100–150 ms attack time constant,
   * which feels immediate on a needle while still averaging out jitter.
   */
  responsiveness?: number;
}

const DEFAULT_OPTIONS: Required<SmoothingOptions> = {
  maxJumpCents: 50,
  resetAfter: 3,
  responsiveness: 0.35,
};

export class PitchSmoother {
  private readonly maxJumpCents: number;
  private readonly resetAfter: number;
  private readonly responsiveness: number;

  /** Current smoothed pitch, expressed in cents relative to A4 (440 Hz). */
  private anchorCents: number | null = null;
  /** Consecutive unstable frames (out-of-range pitch or silence). */
  private unstableStreak = 0;

  constructor(options: SmoothingOptions = {}) {
    this.maxJumpCents = options.maxJumpCents ?? DEFAULT_OPTIONS.maxJumpCents;
    this.resetAfter = options.resetAfter ?? DEFAULT_OPTIONS.resetAfter;
    this.responsiveness = options.responsiveness ?? DEFAULT_OPTIONS.responsiveness;
  }

  /** Forget the current note. Called when the mic is stopped. */
  reset(): void {
    this.anchorCents = null;
    this.unstableStreak = 0;
  }

  /**
   * Feed one frame's estimate.
   *
   * @param candidateHz Detected fundamental in Hz, or `null` when the frame was
   *                    judged unpitched/silent by the detector.
   * @returns The smoothed pitch in Hz to display, or `null` when no pitch is
   *          currently established (idle / after sustained silence).
   */
  push(candidateHz: number | null): number | null {
    if (candidateHz === null || !Number.isFinite(candidateHz) || candidateHz <= 0) {
      return this.onUnstable(null);
    }

    const cents = centsBetween(candidateHz, A4_FREQUENCY_HZ);

    if (this.anchorCents === null) {
      // First voiced frame after silence: adopt immediately for low latency.
      // The gates upstream (RMS + periodicity) already filtered out noise.
      this.anchorCents = cents;
      this.unstableStreak = 0;
      return this.anchorHz();
    }

    if (Math.abs(cents - this.anchorCents) <= this.maxJumpCents) {
      // Same note: exponential approach in cents space.
      this.unstableStreak = 0;
      this.anchorCents += this.responsiveness * (cents - this.anchorCents);
      return this.anchorHz();
    }

    // Out-of-range frame — possibly a glitch (hold) or a real string change
    // (retune once it persists).
    return this.onUnstable(cents);
  }

  private onUnstable(cents: number | null): number | null {
    this.unstableStreak += 1;

    if (this.anchorCents === null) {
      return null; // nothing to hold onto yet
    }

    if (this.unstableStreak < this.resetAfter) {
      // Hold the previous anchor through short drop-outs / single spikes.
      return this.anchorHz();
    }

    if (cents !== null) {
      // Sustained disagreement: the player moved to a different note. Adopt it.
      this.anchorCents = cents;
      this.unstableStreak = 0;
      return this.anchorHz();
    }

    // Sustained silence: go idle and forget the note.
    this.anchorCents = null;
    this.unstableStreak = 0;
    return null;
  }

  private anchorHz(): number {
    return frequencyFromCentsOffset(A4_FREQUENCY_HZ, this.anchorCents as number);
  }
}
