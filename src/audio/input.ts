/**
 * Microphone access via the Web Audio API.
 *
 * Responsibilities:
 *  - ask for microphone permission with `getUserMedia`
 *  - wire the stream into an `AudioContext` + `AnalyserNode`
 *  - hand out the latest time-domain frame on demand
 *
 * Design notes:
 *  - We deliberately request the rawest signal the browser allows
 *    (`echoCancellation`, `noiseSuppression` and `autoGainControl` disabled):
 *    those processors distort pitch (AGC in particular changes gain while the
 *    note decays) and hurt a tuner. A side effect is that levels are raw, so
 *    the UI shows a signal meter to help the user get close enough to the mic.
 *  - The microphone is NOT routed to the speakers (`destination`): no
 *    monitoring / feedback.
 *  - Reading is pull-based: the engine asks for "the newest 4096 samples" on a
 *    fixed cadence, which gives heavily overlapping analysis windows without
 *    any audio-thread scheduling.
 */

export interface AudioInputOptions {
  /** Analyser FFT size (power of two) = analysis frame length in samples. */
  fftSize?: number;
}

export const DEFAULT_FFT_SIZE = 4096;

export interface AudioInputHandle {
  readonly analyser: AnalyserNode;
  readonly context: AudioContext;
  readonly sampleRate: number;
  /** Copy the newest `fftSize` time-domain samples into `target`. */
  readFrame(target: Float32Array<ArrayBuffer>): void;
  /** Release the microphone and the audio context. */
  stop(): void;
}

export type MicrophoneErrorName =
  | 'NotAllowedError'
  | 'NotFoundError'
  | 'NotReadableError'
  | 'OverconstrainedError'
  | 'AbortError'
  | 'SecurityError';

/** Human-readable explanation for the common `getUserMedia` failure modes. */
export function describeMicrophoneError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied. Click the lock/camera icon in the address bar and allow the microphone, then try again.';
    case 'NotFoundError':
      return 'No microphone was found. Connect one and try again.';
    case 'NotReadableError':
    case 'OverconstrainedError':
      return 'The microphone is in use by another application. Close it and try again.';
    default:
      return `Could not start the microphone (${name ?? 'unknown error'}).`;
  }
}

/** Create a fresh AudioContext, tolerating Safari's prefixed constructor. */
export function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    throw new Error('Web Audio API is not supported in this browser.');
  }
  return new Ctor({ latencyHint: 'interactive' });
}

/** Request microphone access and return a ready-to-poll audio handle. */
export async function openMicrophoneInput(options: AudioInputOptions = {}): Promise<AudioInputHandle> {
  const { fftSize = DEFAULT_FFT_SIZE } = options;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const context = createAudioContext();
  // The start button is a user gesture, but resume() is still required by
  // autoplay policies on some browsers before the graph runs.
  if (context.state !== 'running') {
    await context.resume();
  }

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0; // only affects frequency data; keep it "live"
  source.connect(analyser);

  const handle: AudioInputHandle = {
    analyser,
    context,
    sampleRate: context.sampleRate,
    readFrame(target) {
      analyser.getFloatTimeDomainData(target);
    },
    stop() {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      void context.close().catch(() => undefined);
    },
  };

  // Stop when the user closes the tab; otherwise the mic light stays on.
  window.addEventListener('pagehide', () => handle.stop(), { once: true });

  return handle;
}
