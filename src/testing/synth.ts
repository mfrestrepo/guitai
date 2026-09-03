/**
 * Test-only helpers for synthesizing realistic(ish) guitar-like audio frames.
 *
 * These let the pitch-detection tests run without a microphone: we build
 * harmonic series with a pluck-like exponential decay, add white noise, and
 * feed the frames straight into `detectPitch`. Deterministic (seeded PRNG) so
 * the suite is reproducible.
 */

export interface ToneSpec {
  /** Fundamental frequency in Hz. */
  readonly frequency: number;
  /** Samples per second. */
  readonly sampleRate: number;
  /** Number of output samples. */
  readonly sampleCount: number;
  /**
   * Amplitude of each harmonic, index 0 = fundamental. Defaults to a
   * 1/k decaying series `[1, 1/2, 1/3, ...]` (4 partials).
   */
  readonly partialGains?: readonly number[];
  /** Exponential decay time constant in seconds (0/undefined = steady tone). */
  readonly decaySeconds?: number;
  /** Overall amplitude before noise (default 0.5). */
  readonly amplitude?: number;
  /** Amplitude of additive white noise (default 0). */
  readonly noiseAmplitude?: number;
  /** PRNG seed (default 1). */
  readonly seed?: number;
}

/** Deterministic 32-bit PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthesizeTone(spec: ToneSpec): Float32Array {
  const { frequency, sampleRate, sampleCount } = spec;
  const partialGains = spec.partialGains ?? [1, 0.5, 0.333, 0.25];
  const amplitude = spec.amplitude ?? 0.5;
  const rng = mulberry32(spec.seed ?? 1);

  const decayFactor =
    spec.decaySeconds && spec.decaySeconds > 0
      ? Math.exp(-1 / (spec.decaySeconds * sampleRate))
      : 1;

  // Random phases per partial: a plucked string has no fixed phase alignment,
  // and this keeps tests from being overfit to one waveform shape.
  const phases = partialGains.map(() => rng() * 2 * Math.PI);

  const buf = new Float32Array(sampleCount);
  let envelope = 1;
  for (let i = 0; i < sampleCount; i++) {
    let value = 0;
    const t = i / sampleRate;
    for (let k = 0; k < partialGains.length; k++) {
      const partialFreq = frequency * (k + 1);
      const phase = 2 * Math.PI * partialFreq * t + phases[k];
      value += partialGains[k] * Math.sin(phase);
    }
    buf[i] = amplitude * envelope * value;
    envelope *= decayFactor;
  }

  if (spec.noiseAmplitude) {
    for (let i = 0; i < sampleCount; i++) {
      buf[i] += spec.noiseAmplitude * (rng() * 2 - 1);
    }
  }
  return buf;
}

export function synthesizeNoise(sampleCount: number, amplitude = 0.5, seed = 1): Float32Array {
  const rng = mulberry32(seed);
  const buf = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    buf[i] = amplitude * (rng() * 2 - 1);
  }
  return buf;
}

export interface ChordSynthSpec {
  /** Simultaneous fundamental frequencies (Hz) — a strummed chord. */
  readonly frequencies: readonly number[];
  readonly sampleRate: number;
  readonly sampleCount: number;
  /** Per-string amplitude (default 0.4). */
  readonly amplitude?: number;
  /** Exponential decay time constant in seconds (default 0.9). */
  readonly decaySeconds?: number;
  readonly noiseAmplitude?: number;
  readonly seed?: number;
}

/**
 * Synthesize a strummed chord: all frequencies ring together with a small
 * harmonic series and an exponential decay, plus optional noise.
 */
export function synthesizeChord(spec: ChordSynthSpec): Float32Array {
  const { frequencies, sampleRate, sampleCount } = spec;
  const amplitude = spec.amplitude ?? 0.4;
  const decaySeconds = spec.decaySeconds ?? 0.9;
  const rng = mulberry32(spec.seed ?? 3);
  const partialGains = [1, 0.5, 0.28, 0.16];
  const decayFactor = Math.exp(-1 / (decaySeconds * sampleRate));

  const voices = frequencies.map((frequency) => ({
    frequency,
    phases: partialGains.map(() => rng() * 2 * Math.PI),
  }));

  const buf = new Float32Array(sampleCount);
  let envelope = 1;
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    let value = 0;
    for (const voice of voices) {
      for (let k = 0; k < partialGains.length; k++) {
        value += partialGains[k] * Math.sin(2 * Math.PI * voice.frequency * (k + 1) * t + voice.phases[k]);
      }
    }
    buf[i] = amplitude * envelope * value;
    envelope *= decayFactor;
  }

  if (spec.noiseAmplitude) {
    for (let i = 0; i < sampleCount; i++) {
      buf[i] += spec.noiseAmplitude * (rng() * 2 - 1);
    }
  }
  return buf;
}

export function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** RMS of one slice of `buf` starting at `offset`. */
export function rmsOfWindow(buf: Float32Array, offset: number, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const v = buf[offset + i];
    sum += v * v;
  }
  return Math.sqrt(sum / length);
}
