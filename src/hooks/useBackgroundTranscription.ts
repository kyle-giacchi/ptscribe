import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { blobToFloat32, transcribeFloat32Parallel, LOCAL_WHISPER_DEFAULT_MODEL, getWhisperPreloadPromise } from '@/services/ai/client/localWhisper';
import { findSpeechRangesML } from '@/lib/audio/vadML';
import { extractRanges } from '@/lib/audio/silenceTrim';
import { DEFAULT_VAD_OPTIONS } from '@/lib/audio/vad';
import type { Session, TranscriptChunk } from '@/types';

const LOCAL_CHUNK_SEC = 120; // 2-minute segments — each maps to a real audio timestamp

const RETRY_DELAY_MS = 3_000;
const MAX_AUTO_RETRIES = 8;

/**
 * Local-first transcription pipeline for the background auto-pass.
 *
 * Pipeline: chunk audio at 2-min boundaries → VAD per chunk →
 * Whisper per chunk (parallel). Chunking preserves real timestamps so chunk i
 * always starts at i * LOCAL_CHUNK_SEC seconds. VAD runs per-chunk so any
 * residual silence within each bucket is still stripped.
 */
async function transcribeWithLocalWhisper(
  blob: Blob,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<{ ok: true; text: string; chunks: TranscriptChunk[] } | { ok: false; error: string }> {
  const SR = 16000;

  onProgress?.('Decoding audio…');
  const samples = await blobToFloat32(blob);

  if (samples.length < SR * 0.5) {
    return { ok: false, error: 'Audio too short.' };
  }

  const chunkLen = SR * LOCAL_CHUNK_SEC;
  const numChunks = Math.ceil(samples.length / chunkLen);

  onProgress?.('Detecting speech…');
  const speechChunks: { startSec: number; audio: Float32Array }[] = [];
  for (let i = 0; i < numChunks; i++) {
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
}: Params): void {
  const { addNotification } = useNotifications();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const hasRunRef = useRef(false);
  const retryCountRef = useRef(0);
  // Bumped by retry timers to re-trigger the effect after each backoff period.
  const [retryTick, setRetryTick] = useState(0);

  // Reset run-guards whenever the combined blob changes so T2 re-runs
  // automatically after the user adds new clips and calls buildMergedAudioForReview.
  useEffect(() => {
    hasRunRef.current = false;
    retryCountRef.current = 0;
  }, [silencedMergedBlob]);

  useEffect(() => {
    if (!session || !silencedMergedBlob || hasRunRef.current) return;

    hasRunRef.current = true;

    getWhisperPreloadPromise()
      .then(() => transcribeWithLocalWhisper(silencedMergedBlob))
      .then((result) => {
        // Don't overwrite a cloud (T3) result if Nova ran while Whisper was processing.
        if (sessionRef.current?.t3Transcript) return;

        if (result.ok) {
          setTranscript(result.text);
          patchSession({
            transcript: result.text,
            activeTranscriptTier: 't2',
            t2Transcript: result.text,
          });
        } else if (result.error !== 'Aborted.') {
          addNotification(
            'warning',
            'Automatic transcription found no usable audio. Use Improve with AI to retry with cloud.',
          );
        }
      })
      .catch((e: Error) => {
        const retries = retryCountRef.current + 1;
        if (retries <= MAX_AUTO_RETRIES) {
          retryCountRef.current = retries;
          hasRunRef.current = false;
          setTimeout(() => setRetryTick((t) => t + 1), RETRY_DELAY_MS);
        } else {
          const isFetchError =
            e.message.toLowerCase().includes('fetch') ||
            e.message.toLowerCase().includes('network');
          if (isFetchError) {
            addNotification(
              'error',
              'Whisper model unavailable — use Improve with AI for cloud transcription.',
            );
          } else {
            addNotification(
              'error',
              'Automatic transcription failed. Use Improve with AI to retry.',
            );
          }
        }
      });

    // addNotification is stable; patchSession / setTranscript use functional
    // updates — safe to omit. retryTick re-triggers after each backoff period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silencedMergedBlob, retryTick]);
}
