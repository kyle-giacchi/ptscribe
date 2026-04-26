import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'error';

export interface UseRecorder {
  status: RecorderStatus;
  error: string | null;
  durationSec: number;
  blob: Blob | null;
  start: () => Promise<void>;
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

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setError('Microphone access is not available in this browser.');
      setStatus('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
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
      recorder.start(1000);
      tickStart();
      setStatus('recording');
    } catch (e) {
      setError((e as Error).message || 'Could not access microphone');
      setStatus('error');
      teardown();
    }
  }, [teardown, tickStart]);

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
