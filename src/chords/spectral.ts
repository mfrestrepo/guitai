/**
 * Spectral tools for polyphonic (strummed-chord) analysis.
 *
 * The tuner and the per-string chord mode are monophonic (YIN). A strum is
 * several notes at once, so here we go to the frequency domain instead:
 *
 *   samples ─▶ Hann window ─▶ radix-2 FFT ─▶ magnitude spectrum ─▶ peaks
 *
 * All functions are pure and unit tested (see spectral.test.ts).
 */

/** In-place iterative radix-2 complex FFT (arrays hold interleaved re/im). */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if ((n & (n - 1)) !== 0 || n < 2) throw new Error(`FFT size must be a power of two (got ${n})`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = i + k + half;
        const xRe = re[b];
        const xIm = im[b];
        const tRe = curRe * xRe - curIm * xIm;
        const tIm = curRe * xIm + curIm * xRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Hann window values of length n. */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/**
 * Power spectrum of a real signal: returns magnitudes for bins 0 … n/2
 * (positive frequencies). `n` must be a power of two; the signal is windowed.
 */
export function magnitudeSpectrum(samples: Float32Array): Float64Array {
  const n = samples.length;
  if ((n & (n - 1)) !== 0) throw new Error('magnitudeSpectrum expects a power-of-two length');
  const window = hannWindow(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i] * window[i];

  fftRadix2(re, im);

  const half = n / 2;
  const mag = new Float64Array(half + 1);
  const scale = 2 / (windowSum(window) * 0.5 + 1e-12);
  for (let k = 0; k <= half; k++) {
    mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * scale;
  }
  return mag;
}

function windowSum(w: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < w.length; i++) sum += w[i];
  return sum;
}

export interface SpectralPeak {
  /** Frequency in Hz (parabolic interpolation for sub-bin accuracy). */
  readonly frequency: number;
  /** Magnitude. */
  readonly amplitude: number;
  /** Bin index. */
  readonly bin: number;
}

/**
 * Local maxima of the magnitude spectrum between `binFrom` and `binTo`
 * (inclusive), with parabolic interpolation on the log-magnitude for better
 * frequency accuracy.
 */
export function spectralPeaks(
  mag: Float64Array,
  sampleRate: number,
  binFrom: number,
  binTo: number,
): SpectralPeak[] {
  const peaks: SpectralPeak[] = [];
  const n = (mag.length - 1) * 2;
  const start = Math.max(1, binFrom);
  const end = Math.min(mag.length - 2, binTo);
  for (let i = start; i <= end; i++) {
    if (mag[i] < mag[i - 1] || mag[i] < mag[i + 1]) continue;
    // Parabolic interpolation on log magnitude (peak shape is log-normal-ish).
    const y0 = Math.log(mag[i - 1] + 1e-30);
    const y1 = Math.log(mag[i] + 1e-30);
    const y2 = Math.log(mag[i + 1] + 1e-30);
    const denom = y0 - 2 * y1 + y2;
    let offset = 0;
    if (Math.abs(denom) > 1e-12) {
      const d = 0.5 * (y0 - y2) / denom;
      if (Number.isFinite(d) && Math.abs(d) < 1) offset = d;
    }
    const bin = i + offset;
    peaks.push({
      frequency: (bin * sampleRate) / n,
      amplitude: mag[i],
      bin: i,
    });
  }
  return peaks;
}

/** Total magnitude in a frequency band [lowHz, highHz] (bin-summed). */
export function bandMagnitude(
  mag: Float64Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const n = (mag.length - 1) * 2;
  const from = Math.max(1, Math.floor((lowHz * n) / sampleRate));
  const to = Math.min(mag.length - 2, Math.ceil((highHz * n) / sampleRate));
  let sum = 0;
  for (let k = from; k <= to; k++) sum += mag[k];
  return sum;
}

/**
 * Average magnitude in a frequency band — comparable across bands of very
 * different widths (a low note spans fewer bins than a high one).
 */
export function bandMean(
  mag: Float64Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const n = (mag.length - 1) * 2;
  const from = Math.max(1, Math.floor((lowHz * n) / sampleRate));
  const to = Math.min(mag.length - 2, Math.ceil((highHz * n) / sampleRate));
  if (to < from) return 0;
  let sum = 0;
  for (let k = from; k <= to; k++) sum += mag[k];
  return sum / (to - from + 1);
}

/** Highest single-bin magnitude inside a frequency band. */
export function bandPeak(
  mag: Float64Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const n = (mag.length - 1) * 2;
  const from = Math.max(1, Math.floor((lowHz * n) / sampleRate));
  const to = Math.min(mag.length - 2, Math.ceil((highHz * n) / sampleRate));
  let peak = 0;
  for (let k = from; k <= to; k++) {
    if (mag[k] > peak) peak = mag[k];
  }
  return peak;
}

/** Median of the magnitude spectrum over [lowHz, highHz] (noise estimate). */
export function bandMedian(
  mag: Float64Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const n = (mag.length - 1) * 2;
  const from = Math.max(1, Math.floor((lowHz * n) / sampleRate));
  const to = Math.min(mag.length - 2, Math.ceil((highHz * n) / sampleRate));
  const values: number[] = [];
  for (let k = from; k <= to; k++) values.push(mag[k]);
  values.sort((a, b) => a - b);
  return values.length > 0 ? values[Math.floor(values.length / 2)] : 0;
}
