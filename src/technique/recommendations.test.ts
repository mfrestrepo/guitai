import { describe, expect, it } from 'vitest';
import { techniqueExerciseById } from './exercises';
import { recommend, type PracticeMetrics } from './recommendations';

const scale = techniqueExerciseById('scale-c-major-1oct')!; // start 50, target 80, criteria 0.9/20/80/3
const drill = techniqueExerciseById('repeated-note-i-m')!; // verification: regularity

function metrics(overrides: Partial<PracticeMetrics> = {}): PracticeMetrics {
  return {
    accuracy: 1,
    medianAbsCents: 5,
    timingStdMs: 20,
    pauses: 0,
    extraNotes: 0,
    rushing: false,
    dragging: false,
    levelStd: 0.01,
    ...overrides,
  };
}

describe('recommend', () => {
  it('maps pauses to "count out loud and slow down"', () => {
    const r = recommend({ metrics: metrics({ pauses: 2 }), exercise: scale, bpm: 60, passStreak: 0, failStreak: 0 });
    expect(r.action).toBe('slow-and-count');
    expect(r.detailEs).toContain('huecos');
  });

  it('slows down when accuracy is low and tempo is above the start', () => {
    const r = recommend({ metrics: metrics({ accuracy: 0.6 }), exercise: scale, bpm: 65, passStreak: 0, failStreak: 1 });
    expect(r.action).toBe('decrease-tempo');
    expect(r.nextBpm).toBe(60);
  });

  it('suggests isolating when already at the starting tempo', () => {
    const r = recommend({ metrics: metrics({ accuracy: 0.6 }), exercise: scale, bpm: 50, passStreak: 0, failStreak: 0 });
    expect(r.action).toBe('repeat');
    expect(r.detailEs).toContain('4 notas');
  });

  it('flags intonation problems as a pressure/tuning check', () => {
    const r = recommend({ metrics: metrics({ medianAbsCents: 40 }), exercise: scale, bpm: 60, passStreak: 0, failStreak: 0 });
    expect(r.action).toBe('check-pressure');
    expect(r.detailEs).toContain('presión mínima');
  });

  it('coaches rushing and dragging', () => {
    const fast = recommend({ metrics: metrics({ rushing: true }), exercise: scale, bpm: 60, passStreak: 0, failStreak: 0 });
    expect(fast.action).toBe('slow-and-count');
    expect(fast.headlineEs).toContain('No corras');

    const slow = recommend({ metrics: metrics({ dragging: true }), exercise: scale, bpm: 60, passStreak: 0, failStreak: 0 });
    expect(slow.headlineEs).toContain('atrás');
  });

  it('suggests evening out attacks for regularity drills', () => {
    const r = recommend({ metrics: metrics({ levelStd: 0.12 }), exercise: drill, bpm: 60, passStreak: 0, failStreak: 0 });
    expect(r.action).toBe('even-attacks');
  });

  it('increases tempo after enough clean passes', () => {
    const r = recommend({ metrics: metrics(), exercise: scale, bpm: 60, passStreak: 2, failStreak: 0 });
    expect(r.action).toBe('increase-tempo');
    expect(r.nextBpm).toBe(65);
  });

  it('celebrates the target tempo instead of raising it', () => {
    const r = recommend({ metrics: metrics(), exercise: scale, bpm: 80, passStreak: 2, failStreak: 0 });
    expect(r.action).toBe('repeat');
    expect(r.headlineEs).toContain('Objetivo alcanzado');
  });

  it('lowers the tempo after repeated failures', () => {
    const r = recommend({ metrics: metrics({ accuracy: 0.5 }), exercise: scale, bpm: 70, passStreak: 0, failStreak: 2 });
    // Pauses rule does not apply; accuracy rule already suggests slowing down.
    expect(r.action).toBe('decrease-tempo');
    expect(r.nextBpm).toBe(65);
  });

  it('suggests a break after a long sitting with repeated failures', () => {
    const r = recommend({ metrics: metrics({ accuracy: 0.5 }), exercise: scale, bpm: 60, passStreak: 0, failStreak: 3, sessionMinutes: 35 });
    expect(r.action).toBe('take-break');
  });

  it('falls back to "repeat to consolidate" when everything is fine', () => {
    const r = recommend({ metrics: metrics(), exercise: scale, bpm: 60, passStreak: 1, failStreak: 0 });
    expect(r.action).toBe('repeat');
    expect(r.detailEs).toContain('Repite');
  });
});
