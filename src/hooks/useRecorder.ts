import { useCallback, useEffect, useRef, useState } from 'react';
import { audioRepository } from '@/services/AudioRepository';
import { acquireWakeLock, releaseWakeLock } from '@/lib/wakeLock';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'error';

export interface UseRecorder {
  status: RecorderStatus;
  error: string | null;
  durationSec: number;
  blob: Blob | null;
  /** Begin a recording for the given clipId. Resolves to `true` if recording started, `false` if the mic could not be acquired. */
  start: (clipId: string) => Promise<boolean>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob | null>;
  reset: () => void;
  /**
   * True if the tab was hidden (Page Visibility API) at any point since the last
   * `start`. Sticky for the lifetime of the current recording session and
   * cleared by `reset`. Recording continues while hidden, but on mobile the OS
   * may have throttled/killed the recorder; clinicians should verify duration.
   */
  wasBackgrounded: boolean;
}

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

// MediaRecorder timeslice. Each tick fires `ondataavailable` and writes one
// chunk row to IDB so a tab crash loses at most this many seconds of audio.
// 5s balances IDB write rate (~12/min) against worst-case loss window.
const CHUNK_TIMESLICE_MS = 5000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/**
 * Owns three resources for the lifetime of each clip: the `MediaRecorder`,
 * a `'screen'` `WakeLockSentinel`, and a `visibilitychange` listener. All
 * three must be released on every exit path (stop, reset, error, unmount)
 * via `teardown()`. Wake lock is best-effort and never blocks recording.
 * See docs/invariants.md#recorder-lifecycle-wake-lock--visibility.
 */
export function useRecorder(): UseRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const chunkIndexRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const stopResolveRef = useRef<((b: Blob | null) => void) | null>(null);

  const [wasBackgrounded, setWasBackgrounded] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  const detachVisibilityHandler = useCallback(() => {
    if (typeof document === 'undefined') return;
    const handler = visibilityHandlerRef.current;
    if (!handler) return;
    document.removeEventListener('visibilitychange', handler);
    visibilityHandlerRef.current = null;
  }, []);

  const attachVisibilityHandler = useCallback(() => {
    if (typeof document === 'undefined') return;
    detachVisibilityHandler();
    const handler = () => {
      if (document.hidden) {
        setWasBackgrounded(true);
        return;
      }
      // Returned to foreground. Re-acquire wake lock only if we are still
      // actively recording — the browser auto-released it when we hid.
      const r = recorderRef.current;
      if (!r || r.state !== 'recording') return;
      void acquireWakeLock().then((sentinel) => {
        if (!sentinel) return;
        if (recorderRef.current?.state !== 'recording') {
          // We stopped between acquire and resolve; release immediately.
          void releaseWakeLock(sentinel);
          return;
        }
        wakeLockRef.current = sentinel;
      });
    };
    visibilityHandlerRef.current = handler;
    document.addEventListener('visibilitychange', handler);
  }, [detachVisibilityHandler]);

  const teardown = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    recorderRef.current = null;
    if (wakeLockRef.current) {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      void releaseWakeLock(sentinel);
    }
    detachVisibilityHandler();
  }, [detachVisibilityHandler]);

  useEffect(() => () => teardown(), [teardown]);

  const tickStart = useCallback(() => {
    startedAtRef.current = Date.now();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const live = (Date.now() - startedAtRef.current) / 1000;
      setDurationSec(accumulatedRef.current + live);
    }, 250);
  }, []);

  const tickPause = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    accumulatedRef.current += (Date.now() - startedAtRef.current) / 1000;
    setDurationSec(accumulatedRef.current);
  }, []);

  const start = useCallback(
    async (clipId: string) => {
      setError(null);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        setError('Microphone access is not available in this browser.');
        setStatus('error');
        return false;
      }
      try {
        // Drop any chunks left over from a prior interrupted recording for this
        // clipId — otherwise crash-recovery on next mount would replay stale audio.
        await audioRepository.clearChunks(clipId).catch(() => {
          /* best-effort; recording can still proceed */
        });

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        chunkIndexRef.current = 0;
        recorder.ondataavailable = (e) => {
          if (!e.data || e.data.size === 0) return;
          chunksRef.current.push(e.data);
          const index = chunkIndexRef.current;
          chunkIndexRef.current += 1;
          // Fire-and-forget: in-memory chunks remain the fast path for stop().
          // IDB persistence is the durable backup for tab-crash recovery.
          audioRepository.appendChunk(clipId, index, e.data).catch(() => {
            /* best-effort */
          });
        };
        recorder.onstop = () => {
          const finalBlob = new Blob(chunksRef.current, {
            type: mimeType || 'audio/webm',
          });
          setBlob(finalBlob);
          setStatus('stopped');
          if (stopResolveRef.current) {
            stopResolveRef.current(finalBlob);
            stopResolveRef.current = null;
          }
          teardown();
        };
        recorder.onerror = (e) => {
          setError((e as ErrorEvent).message || 'Recorder error');
          setStatus('error');
          teardown();
        };
        recorderRef.current = recorder;
        accumulatedRef.current = 0;
        setDurationSec(0);
        setBlob(null);
        recorder.start(CHUNK_TIMESLICE_MS);
        // Best-effort: keep screen awake while recording. Browsers auto-release
        // on visibilitychange; the handler below re-acquires on return.
        void acquireWakeLock().then((sentinel) => {
          if (!sentinel) return;
          // If recording already ended between acquire and resolve, drop it.
          if (recorderRef.current !== recorder) {
            void releaseWakeLock(sentinel);
            return;
          }
          wakeLockRef.current = sentinel;
        });
        attachVisibilityHandler();
        setWasBackgrounded(false);
        tickStart();
        setStatus('recording');
        return true;
      } catch (e) {
        setError((e as Error).message || 'Could not access microphone');
        setStatus('error');
        teardown();
        return false;
      }
    },
    [teardown, tickStart, attachVisibilityHandler],
  );

  const pause = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state !== 'recording') return;
    r.pause();
    tickPause();
    setStatus('paused');
  }, [tickPause]);

  const resume = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state !== 'paused') return;
    r.resume();
    tickStart();
    setStatus('recording');
  }, [tickStart]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state === 'inactive') return Promise.resolve(blob);
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      tickPause();
      r.stop();
    });
  }, [blob, tickPause]);

  const reset = useCallback(() => {
    teardown();
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setDurationSec(0);
    setBlob(null);
    setError(null);
    setStatus('idle');
    setWasBackgrounded(false);
  }, [teardown]);

  return {
    status,
    error,
    durationSec,
    blob,
    start,
    pause,
    resume,
    stop,
    reset,
    wasBackgrounded,
  };
}
