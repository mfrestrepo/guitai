import { describe, expect, it } from 'vitest';
import { StrumGate } from './strumGate';

const T = 100; // one frame ≈ 100 ms

const quiet = (now: number) => ({ verdict: 'quiet' as const, nowMs: now });
const ok = (now: number) => ({ verdict: 'correct' as const, nowMs: now });
const bad = (now: number) => ({
  verdict: 'issues' as const,
  issues: [{ kind: 'missing' as const, stringNumber: 3 as const, noteLabel: 'G3' }],
  nowMs: now,
});

describe('StrumGate', () => {
  it('does not publish before enough sounding frames accumulated', () => {
    const gate = new StrumGate({ windowFrames: 22, minSounding: 13, holdMs: 2600 });
    let t = 0;
    const events: string[] = [];
    for (let i = 0; i < 12; i++) {
      t += T;
      const event = gate.push(ok(t));
      if (event) events.push(event.kind === 'verdict' ? `verdict:${event.verdict}` : event.kind);
    }
    expect(events).toEqual([]); // only 12 of the 13 needed frames
  });

  it('publishes "correct" once the strum has been consistent long enough', () => {
    const gate = new StrumGate({ windowFrames: 22, minSounding: 13, holdMs: 2600 });
    let t = 0;
    const events: string[] = [];
    for (let i = 0; i < 13; i++) {
      t += T;
      const event = gate.push(ok(t));
      if (event) events.push(event.kind === 'verdict' ? `verdict:${event.verdict}` : event.kind);
    }
    expect(events).toEqual(['verdict:correct']);
  });

  it('does not re-publish the same verdict while holding', () => {
    const gate = new StrumGate({ windowFrames: 22, minSounding: 13, holdMs: 2600 });
    let t = 0;
    for (let i = 0; i < 13; i++) {
      t += T;
      gate.push(ok(t));
    }
    const events: string[] = [];
    for (let i = 0; i < 20; i++) {
      t += T;
      const event = gate.push(ok(t));
      if (event) events.push(event.kind === 'verdict' ? `verdict:${event.verdict}` : event.kind);
    }
    expect(events).toEqual([]); // still the same verdict on screen
  });

  it('holds a verdict on screen and does not flip mid-hold', () => {
    const gate = new StrumGate({ windowFrames: 22, minSounding: 13, holdMs: 2600 });
    let t = 0;
    for (let i = 0; i < 13; i++) {
      t += T;
      gate.push(bad(t));
    }
    // Immediately after, a clean strum comes — but the hold must win first.
    for (let i = 0; i < 10; i++) {
      t += T;
      const event = gate.push(ok(t));
      expect(event).toBeNull();
    }
    expect(gate.state().verdict).toBe('issues');
    // Only after the hold expires may the verdict change to correct.
    for (let i = 0; i < 30; i++) {
      t += T;
      const event = gate.push(ok(t));
      if (event) {
        expect(event).toMatchObject({ kind: 'verdict', verdict: 'correct' });
        break;
      }
    }
    expect(gate.state().verdict).toBe('correct');
  });

  it('returns to "listening" only after the strum ends and the hold expires', () => {
    const gate = new StrumGate({
      windowFrames: 22,
      minSounding: 13,
      holdMs: 2600,
      quietToRelisten: 16,
    });
    let t = 0;
    for (let i = 0; i < 13; i++) {
      t += T;
      gate.push(ok(t)); // publish correct at the 13th frame
    }
    // Silence the frame stream (guitar decayed / muted).
    let eventSeen = false;
    for (let i = 0; i < 40; i++) {
      t += T;
      const event = gate.push(quiet(t));
      if (event && event.kind === 'listening') {
        eventSeen = true;
        break;
      }
    }
    expect(eventSeen).toBe(true);
    expect(gate.state().stage).toBe('listening');
  });

  it('a short gap does not yank the verdict back to listening', () => {
    const gate = new StrumGate({
      windowFrames: 22,
      minSounding: 13,
      holdMs: 2600,
      quietToRelisten: 16,
    });
    let t = 0;
    for (let i = 0; i < 13; i++) {
      t += T;
      gate.push(ok(t));
    }
    // Brief dropout (3 quiet frames) inside the hold window:
    for (let i = 0; i < 3; i++) {
      t += T;
      expect(gate.push(quiet(t))).toBeNull();
    }
    expect(gate.state().verdict).toBe('correct');
    // And a new clean frame stream still doesn't republish during the hold.
    for (let i = 0; i < 10; i++) {
      t += T;
      expect(gate.push(ok(t))).toBeNull();
    }
    expect(gate.state().verdict).toBe('correct');
  });
});
