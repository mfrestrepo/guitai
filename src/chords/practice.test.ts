import { describe, expect, it } from 'vitest';
import { chordById, type ChordDef } from './catalog';
import { ChordPractice, chordStepStrings, type PracticeSnapshot } from './practice';

const em = chordById('em')!;
const a = chordById('a')!;

/** Build a practice + a LIVE snapshot reader (re-reads on every call). */
function make(chord: ChordDef) {
  let latest: PracticeSnapshot | null = null;
  const practice = new ChordPractice(chord, (s) => {
    latest = s;
  });
  return {
    practice,
    snap: (): PracticeSnapshot => {
      if (!latest) throw new Error('no snapshot emitted');
      return latest;
    },
  };
}

const E2 = 82.4069;
const B2 = 123.4708; // Em 5th string, fret 2
const E3 = 164.8138; // Em 4th string, fret 2
const G3 = 196.0;
const B3 = 246.9417;
const E4 = 329.6276;
const A2 = 110;

describe('chordStepStrings', () => {
  it('plans all six strings for Em and skips muted strings for A', () => {
    expect(chordStepStrings(em)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(chordStepStrings(a)).toEqual([5, 4, 3, 2, 1]); // 6th muted
  });
});

describe('ChordPractice', () => {
  it('starts pending on the 6th string and reports a ready snapshot', () => {
    const { practice, snap } = make(em);
    expect(practice.currentTarget()?.stringNumber).toBe(6);
    expect(snap().phase).toBe('ready');
    expect(snap().mastered).toBe(true);
    expect(snap().steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('marks a step ok and advances after a correct note', () => {
    const { practice, snap } = make(em);
    const check = practice.handleNoteStart(E2); // 6th string must sound E2
    expect(check!.kind).toBe('ok');
    expect(snap().steps[0].status).toBe('ok');
    expect(snap().activeIndex).toBe(1);
    expect(practice.currentTarget()?.stringNumber).toBe(5);
  });

  it('keeps the step pending with feedback after a wrong note', () => {
    const { practice, snap } = make(em);
    const check = practice.handleNoteStart(A2); // 110 Hz ≠ E2 on string 6
    expect(check!.kind).toBe('wrong');
    expect(check!.expectedName).toBe('E2');
    expect(check!.detectedName).toBe('A2');
    expect(snap().activeIndex).toBe(0); // still on the 6th string
    expect(snap().steps[0].status).toBe('wrong');
    expect(snap().mastered).toBe(false);
  });

  it('recovers after a wrong attempt when the learner plays it correctly', () => {
    const { practice, snap } = make(em);
    practice.handleNoteStart(A2); // wrong
    practice.handleNoteStart(E2); // correct
    expect(snap().steps[0].status).toBe('ok');
    expect(snap().activeIndex).toBe(1);
  });

  it('completes and is mastered after every string sounds right', () => {
    const { practice, snap } = make(em);
    for (const freq of [E2, B2, E3, G3, B3, E4]) {
      practice.handleNoteStart(freq);
    }
    expect(snap().phase).toBe('complete');
    expect(snap().mastered).toBe(true);
    expect(snap().steps.every((s) => s.status === 'ok')).toBe(true);
    expect(practice.currentTarget()).toBeNull();
    // Stray notes after completion are ignored safely.
    expect(practice.handleNoteStart(440)).toBeNull();
  });

  it('can be completed with skips but is then not "mastered"', () => {
    const { practice, snap } = make(em);
    practice.handleNoteStart(E2);
    practice.skipCurrent(); // skip string 5
    expect(snap().steps[1].status).toBe('skipped');
    expect(snap().mastered).toBe(false);
    // Play the rest correctly.
    for (const freq of [E3, G3, B3, E4]) {
      practice.handleNoteStart(freq);
    }
    expect(snap().phase).toBe('complete');
    expect(snap().mastered).toBe(false);
  });

  it('validates the A chord skipping its muted 6th string', () => {
    const { practice, snap } = make(a);
    expect(practice.currentTarget()?.stringNumber).toBe(5);
    practice.handleNoteStart(A2);
    expect(snap().activeIndex).toBe(1);
    practice.skipCurrent(); // skip 4th
    expect(snap().steps[1].status).toBe('skipped');
  });

  it('reset() returns the session to its initial state', () => {
    const { practice, snap } = make(em);
    practice.handleNoteStart(A2);
    practice.reset();
    expect(snap().phase).toBe('ready');
    expect(snap().mastered).toBe(true);
    expect(snap().activeIndex).toBe(0);
    expect(practice.currentTarget()?.stringNumber).toBe(6);
  });
});
