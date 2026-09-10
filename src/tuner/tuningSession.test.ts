import { describe, expect, it } from 'vitest';
import { TuningSession } from './tuningSession';

const inTune = (stringNumber: number, cents = 0) =>
  ({ stringNumber, cents, verdict: 'inTune' as const });
const flat = (stringNumber: number, cents = -40) =>
  ({ stringNumber, cents, verdict: 'flat' as const });

describe('TuningSession', () => {
  it('confirms a string only after it stays in tune for the hold time', () => {
    const session = new TuningSession(6, { holdMs: 400 });
    expect(session.update(inTune(6), 0)).toEqual([]);
    expect(session.update(inTune(6), 200)).toEqual([]);
    expect(session.isTuned(6)).toBe(false);
    const events = session.update(inTune(6), 450);
    expect(events).toEqual([{ kind: 'string-tuned', stringNumber: 6 }]);
    expect(session.isTuned(6)).toBe(true);
    expect(session.tunedStrings()).toEqual([6]);
  });

  it('does not re-confirm (and so does not re-chime) a tuned string', () => {
    const session = new TuningSession(6, { holdMs: 400 });
    session.update(inTune(6), 0);
    session.update(inTune(6), 500);
    expect(session.update(inTune(6), 800)).toEqual([]);
    expect(session.update(inTune(6), 1200)).toEqual([]);
  });

  it('resets the streak when the string leaves the in-tune band mid-hold', () => {
    const session = new TuningSession(6, { holdMs: 400 });
    session.update(inTune(6), 0);
    session.update(flat(6), 200); // lost it
    expect(session.update(inTune(6), 350)).toEqual([]); // new streak starts here
    expect(session.isTuned(6)).toBe(false);
    expect(session.update(inTune(6), 800)).toEqual([{ kind: 'string-tuned', stringNumber: 6 }]);
  });

  it('keeps the ✓ when the string is only slightly off (within the lost threshold)', () => {
    const session = new TuningSession(6, { holdMs: 400, outOfTuneCents: 30 });
    session.update(inTune(6), 0);
    session.update(inTune(6), 500);
    expect(session.isTuned(6)).toBe(true);
    // 12¢ off: still fine (people touch the peg gently).
    expect(session.update({ stringNumber: 6, cents: 12, verdict: 'nearlySharp' }, 700)).toEqual([]);
    expect(session.isTuned(6)).toBe(true);
  });

  it('loses the ✓ when the string drifts clearly out of tune for a while', () => {
    const session = new TuningSession(6, { holdMs: 400, outOfTuneCents: 30, outOfTuneHoldMs: 500 });
    session.update(inTune(6), 0);
    session.update(inTune(6), 500);
    expect(session.isTuned(6)).toBe(true);
    expect(session.update(flat(6), 700)).toEqual([]); // drift starts
    expect(session.update(flat(6), 1000)).toEqual([]); // not long enough yet
    expect(session.update(flat(6), 1300)).toEqual([{ kind: 'string-lost', stringNumber: 6 }]);
    expect(session.isTuned(6)).toBe(false);
  });

  it('keeps marks for other strings while tuning the current one', () => {
    const session = new TuningSession(6, { holdMs: 400 });
    session.update(inTune(6), 0);
    session.update(inTune(6), 500); // 6 tuned
    session.update(inTune(5), 600);
    session.update(inTune(5), 1100); // 5 tuned
    expect(session.tunedStrings()).toEqual([5, 6]);
  });

  it('emits all-tuned once the last string is confirmed', () => {
    const session = new TuningSession(2, { holdMs: 300 });
    expect(session.update(inTune(6), 0)).toEqual([]);
    expect(session.update(inTune(6), 400)).toEqual([{ kind: 'string-tuned', stringNumber: 6 }]);
    const events = session.update(inTune(5), 500).concat(session.update(inTune(5), 900));
    expect(events).toEqual([
      { kind: 'string-tuned', stringNumber: 5 },
      { kind: 'all-tuned' },
    ]);
    expect(session.allTuned()).toBe(true);
  });

  it('silence keeps the marks but clears pending streaks', () => {
    const session = new TuningSession(6, { holdMs: 400 });
    session.update(inTune(6), 0);
    session.update(inTune(6), 500);
    expect(session.isTuned(6)).toBe(true);
    session.update(null, 700);
    expect(session.isTuned(6)).toBe(true); // mark survives a pause
    session.update(inTune(5), 800);
    session.update(null, 900);
    session.update(inTune(5), 1000); // new streak, not confirmed yet
    expect(session.isTuned(5)).toBe(false);
  });

  it('reset() clears everything (mic stopped / new session)', () => {
    const session = new TuningSession(6, { holdMs: 300 });
    session.update(inTune(6), 0);
    session.update(inTune(6), 400);
    session.reset();
    expect(session.tunedStrings()).toEqual([]);
    expect(session.allTuned()).toBe(false);
  });
});
