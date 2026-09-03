/**
 * ChordPractice — the pure state machine behind one "play this chord" session.
 *
 * The learner plays the chord's sounding strings one at a time, low → high
 * (6th string first). Every string is a step:
 *
 *  - while a step is pending the session is "listening" for that string;
 *  - a voiced note is checked against the note the string should sound
 *    (see evaluate.ts). Correct → step done, move on. Wrong / almost → the
 *    step stays pending with feedback (learner retries or skips);
 *  - muted strings ("x") are never steps.
 *
 * The class is mic-free and audio-free: it consumes *note events*. The
 * microphone + note-event detection live in micSession.ts. This makes the
 * whole validation flow unit-testable.
 */

import { type ChordDef, type StringNumber, soundingStrings } from './catalog';
import { evaluateStringNote, type NoteCheck } from './evaluate';

export type StepStatus = 'pending' | 'ok' | 'wrong' | 'almost' | 'skipped';
export type PracticePhase = 'ready' | 'in-progress' | 'complete';

export interface StepState {
  readonly stringNumber: StringNumber;
  readonly status: StepStatus;
}

export interface PracticeSnapshot {
  readonly chordId: string;
  readonly phase: PracticePhase;
  /** Steps in play order (sounding strings only, low → high). */
  readonly steps: readonly StepState[];
  /** Index of the step currently being listened to (steps.length when done). */
  readonly activeIndex: number;
  /** True when every step was played correctly (no skips). */
  readonly mastered: boolean;
  /** Details of the most recent check (for hints/wording). */
  readonly lastCheck?: NoteCheck;
}

/** Muted strings are not validated; learners only pluck sounding ones. */
export function chordStepStrings(chord: ChordDef): readonly StringNumber[] {
  return soundingStrings(chord).map((s) => s.number);
}

export class ChordPractice {
  private readonly chord: ChordDef;
  private readonly onChange: (snapshot: PracticeSnapshot) => void;

  private steps: StepState[];
  private activeIndex = 0;
  /** True once the learner skipped a string (never cleared by reset-free play). */
  private skipped = false;
  private phase: PracticePhase = 'ready';
  private lastCheck: NoteCheck | undefined;

  constructor(chord: ChordDef, onChange: (snapshot: PracticeSnapshot) => void) {
    this.chord = chord;
    this.onChange = onChange;
    this.steps = chordStepStrings(chord).map((stringNumber) => ({
      stringNumber,
      status: 'pending',
    }));
    // Tell the consumer about the initial (ready) state right away.
    this.emit();
  }

  get chordId(): string {
    return this.chord.id;
  }

  /**
   * "Mastered" means the learner finished (or is currently on) a run with no
   * skipped strings. Wrong attempts are part of learning: once corrected they
   * do not stop the chord from being mastered — only a skip does.
   */
  private get mastered(): boolean {
    if (this.skipped) return false;
    const bad = this.steps.some(
      (s) => s.status === 'wrong' || s.status === 'almost' || s.status === 'skipped',
    );
    return !bad;
  }

  snapshot(): PracticeSnapshot {
    return {
      chordId: this.chord.id,
      phase: this.phase,
      steps: this.steps,
      activeIndex: this.activeIndex,
      mastered: this.mastered,
      lastCheck: this.lastCheck,
    };
  }

  /** The string the learner should play right now (null when finished). */
  currentTarget(): StepState | null {
    if (this.phase === 'complete' || this.activeIndex >= this.steps.length) return null;
    return this.steps[this.activeIndex];
  }

  /**
   * A voiced note was heard (a pluck). Checks it against the current step and
   * advances when correct. Returns the check for the caller to display.
   */
  handleNoteStart(frequencyHz: number): NoteCheck | null {
    const target = this.currentTarget();
    if (!target) return null; // already complete — ignore stray notes

    const check = evaluateStringNote(this.chord, target.stringNumber, frequencyHz);
    this.lastCheck = check;
    this.phase = 'in-progress';

    if (check.kind === 'ok') {
      this.steps = this.steps.map((s, i) =>
        i === this.activeIndex ? { ...s, status: 'ok' } : s,
      );
      this.activeIndex += 1;
      if (this.activeIndex >= this.steps.length) {
        this.phase = 'complete';
      }
    } else {
      this.steps = this.steps.map((s, i) =>
        i === this.activeIndex ? { ...s, status: check.kind } : s,
      );
    }

    this.emit();
    return check;
  }

  /** Learner gives up on the current string (marks it skipped, moves on). */
  skipCurrent(): void {
    const target = this.currentTarget();
    if (!target) return;
    this.skipped = true;
    this.steps = this.steps.map((s, i) =>
      i === this.activeIndex ? { ...s, status: 'skipped' } : s,
    );
    this.activeIndex += 1;
    this.phase = 'in-progress';
    if (this.activeIndex >= this.steps.length) {
      this.phase = 'complete';
    }
    this.emit();
  }

  reset(): void {
    this.steps = this.steps.map((s) => ({ ...s, status: 'pending' as StepStatus }));
    this.activeIndex = 0;
    this.skipped = false;
    this.phase = 'ready';
    this.lastCheck = undefined;
    this.emit();
  }

  private emit(): void {
    this.onChange(this.snapshot());
  }
}
