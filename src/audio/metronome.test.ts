import { describe, expect, it } from 'vitest';
import {
  MAX_BPM,
  MIN_BPM,
  Metronome,
  clampBpm,
  secondsPerBeat,
  type AudioContextLike,
  type BeatEvent,
} from './metronome';

interface RecordedClick {
  time: number;
  frequency: number;
  peak: number;
}

function fakeContext(startTime = 0): { ctx: AudioContextLike; clicks: RecordedClick[]; advance(seconds: number): void } {
  const clicks: RecordedClick[] = [];
  let now = startTime;
  let lastClick: RecordedClick | null = null;
  const node = () => ({ connect: () => node() });
  const ctx: AudioContextLike = {
    get currentTime() {
      return now;
    },
    destination: node(),
    resume: async () => undefined,
    createOscillator: () => {
      const click: RecordedClick = { time: 0, frequency: 0, peak: 0 };
      clicks.push(click);
      lastClick = click;
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: (value: number, time: number) => {
            click.frequency = value;
            click.time = time;
          },
        },
        connect: () => node(),
        start: () => undefined,
        stop: () => undefined,
      };
    },
    createGain: () => ({
      gain: {
        setValueAtTime: (value: number) => {
          if (lastClick) lastClick.peak = value;
        },
        exponentialRampToValueAtTime: () => undefined,
      },
      connect: () => node(),
    }),
  };
  return {
    ctx,
    clicks,
    advance: (seconds: number) => {
      now += seconds;
    },
  };
}

describe('metronome maths', () => {
  it('clamps the tempo to the supported range', () => {
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(500)).toBe(MAX_BPM);
    expect(clampBpm(87.6)).toBe(88);
  });

  it('computes seconds per beat', () => {
    expect(secondsPerBeat(60)).toBeCloseTo(1, 6);
    expect(secondsPerBeat(120)).toBeCloseTo(0.5, 6);
    expect(secondsPerBeat(90)).toBeCloseTo(0.6667, 3);
  });
});

describe('Metronome scheduling', () => {
  it('schedules clicks at the beat interval, accenting the first of the bar', () => {
    const { ctx, clicks } = fakeContext();
    const beats: BeatEvent[] = [];
    const metronome = new Metronome({ context: ctx, bpm: 120, beatsPerBar: 4, onBeat: (e) => beats.push(e) });
    metronome.start();

    // At 120 BPM a beat lasts 0.5 s; the first click is 60 ms after start.
    metronome.schedule(2.1);
    expect(clicks).toHaveLength(5);
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, false, true]);
    expect(beats.map((b) => Number(b.time.toFixed(2)))).toEqual([0.06, 0.56, 1.06, 1.56, 2.06]);
    metronome.stop();
  });

  it('uses a higher, louder click on the accented beat', () => {
    const { ctx, clicks } = fakeContext();
    const metronome = new Metronome({ context: ctx, bpm: 100, volume: 0.2 });
    metronome.start();
    metronome.schedule(2);
    const accent = clicks[0];
    const normal = clicks[1];
    expect(accent.frequency).toBe(1500);
    expect(normal.frequency).toBe(1000);
    expect(accent.peak).toBeGreaterThan(normal.peak);
    metronome.stop();
  });

  it('follows tempo changes from the next beat on', () => {
    const { ctx, clicks } = fakeContext();
    const metronome = new Metronome({ context: ctx, bpm: 60 });
    metronome.start();
    metronome.schedule(1.2); // 60 BPM → clicks at 0.06 and 1.06 (next: 2.06)
    expect(clicks).toHaveLength(2);
    metronome.setBpm(120); // from here beats are 0.5 s apart
    metronome.schedule(3.3);
    const times = clicks.map((c) => Number(c.time.toFixed(2)));
    expect(times).toEqual([0.06, 1.06, 2.06, 2.56, 3.06]);
    metronome.stop();
  });

  it('stops scheduling clicks after stop()', () => {
    const { ctx, clicks } = fakeContext();
    const metronome = new Metronome({ context: ctx, bpm: 120 });
    metronome.start();
    metronome.schedule(1);
    const scheduled = clicks.length;
    metronome.stop();
    metronome.schedule(5);
    expect(clicks).toHaveLength(scheduled);
    expect(metronome.isRunning).toBe(false);
  });

  it('restarts from beat 1 when started again', () => {
    const { ctx } = fakeContext();
    const beats: BeatEvent[] = [];
    const metronome = new Metronome({ context: ctx, bpm: 120, onBeat: (e) => beats.push(e) });
    metronome.start();
    metronome.schedule(1.2);
    metronome.stop();
    metronome.start();
    metronome.schedule(2.5);
    expect(beats[beats.length - 1].accent).toBe(true); // new bar started
    metronome.stop();
  });

  it('honours beats per bar changes', () => {
    const { ctx } = fakeContext();
    const beats: BeatEvent[] = [];
    const metronome = new Metronome({ context: ctx, bpm: 120, beatsPerBar: 2, onBeat: (e) => beats.push(e) });
    metronome.start();
    metronome.schedule(2.1);
    expect(beats.map((b) => b.accent)).toEqual([true, false, true, false, true]);
    metronome.stop();
  });

  it('never throws when the audio context refuses to make nodes', () => {
    const broken = {
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        throw new Error('no audio');
      },
      createGain: () => {
        throw new Error('no audio');
      },
    } as unknown as AudioContextLike;
    const metronome = new Metronome({ context: broken, bpm: 90 });
    expect(() => {
      metronome.start();
      metronome.schedule(1);
      metronome.stop();
    }).not.toThrow();
  });
});
