import { describe, expect, it } from 'vitest';
import { median, summarizePauses, summarizeTiming } from './timingAnalysis';

describe('summarizeTiming', () => {
  it('computes mean, standard deviation and max deviation', () => {
    const summary = summarizeTiming([0, 10, -10, 20], 1000)!;
    expect(summary.meanMs).toBeCloseTo(5, 6);
    expect(summary.stdMs).toBeCloseTo(Math.sqrt(125), 6);
    expect(summary.maxAbsMs).toBe(20);
  });

  it('returns null with no data', () => {
    expect(summarizeTiming([], 1000)).toBeNull();
  });

  it('detects systematic rushing and dragging beyond 15% of a step', () => {
    expect(summarizeTiming([-200, -180, -160], 1000)!.rushing).toBe(true);
    expect(summarizeTiming([-200, -180, -160], 1000)!.dragging).toBe(false);
    expect(summarizeTiming([200, 180, 160], 1000)!.dragging).toBe(true);
    // Small deviations are just human, not systematic.
    const small = summarizeTiming([-50, 40, -30], 1000)!;
    expect(small.rushing).toBe(false);
    expect(small.dragging).toBe(false);
  });
});

describe('summarizePauses', () => {
  it('counts runs of consecutive missing notes', () => {
    expect(summarizePauses([])).toEqual({ pauses: 0, longestRun: 0 });
    expect(summarizePauses([2])).toEqual({ pauses: 1, longestRun: 1 });
    expect(summarizePauses([2, 3, 4, 9])).toEqual({ pauses: 2, longestRun: 3 });
    expect(summarizePauses([5, 1, 2, 8, 9, 10])).toEqual({ pauses: 3, longestRun: 3 });
  });
});

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
