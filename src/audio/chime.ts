/**
 * Confirmation sounds for the tuner (Web Audio, no assets).
 *
 * Two cues:
 *  - `playTunedChime`   — a soft bell when a *single* string is confirmed in
 *    tune (the "todo está ok" feedback).
 *  - `playAllTunedFanfare` — a small ascending triad when every string is tuned.
 *
 * Everything is synthesized: short attack, exponential decay, a couple of
 * partials for a bell-like timbre. The module is intentionally thin and
 * defensive (a browser may refuse to start audio); any failure is silent.
 */

const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.32 },
  { ratio: 2.99, gain: 0.12 },
] as const;

export interface ChimeOptions {
  /** Master volume 0…1 (default 0.18 — a confirmation, not an alarm). */
  volume?: number;
}

/** One bell-like note starting at `startAt` seconds on the context clock. */
function bell(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  volume: number,
): void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, startAt);
  master.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  master.connect(ctx.destination);

  for (const partial of PARTIALS) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * partial.ratio, startAt);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(partial.gain, startAt);
    osc.connect(gain).connect(master);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  }
}

/** Ready-to-use chime for a single confirmed string (≈ middle C). */
export function playTunedChime(ctx: AudioContext | null, options: ChimeOptions = {}): void {
  if (!ctx) return;
  const volume = options.volume ?? 0.18;
  try {
    void ctx.resume?.();
    bell(ctx, 1046.5, ctx.currentTime + 0.001, 0.5, volume); // C6
  } catch {
    // Audio refused/unavailable — feedback is a nice-to-have, never fatal.
  }
}

/** Ascending E-major triad when all strings are tuned. */
export function playAllTunedFanfare(ctx: AudioContext | null, options: ChimeOptions = {}): void {
  if (!ctx) return;
  const volume = options.volume ?? 0.16;
  try {
    void ctx.resume?.();
    const t0 = ctx.currentTime + 0.001;
    const notes = [659.25, 830.61, 987.77]; // E5 · G#5 · B5
    notes.forEach((freq, i) => bell(ctx, freq, t0 + i * 0.13, 0.6, volume));
  } catch {
    // Silent failure by design.
  }
}
