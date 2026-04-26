import { useCallback, useEffect, useRef, useState } from 'react';
import { audioRepository } from '@/services/AudioRepository';

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
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
];

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
  }, []);

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
    [teardown, tickStart],
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
  }, [teardown]);

  return { status, error, durationSec, blob, start, pause, resume, stop, reset };
}
