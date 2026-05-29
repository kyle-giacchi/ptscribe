import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { blobToFloat32, transcribeFloat32Parallel, LOCAL_WHISPER_DEFAULT_MODEL, WhisperExhaustedError } from '@/services/ai/client/localWhisper';
import { promoteTier } from '@/services/transcript/promoteTier';
import { findSpeechRangesML } from '@/lib/audio/vadML';
import { extractRanges } from '@/lib/audio/silenceTrim';
import { DEFAULT_VAD_OPTIONS } from '@/lib/audio/vad';
import { appendAiError } from '@/lib/debug/aiErrorLog';
import type { Session, TranscriptChunk } from '@/types';

const LOCAL_CHUNK_SEC = 120; // 2-minute segments — each maps to a real audio timestamp

const RETRY_DELAY_MS = 3_000;
const MAX_AUTO_RETRIES = 1; // 1 auto-retry; after that surface error to user

export type T2Phase = 'idle' | 'transcribing' | 'retrying' | 'done' | 'error';

export interface BackgroundT2State {
  phase: T2Phase;
  progressLabel: string;
  retry: () => void;
}

/**
 * Local-first transcription pipeline for the background auto-pass.
 *
 * Pipeline: chunk audio at 2-min boundaries → VAD per chunk →
 * Whisper per chunk (parallel). Chunking preserves real timestamps so chunk i
 * always starts at i * LOCAL_CHUNK_SEC seconds. VAD runs per-chunk so any
 * residual silence within each bucket is still stripped.
 */
export async function transcribeWithLocalWhisper(
  blob: Blob,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<{ ok: true; text: string; chunks: TranscriptChunk[] } | { ok: false; error: string }> {
  const SR = 16000;

  if (signal?.aborted) return { ok: false, error: 'Aborted.' };

  onProgress?.('Decoding audio…');
  const samples = await blobToFloat32(blob);

  if (signal?.aborted) return { ok: false, error: 'Aborted.' };

  if (samples.length < SR * 0.5) {
    return { ok: false, error: 'Audio too short.' };
  }

  const chunkLen = SR * LOCAL_CHUNK_SEC;
  const numChunks = Math.ceil(samples.length / chunkLen);

  onProgress?.('Detecting speech…');
  const speechChunks: { startSec: number; audio: Float32Array }[] = [];
  for (let i = 0; i < numChunks; i++) {
    if (signal?.aborted) return { ok: false, error: 'Aborted.' };
    const startSample = i * chunkLen;
    const chunkAudio = samples.subarray(startSample, Math.min(startSample + chunkLen, samples.length));
    const startSec = i * LOCAL_CHUNK_SEC;

    let speech: Float32Array;
    try {
      const ranges = await findSpeechRangesML(chunkAudio, SR, DEFAULT_VAD_OPTIONS);
      speech = ranges.length > 0 ? extractRanges(chunkAudio, SR, ranges) : chunkAudio.slice();
    } catch {
      speech = chunkAudio.slice();
    }

    if (speech.length >= SR * 0.5) {
      speechChunks.push({ startSec, audio: speech });
    }
  }

  if (speechChunks.length === 0) {
    return { ok: false, error: 'No speech detected in audio.' };
  }

  const label = (n: number, total: number) =>
    total > 1 ? `Transcribing ${n}/${total} chunks…` : 'Transcribing…';
  onProgress?.(label(0, speechChunks.length));

  const texts = await transcribeFloat32Parallel(
    speechChunks.map((c) => c.audio),
    LOCAL_WHISPER_DEFAULT_MODEL,
    (done, total) => { onProgress?.(label(done, total)); },
  );

  if (signal?.aborted) return { ok: false, error: 'Aborted.' };

  const chunks: TranscriptChunk[] = speechChunks
    .map((c, i) => ({ startSec: c.startSec, text: (texts[i] ?? '').trim() }))
    .filter((c) => c.text);

  if (chunks.length === 0) {
    return { ok: false, error: 'Whisper returned no text.' };
  }

  return { ok: true, text: chunks.map((c) => c.text).join(' '), chunks };
}

interface Params {
  session: Session | undefined;
  patchSession: (patch: Partial<Session>) => void;
  setTranscript: (next: string) => void;
  /** The silence-removed combined audio blob produced by buildMergedAudioForReview. */
  silencedMergedBlob: Blob | null;
}

/**
 * Automatically transcribes the combined session audio using local Whisper
 * once the silence-removed merged blob is available — no user action required.
 *
 * Runs at session level (one pass on the full combined clip) rather than
 * per-clip. Results are stored in session.t2Transcript and merged into the
 * active transcript at Tier 2. Cloud (Nova) transcription is a separate
 * explicit action handled by useTranscriptionFlow.
 *
 * Resets and re-runs whenever silencedMergedBlob changes (new clip added).
 */
export function useBackgroundTranscription({
  session,
  patchSession,
  setTranscript,
  silencedMergedBlob,
}: Params): BackgroundT2State {
  const { addNotification } = useNotifications();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [phase, setPhase] = useState<T2Phase>('idle');
  const [progressLabel, setProgressLabel] = useState('');

  const hasRunRef = useRef(false);
  const retryCountRef = useRef(0);
  // Tracks the AbortController for the in-flight pass so a blob change or
  // unmount can cancel it before a new pass starts.
  const abortRef = useRef<AbortController | null>(null);
  // Bumped by retry timers to re-trigger the effect after each backoff period.
  const [retryTick, setRetryTick] = useState(0);

  // Reset run-guards whenever the combined blob changes so T2 re-runs
  // automatically after the user adds new clips and calls buildMergedAudioForReview.
  // Aborting first cancels any pass tied to the previous blob; this reset effect
  // runs before the main effect on the same change, so abort-then-recreate is the
  // correct sequence. Phase transitions are driven by the main effect below.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    hasRunRef.current = false;
    retryCountRef.current = 0;
  }, [silencedMergedBlob]);

  // Abort any in-flight pass on unmount so no post-unmount setState occurs.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!session || !silencedMergedBlob || hasRunRef.current) return;

    hasRunRef.current = true;
    setPhase('transcribing');
    setProgressLabel('');

    const controller = new AbortController();
    abortRef.current = controller;

    transcribeWithLocalWhisper(silencedMergedBlob!, (msg) => setProgressLabel(msg), controller.signal)
      .then((result) => {
        // Pass was superseded (blob changed) or the hook unmounted — drop it
        // so no stale setTranscript/patchSession/setPhase write occurs.
        if (controller.signal.aborted) return;
        if (result.ok) {
          // promoteTier owns the ordering rule: a fresh T2 may not clobber a
          // higher tier (T3) that produced output while Whisper was processing.
          const promo = promoteTier(sessionRef.current ?? {}, { tier: 't2', text: result.text });
          if (!promo) {
            setPhase('done');
            return;
          }
          setTranscript(result.text);
          patchSession({ ...promo, t2Transcript: result.text });
          setPhase('done');
        } else if (result.error !== 'Aborted.') {
          // Content error (no speech, too short) — notify and treat as done
          addNotification(
            'warning',
            'Automatic transcription found no usable audio. Use Improve with AI to retry with cloud.',
          );
          patchSession({
            aiErrors: appendAiError(sessionRef.current?.aiErrors, {
              call: 'transcribe-local',
              kind: 'empty',
              detail: `Local Whisper produced no usable transcript: ${result.error}`,
            }),
          });
          setPhase('done');
        } else {
          setPhase('done');
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof WhisperExhaustedError) {
          setPhase('error');
          setProgressLabel('');
          // WhisperExhaustedError == the local model failed to load (R2→HF
          // fetch + worker init exhausted), so this is a model-fetch failure.
          patchSession({
            aiErrors: appendAiError(sessionRef.current?.aiErrors, {
              call: 'model-fetch',
              kind: 'network',
              detail: 'Local Whisper model failed to load (R2→HuggingFace fetch exhausted).',
            }),
          });
          return;
        }
        const retries = retryCountRef.current + 1;
        if (retries <= MAX_AUTO_RETRIES) {
          retryCountRef.current = retries;
          hasRunRef.current = false;
          setPhase('retrying');
          setProgressLabel('Retrying…');
          setTimeout(() => setRetryTick((t) => t + 1), RETRY_DELAY_MS);
        } else {
          setPhase('error');
          setProgressLabel('');
          patchSession({
            aiErrors: appendAiError(sessionRef.current?.aiErrors, {
              call: 'transcribe-local',
              kind: 'parse',
              detail: `Local Whisper failed after auto-retry: ${(err as Error).message}`,
            }),
          });
        }
      });

    // addNotification is stable; patchSession / setTranscript use functional
    // updates — safe to omit. retryTick re-triggers after each backoff period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silencedMergedBlob, retryTick]);

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    hasRunRef.current = false;
    setRetryTick((t) => t + 1);
  }, []);

  return { phase, progressLabel, retry };
}
