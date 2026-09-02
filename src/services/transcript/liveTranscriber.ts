import { recordLiveWhisperChunk, recordLiveWhisperDrop } from '@/lib/debug/liveWhisperStats';

/**
 * The T1 live-preview engine, lifted out of `useCapturePhase`.
 *
 * Deep behaviour, small interface: callers `push()` recorder chunks while
 * recording and `flush()` once at every stop point (pause, finish). Only one
 * transcription runs at a time — the newest pending chunk wins and anything it
 * displaces is a counted silent drop (leaky bucket). `flush()` is the single
 * drain rule: it was written twice, inconsistently, inside the hook.
 *
 * React-free on purpose: `transcribe` is injected so the whole thing runs in
 * jsdom, and text is reported out through `onText` rather than a setState.
 */
export interface LiveTranscriber {
  /** Feed a recorder chunk. Non-blocking; transcription happens off to the side. */
  push(blob: Blob): void;
  /**
   * Wait for the in-flight chunk and run the last pending one, then return the
   * full joined transcript. Callers MUST stop feeding chunks first
   * (`recorder.onChunk.current = null`) — this does not guard a racing push.
   * ponytail: no push/flush interlock; the two callers both null the sink first.
   */
  flush(): Promise<string>;
  /** Drop accumulated text + any pending chunk. Call when a new recording starts. */
  reset(): void;
  /** Current joined transcript, synchronously. */
  text(): string;
}

interface LiveTranscriberOptions {
  transcribe: (blob: Blob) => Promise<{ text: string }>;
  /** Fired after every chunk that yields text, with the full segment list. */
  onText: (segments: string[]) => void;
}

export function createLiveTranscriber({
  transcribe,
  onText,
}: LiveTranscriberOptions): LiveTranscriber {
  let segments: string[] = [];
  let running = false;
  let pending: Blob | null = null;
  let chain: Promise<void> = Promise.resolve();

  async function drain(): Promise<void> {
    const blob = pending;
    if (!blob) {
      running = false;
      return;
    }
    pending = null;
    const startedAt = performance.now();
    try {
      const result = await transcribe(blob);
      recordLiveWhisperChunk(performance.now() - startedAt, blob.size);
      const text = result.text.trim();
      if (text) {
        segments = [...segments, text];
        onText(segments);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[liveTranscriber] chunk failed:', err);
      }
    }
    if (pending) return drain();
    running = false;
  }

  return {
    push(blob) {
      // Leaky bucket: the newest chunk replaces the pending one. Whatever it
      // overwrites was never transcribed — that is the drop we count.
      if (pending) recordLiveWhisperDrop();
      pending = blob;
      if (running) return;
      running = true;
      chain = drain();
    },

    async flush() {
      await chain;
      if (pending && !running) {
        running = true;
        chain = drain();
        await chain;
      }
      pending = null;
      return segments.join(' ');
    },

    reset() {
      segments = [];
      pending = null;
    },

    text() {
      return segments.join(' ');
    },
  };
}
