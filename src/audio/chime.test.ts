import { describe, expect, it } from 'vitest';
import { playAllTunedFanfare, playTunedChime } from './chime';

interface Recorded {
  oscillators: number;
  gains: number;
  starts: number[];
}

/** Minimal fake AudioContext that records what the chime module does. */
function fakeContext(record: Recorded, options: { throwOnGain?: boolean } = {}): AudioContext {
  const node = () => {
    const self: Record<string, unknown> = {
      connect: () => self,
      disconnect: () => undefined,
    };
    return self;
  };
  return {
    currentTime: 0,
    state: 'running',
    destination: node(),
    resume: async () => undefined,
    createGain: () => {
      if (options.throwOnGain) throw new Error('audio refused');
      record.gains += 1;
      return {
        gain: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => node(),
      };
    },
    createOscillator: () => {
      record.oscillators += 1;
      return {
        type: 'sine',
        frequency: { setValueAtTime: () => undefined },
        connect: () => node(),
        start: (when: number) => {
          record.starts.push(when);
        },
        stop: () => undefined,
      };
    },
  } as unknown as AudioContext;
}

describe('confirmation chimes', () => {
  it('plays a bell-like chime for a tuned string (3 partials)', () => {
    const record: Recorded = { oscillators: 0, gains: 0, starts: [] };
    playTunedChime(fakeContext(record));
    expect(record.oscillators).toBe(3);
    expect(record.gains).toBeGreaterThanOrEqual(3);
    expect(record.starts).toHaveLength(3);
  });

  it('plays an ascending fanfare (3 notes × 3 partials) when all strings are tuned', () => {
    const record: Recorded = { oscillators: 0, gains: 0, starts: [] };
    playAllTunedFanfare(fakeContext(record));
    expect(record.oscillators).toBe(9);
    const sorted = [...record.starts].sort((a, b) => a - b);
    expect(sorted[0]).toBeLessThan(sorted[sorted.length - 1]); // notes are spaced in time
  });

  it('is a no-op without an audio context (mic stopped)', () => {
    expect(() => playTunedChime(null)).not.toThrow();
    expect(() => playAllTunedFanfare(null)).not.toThrow();
  });

  it('never throws when the browser refuses audio', () => {
    const record: Recorded = { oscillators: 0, gains: 0, starts: [] };
    expect(() => playTunedChime(fakeContext(record, { throwOnGain: true }))).not.toThrow();
  });
});
