/**
 * Timing analysis for technique passes.
 *
 * Converts the timing error of each played note (ms relative to the metronome
 * grid) into a small, honest summary: central tendency, dispersion, whether the
 * learner is systematically rushing or dragging, and how many pauses (missing
 * expected notes, in runs) there were.
 *
 * Pure and unit tested with fake values.
 */

export interface TimingSummary {
  readonly meanMs: number;
  readonly stdMs: number;
  readonly maxAbsMs: number;
  /** Playing systematically ahead of the beat. */
  readonly rushing: boolean;
  /** Playing systematically behind the beat. */
  readonly dragging: boolean;
}

/** A mean deviation beyond this fraction of a step counts as rushing/dragging. */
export const SYSTEMATIC_TOLERANCE_RATIO = 0.15;

export function summarizeTiming(
  deviationsMs: readonly number[],
  stepMs: number,
): TimingSummary | null {
  if (deviationsMs.length === 0) return null;
  const mean = deviationsMs.reduce((sum, value) => sum + value, 0) / deviationsMs.length;
  const variance =
    deviationsMs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deviationsMs.length;
  const maxAbs = deviationsMs.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const threshold = SYSTEMATIC_TOLERANCE_RATIO * stepMs;
  return {
    meanMs: mean,
    stdMs: Math.sqrt(variance),
    maxAbsMs: maxAbs,
    rushing: mean < -threshold,
    dragging: mean > threshold,
  };
}

export interface PauseSummary {
  /** Number of runs of consecutive missing expected notes. */
  readonly pauses: number;
  /** Length of the longest run of missing notes. */
  readonly longestRun: number;
}

/** Count pauses from the indexes of expected notes that never sounded. */
export function summarizePauses(missingIndexes: readonly number[]): PauseSummary {
  if (missingIndexes.length === 0) return { pauses: 0, longestRun: 0 };
  const sorted = [...missingIndexes].sort((a, b) => a - b);
  let pauses = 1;
  let longestRun = 1;
  let currentRun = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      currentRun += 1;
    } else {
      pauses += 1;
      currentRun = 1;
    }
    longestRun = Math.max(longestRun, currentRun);
  }
  return { pauses, longestRun };
}

/** Median of a list of numbers (null when empty). */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
