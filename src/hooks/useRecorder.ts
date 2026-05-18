import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { audioRepository } from '@/services/AudioRepository';
import { acquireWakeLock, releaseWakeLock } from '@/lib/wakeLock';
import { createVoiceDetector, type VoiceDetector } from '@/lib/audio/voiceDetector';
import type { RecordingLimitsSettings } from '@/types';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'error';

export interface UseRecorderOptions {
  limits?: RecordingLimitsSettings;
}

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
  /** Sticky once duration crosses softWarnAtMinutes; reset on `reset`. */
  softWarnReached: boolean;
  /** Set when the recorder auto-stopped because duration crossed maxMinutes. */
  hardCapStopped: boolean;
  /** Set when the recorder auto-stopped after sustained silence past idleAutoStopMinutes. */
  idleAutoStopped: boolean;
  /** Set when the MediaRecorder was killed unexpectedly (OS suspended the tab). Audio from in-memory chunks is saved automatically. */
  recorderInterrupted: boolean;
  /** Set when the microphone track ended mid-recording (device disconnected, permission revoked). Audio from in-memory chunks is saved automatically. */
  micDisconnected: boolean;
  /** Live AnalyserNode from the voice detector — non-null while recording, null otherwise. */
  analyser: AnalyserNode | null;
  /**
   * Set this ref's `.current` to receive the accumulated audio blob on every
   * MediaRecorder chunk tick (~5 s intervals). The blob spans all chunks from
   * the start of the clip (capped at the last 3 min so Whisper stays fast).
   * Clear it to stop receiving callbacks.
   */
  onChunk: MutableRefObject<((blob: Blob, mimeType: string) => void) | null>;
}

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

// MediaRecorder timeslice. Each tick fires `ondataavailable` and writes one
// chunk row to IDB so a tab crash loses at most this many seconds of audio.
// 5s balances IDB write rate (~12/min) against worst-case loss window.
const CHUNK_TIMESLICE_MS = 5000;

// How often the heartbeat checks that MediaRecorder is still alive while we
// expect it to be recording. Catches silent death when onstop never fires.
const HEARTBEAT_INTERVAL_MS = 3000;

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
export function useRecorder(options: UseRecorderOptions = {}): UseRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [softWarnReached, setSoftWarnReached] = useState(false);
  const [hardCapStopped, setHardCapStopped] = useState(false);
  const [idleAutoStopped, setIdleAutoStopped] = useState(false);
  const [recorderInterrupted, setRecorderInterrupted] = useState(false);
  const [micDisconnected, setMicDisconnected] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const chunkIndexRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const stopResolveRef = useRef<((b: Blob | null) => void) | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while we expect the recorder to be active; guards unexpected-stop detection. */
  const shouldBeRecordingRef = useRef(false);
  /** Mime type of the current recording, saved for blob reconstruction in interruption paths. */
  const currentMimeRef = useRef('audio/webm');

  // ── Pause-triggered segment recorder (Whisper live preview) ─────────────────
  // A separate short-lived MediaRecorder on the same stream captures each natural
  // utterance as a standalone, independently decodable blob sent to Whisper.
  const segmentRecRef = useRef<MediaRecorder | null>(null);
  const isSpeakingRef = useRef(false);
  const segmentStartAtRef = useRef(0);

  const voiceDetectorRef = useRef<VoiceDetector>(createVoiceDetector());

  const limitsRef = useRef<RecordingLimitsSettings | undefined>(options.limits);
  useEffect(() => {
    limitsRef.current = options.limits;
  }, [options.limits]);

  // Exposed so callers can subscribe to accumulated-audio callbacks without re-creating the recorder.
  const onChunkRef = useRef<((blob: Blob, mimeType: string) => void) | null>(null);

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

  const teardown = useCallback(() => {
    shouldBeRecordingRef.current = false;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    voiceDetectorRef.current.teardown();
    if (segmentRecRef.current) {
      try { segmentRecRef.current.stop(); } catch { /* best-effort */ }
      segmentRecRef.current = null;
    }
    isSpeakingRef.current = false;
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
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    // Resolve any in-flight stop() Promise so callers don't hang on reset/error/unmount.
    if (stopResolveRef.current) {
      stopResolveRef.current(null);
      stopResolveRef.current = null;
    }
    detachVisibilityHandler();
  }, [detachVisibilityHandler]);

  useEffect(() => () => teardown(), [teardown]);

  const tickStart = useCallback(() => {
    startedAtRef.current = Date.now();
    // Restart the silence-grace window on every (re)start so a paused-then-
    // resumed clip can't auto-stop the instant resume runs.
    voiceDetectorRef.current.resetIdleTimer();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const now = Date.now();
      const live = (now - startedAtRef.current) / 1000;
      const total = accumulatedRef.current + live;
      setDurationSec(total);
      const limits = limitsRef.current;

      // Sample voice level before limit checks so lastVoiceAtMs stays fresh
      // even when no limits are configured (the analyser is cheap).
      voiceDetectorRef.current.sample(now);

      // ── Pause-triggered segment recording ──────────────────────────────────
      const silenceMs = now - voiceDetectorRef.current.lastVoiceAtMs;
      const liveStream = streamRef.current;
      const mime = currentMimeRef.current;
      if (!isSpeakingRef.current && silenceMs < 200 && liveStream) {
        // Voice just started — open a new segment recorder
        try {
          const seg = new MediaRecorder(liveStream, mime ? { mimeType: mime } : undefined);
          seg.ondataavailable = (ev) => {
            if (ev.data.size > 0) onChunkRef.current?.(ev.data, mime);
          };
          seg.start();
          segmentRecRef.current = seg;
          segmentStartAtRef.current = now;
          isSpeakingRef.current = true;
        } catch { /* best-effort — never break main recording */ }
      } else if (isSpeakingRef.current) {
        const segAge = now - segmentStartAtRef.current;
        if (silenceMs > 800 || segAge > 15_000) {
          const seg = segmentRecRef.current;
          segmentRecRef.current = null;
          isSpeakingRef.current = false;
          try { seg?.stop(); } catch { /* best-effort */ }
          // Rotate immediately on max-length if speech is still live
          if (segAge > 15_000 && silenceMs < 200 && liveStream) {
            try {
              const seg2 = new MediaRecorder(liveStream, mime ? { mimeType: mime } : undefined);
              seg2.ondataavailable = (ev) => {
                if (ev.data.size > 0) onChunkRef.current?.(ev.data, mime);
              };
              seg2.start();
              segmentRecRef.current = seg2;
              segmentStartAtRef.current = now;
              isSpeakingRef.current = true;
            } catch { /* best-effort */ }
          }
        }
      }

      if (!limits) return;
      const totalMin = total / 60;
      if (totalMin >= limits.softWarnAtMinutes) {
        setSoftWarnReached(true);
      }
      if (totalMin >= limits.maxMinutes) {
        const r = recorderRef.current;
        if (r && r.state !== 'inactive') {
          setHardCapStopped(true);
          r.stop();
        }
        return;
      }
      if (limits.idleAutoStopMinutes > 0) {
        const idleMin = (now - voiceDetectorRef.current.lastVoiceAtMs) / 60000;
        if (idleMin >= limits.idleAutoStopMinutes) {
          const r = recorderRef.current;
          if (r && r.state !== 'inactive') {
            setIdleAutoStopped(true);
            r.stop();
          }
        }
      }
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

  /**
   * Builds the final blob from whatever in-memory chunks exist and transitions
   * to stopped state. Called when the recorder dies unexpectedly — either the
   * OS suspended the tab (backgrounded) or the microphone track ended.
   * `shouldBeRecordingRef` is the guard against double-firing.
   */
  const finalizeInterrupted = useCallback(
    (micEnded: boolean) => {
      if (!shouldBeRecordingRef.current) return;
      shouldBeRecordingRef.current = false;
      tickPause();
      if (micEnded) {
        setMicDisconnected(true);
      } else {
        setRecorderInterrupted(true);
      }
      const chunks = chunksRef.current;
      const mime = currentMimeRef.current;
      if (chunks.length > 0) {
        const finalBlob = new Blob(chunks, { type: mime });
        setBlob(finalBlob);
        if (stopResolveRef.current) {
          stopResolveRef.current(finalBlob);
          stopResolveRef.current = null;
        }
      } else if (stopResolveRef.current) {
        stopResolveRef.current(null);
        stopResolveRef.current = null;
      }
      setStatus('stopped');
      teardown();
    },
    [tickPause, teardown],
  );

  const attachVisibilityHandler = useCallback(() => {
    if (typeof document === 'undefined') return;
    detachVisibilityHandler();
    const handler = () => {
      if (document.hidden) {
        setWasBackgrounded(true);
        return;
      }
      // Returned to foreground.
      if (shouldBeRecordingRef.current) {
        const r = recorderRef.current;
        if (!r || r.state === 'inactive') {
          // Recorder died while backgrounded — finalize from in-memory chunks.
          finalizeInterrupted(false);
          return;
        }
      }
      // Recorder still alive — re-acquire wake lock only if actively recording.
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
  }, [detachVisibilityHandler, finalizeInterrupted]);

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

        // Wire a track-ended listener on every audio track. The 'ended' event fires
        // when the microphone is disconnected or the browser revokes the stream.
        for (const track of stream.getTracks()) {
          track.addEventListener('ended', () => finalizeInterrupted(true), { once: true });
        }

        voiceDetectorRef.current.setup(stream);

        const mimeType = pickMimeType();
        currentMimeRef.current = mimeType ?? 'audio/webm';
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
          // onChunk is now driven by the pause-triggered segment recorder in the tick,
          // which produces clean standalone blobs per utterance. Main recorder is IDB only.
        };
        recorder.onstop = () => {
          if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
          }
          const finalBlob = new Blob(chunksRef.current, {
            type: mimeType || 'audio/webm',
          });
          setBlob(finalBlob);
          setStatus('stopped');
          if (stopResolveRef.current) {
            // Intentional stop via our stop() call — resolve the waiting promise.
            stopResolveRef.current(finalBlob);
            stopResolveRef.current = null;
          } else if (shouldBeRecordingRef.current) {
            // Browser stopped the recorder unexpectedly before the visibility
            // handler or heartbeat could catch it. Mark as interrupted so
            // useRecordingFlow can finalize the clip.
            shouldBeRecordingRef.current = false;
            setRecorderInterrupted(true);
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
        setSoftWarnReached(false);
        setHardCapStopped(false);
        setIdleAutoStopped(false);
        setRecorderInterrupted(false);
        setMicDisconnected(false);
        recorder.start(CHUNK_TIMESLICE_MS);
        shouldBeRecordingRef.current = true;
        audioRepository
          .saveChunkMime(clipId, recorder.mimeType || mimeType || 'audio/webm')
          .catch(() => {
            /* best-effort */
          });
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
        // Heartbeat: periodically verify the recorder is still alive. Catches
        // silent death on desktop (OOM, unusual browser behavior) that neither
        // onstop nor visibilitychange fires for.
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (!shouldBeRecordingRef.current) return;
          const r = recorderRef.current;
          if (!r || r.state === 'inactive') finalizeInterrupted(false);
        }, HEARTBEAT_INTERVAL_MS);
        setStatus('recording');
        return true;
      } catch (e) {
        setError((e as Error).message || 'Could not access microphone');
        setStatus('error');
        teardown();
        return false;
      }
    },
    [teardown, tickStart, attachVisibilityHandler, finalizeInterrupted],
  );

  const pause = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state !== 'recording') return;
    r.pause();
    tickPause();
    // Stop the in-flight segment so Whisper processes what was captured before the pause.
    if (segmentRecRef.current) {
      try { segmentRecRef.current.stop(); } catch { /* best-effort */ }
      segmentRecRef.current = null;
    }
    isSpeakingRef.current = false;
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
    shouldBeRecordingRef.current = false;
    const r = recorderRef.current;
    if (!r || r.state === 'inactive') return Promise.resolve(blob);
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      tickPause();
      r.stop();
      // Safety net: if onstop never fires (browser bug, unusual state), resolve
      // from whatever in-memory chunks exist so the caller never hangs forever.
      stopTimeoutRef.current = setTimeout(() => {
        const cb = stopResolveRef.current;
        if (!cb) return;
        stopResolveRef.current = null;
        const fallback = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: currentMimeRef.current })
          : null;
        cb(fallback);
      }, 8000);
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
    setSoftWarnReached(false);
    setHardCapStopped(false);
    setIdleAutoStopped(false);
    setRecorderInterrupted(false);
    setMicDisconnected(false);
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
    softWarnReached,
    hardCapStopped,
    idleAutoStopped,
    recorderInterrupted,
    micDisconnected,
    analyser: voiceDetectorRef.current.analyser,
    onChunk: onChunkRef,
  };
}
