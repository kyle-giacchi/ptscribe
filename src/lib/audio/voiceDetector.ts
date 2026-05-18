// ~-50 dBFS in linear amplitude. Quiet HVAC and keystrokes stay below this.
const VOICE_RMS_THRESHOLD = 0.00316;
const ANALYSER_FFT_SIZE = 2048;

export interface VoiceDetector {
  /** Set up AudioContext + analyser for the given stream. Resets the idle timer. Call once per clip start. */
  setup(stream: MediaStream): void;
  /** Reset the idle-silence timer without reconfiguring the analyser. Call on resume. */
  resetIdleTimer(): void;
  /** Sample the current audio level; updates lastVoiceAtMs if voice detected. Call on each tick. */
  sample(now: number): void;
  /** Disconnect and close the AudioContext. Call on every exit path (stop, reset, error). */
  teardown(): void;
  /** Timestamp (ms) of the last detected voice activity. Used for idle auto-stop checks. */
  readonly lastVoiceAtMs: number;
  /** Live AnalyserNode — non-null while recording, null otherwise. For waveform visualization. */
  readonly analyser: AnalyserNode | null;
}

/**
 * Creates a reusable voice detector. One instance lives for the recorder's
 * lifetime; call setup/teardown around each clip recording.
 *
 * All failures are best-effort — a broken AudioContext never breaks recording.
 */
export function createVoiceDetector(): VoiceDetector {
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;
  let _lastVoiceAtMs = Date.now();

  return {
    setup(stream: MediaStream): void {
      _lastVoiceAtMs = Date.now();
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        audioCtx = new Ctor();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = ANALYSER_FFT_SIZE;
        source.connect(analyser);
        buffer = new Float32Array(new ArrayBuffer(ANALYSER_FFT_SIZE * 4));
      } catch {
        /* Analyser is best-effort; idle auto-stop simply won't fire. */
      }
    },

    resetIdleTimer(): void {
      _lastVoiceAtMs = Date.now();
    },

    sample(now: number): void {
      const a = analyser;
      const b = buffer;
      if (!a || !b) return;
      a.getFloatTimeDomainData(b);
      let sumSquares = 0;
      for (let i = 0; i < b.length; i++) sumSquares += b[i] * b[i];
      if (Math.sqrt(sumSquares / b.length) >= VOICE_RMS_THRESHOLD) {
        _lastVoiceAtMs = now;
      }
    },

    teardown(): void {
      if (analyser) {
        try {
          analyser.disconnect();
        } catch {
          /* best-effort */
        }
        analyser = null;
      }
      buffer = null;
      if (audioCtx) {
        const ctx = audioCtx;
        audioCtx = null;
        void ctx.close().catch(() => {
          /* best-effort */
        });
      }
    },

    get lastVoiceAtMs(): number {
      return _lastVoiceAtMs;
    },

    get analyser(): AnalyserNode | null {
      return analyser;
    },
  };
}
