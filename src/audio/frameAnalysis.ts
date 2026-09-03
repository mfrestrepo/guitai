/**
 * Shared frame analysis for every audio module (tuner, chords, …).
 *
 * One place owns the "is this frame silent / voiced / pitched" decision:
 *  - RMS below {@link SILENCE_RMS} → silence (never reaches the pitch detector)
 *  - otherwise run YIN; voiced only when YIN finds a credible period
 *
 * Both the tuner engine and the chord session consume {@link analyzeFrame},
 * so thresholds and behavior stay identical across modules.
 */

import { detectPitch } from '../pitch/yin';

/** Frames of pure audio below this RMS are treated as silence. */
export const SILENCE_RMS = 0.0025;

/** Minimum RMS for a frame to count as a fresh *sound* in chord practice. */
export const SOUND_RMS = 0.004;

export interface FrameAnalysis {
  /** Root-mean-square amplitude in [0, 1]. */
  readonly rms: number;
  /** Perceptual signal level in [0, 1] (logarithmic), for level meters. */
  readonly signalLevel: number;
  /**
   * Detected fundamental in Hz when the frame is voiced, `null` when silent,
   * unpitched (noise) or below the RMS gate.
   */
  readonly pitchFrequency: number | null;
}

/** Map a linear RMS to a roughly perceptual [0, 1] signal level. */
export function rmsToSignalLevel(rms: number): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-6)); // 0 dBFS ≈ rms 1.0
  const clamped = Math.min(1, Math.max(0, (db + 60) / 55)); // −60 dBFS → 0, ≈ −5 dBFS → 1
  return clamped;
}

/** Analyze one PCM frame (see {@link FrameAnalysis}). */
export function analyzeFrame(frame: Float32Array, sampleRate: number): FrameAnalysis {
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i];
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / frame.length);

  const pitchFrequency =
    rms >= SILENCE_RMS ? (detectPitch(frame, sampleRate)?.frequency ?? null) : null;

  return { rms, signalLevel: rmsToSignalLevel(rms), pitchFrequency };
}
