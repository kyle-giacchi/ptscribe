import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API live transcription.
 *
 * Browser support is uneven (Chrome / Edge work; Firefox / Safari are spotty).
 * We treat it as a best-effort live caption — the Cloudflare Whisper path
 * produces the canonical transcript at session end.
 */

type SpeechRec = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecCtor = new () => SpeechRec;

function getCtor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface TranscriptSegment {
  text: string;
  elapsedSec: number;
  wallTime: number;
}

export interface UseWebSpeechTranscript {
  supported: boolean;
  listening: boolean;
  accumulatedText: string;
  interimText: string;
  segments: TranscriptSegment[];
  error: string | null;
  start: (getElapsedSec?: () => number) => void;
  stop: () => void;
  reset: () => void;
}

export function useWebSpeechTranscript(): UseWebSpeechTranscript {
  const [listening, setListening] = useState(false);
  const [accumulatedText, setAccumulatedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const isMountedRef = useRef(true);
  const getElapsedSecRef = useRef<(() => number) | undefined>(undefined);
  // Tracks the next final-result index we expect so Chrome's "flush-all" events
  // (which replay old results with resultIndex=0) don't create duplicate bubbles.
  const nextFinalIdxRef = useRef<number>(0);
  const Ctor = getCtor();
  const supported = Ctor !== null;

  useEffect(
    () => () => {
      isMountedRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
      recRef.current = null;
    },
    [],
  );

  const start = useCallback(
    (getElapsedSec?: () => number) => {
      if (!Ctor) {
        setError('Live transcription is not supported in this browser.');
        return;
      }
      getElapsedSecRef.current = getElapsedSec;
      nextFinalIdxRef.current = 0;
      setError(null);
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.onresult = (e) => {
        if (!isMountedRef.current) return;
        let interim = '';
        let appended = '';
        const startIdx = Math.max(e.resultIndex, nextFinalIdxRef.current);
        for (let i = startIdx; i < e.results.length; i += 1) {
          const r = e.results[i];
          const text = r[0].transcript;
          if (r.isFinal) {
            appended += text;
            nextFinalIdxRef.current = i + 1;
          } else {
            interim += text;
          }
        }
        if (appended) {
          const elapsedSec = getElapsedSecRef.current?.() ?? 0;
          const wallTime = Date.now();
          setAccumulatedText((prev) => (prev + ' ' + appended).trim());
          setSegments((prev) => [...prev, { text: appended.trim(), elapsedSec, wallTime }]);
        }
        setInterimText(interim);
      };
      rec.onerror = (ev) => {
        if (!isMountedRef.current) return;
        setError(ev.error || 'speech error');
      };
      rec.onend = () => {
        if (!isMountedRef.current) return;
        setListening(false);
        setInterimText('');
      };
      rec.start();
      recRef.current = rec;
      setListening(true);
    },
    [Ctor],
  );

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    nextFinalIdxRef.current = 0;
    setAccumulatedText('');
    setInterimText('');
    setSegments([]);
    setError(null);
  }, []);

  return {
    supported,
    listening,
    accumulatedText,
    interimText,
    segments,
    error,
    start,
    stop,
    reset,
  };
}
