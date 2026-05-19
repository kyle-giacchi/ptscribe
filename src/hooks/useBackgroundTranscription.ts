import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { audioRepository } from '@/services/AudioRepository';
import { blobToFloat32, transcribeFloat32Parallel, LOCAL_WHISPER_DEFAULT_MODEL, getWhisperPreloadPromise } from '@/services/ai/client/localWhisper';
import { findSpeechRangesML } from '@/lib/audio/vadML';
import { extractRanges } from '@/lib/audio/silenceTrim';
import { DEFAULT_VAD_OPTIONS } from '@/lib/audio/vad';
import type { Session, SessionClip, TranscriptChunk } from '@/types';

const LOCAL_CHUNK_SEC = 120; // 2-minute segments — each maps to a real audio timestamp

// After a transient failure (network error, worker crash), wait this long before
// retrying. Keeps the badge stable while the Whisper model finishes downloading.
const RETRY_DELAY_MS = 3_000;
// Stop auto-retrying after this many transient failures per clip per session.
// 8 attempts × 3 s = 24 s — enough to cover a typical HuggingFace model download.
const MAX_AUTO_RETRIES = 8;

/**
 * Local-first transcription pipeline for the background auto-pass.
 *
 * Pipeline: chunk original audio at 2-min boundaries → VAD per chunk →
 * Whisper per chunk (parallel). Chunking first preserves real timestamps so
 * chunk i always starts at i * LOCAL_CHUNK_SEC seconds in the recording. VAD
 * runs per-chunk so silence within each bucket is still stripped.
 *
 * Returns structured { startSec, text } chunks so the transcript view can
 * render timestamp headers at real audio positions.
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
      // extractRanges returns a new buffer; chunkAudio is a subarray of samples —
      // must slice so each chunk owns its buffer before transferring to the worker.
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

/** Best-available text per clip: Whisper result > local Whisper > live Web Speech. */
function buildBestAvailableTranscript(clips: SessionClip[]): string {
  return [...clips]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => (c.transcript || c.t2Transcript || c.t1Transcript)?.trim())
    .filter((t): t is string => Boolean(t))
    .join('\n\n');
}

interface Params {
  session: Session | undefined;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  patchSession: (patch: Partial<Session>) => void;
  setTranscript: (next: string) => void;
}

/**
 * Automatically transcribes every newly-saved clip using local Whisper,
 * regardless of the configured provider. Fires in the background after each
 * clip reaches 'ready' status — no user action required.
 *
 * Results are stored in t2Transcript (frozen after this pass) and merged
 * into the session transcript at Tier 2. Cloud (Nova) transcription is a
 * separate explicit action handled by useTranscriptionFlow.
 *
 * See docs/invariants.md — "Local-first transcription".
 */
export function useBackgroundTranscription({ session, patchClip, patchSession, setTranscript }: Params): void {
  const { addNotification } = useNotifications();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Tracks clips currently being auto-transcribed (or waiting in backoff) to
  // prevent the effect from re-triggering an immediate retry when patchClip
  // changes session.clips. Released on success, or after RETRY_DELAY_MS on
  // transient failure (up to MAX_AUTO_RETRIES times).
  const autoTranscribingRef = useRef(new Set<string>());
  // Tracks how many transient retries each clip has consumed this session.
  const retryCountRef = useRef(new Map<string, number>());
  // Bumped by retry timers so the effect re-runs after each backoff period
  // without requiring an external session.clips change to trigger it.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!session) return;

    const eligible = session.clips.filter(
      (c) =>
        c.status === 'ready' &&
        !c.t2Transcript &&
        !autoTranscribingRef.current.has(c.id),
    );
    if (eligible.length === 0) return;

    for (const clip of eligible) {
      autoTranscribingRef.current.add(clip.id);
      // Don't set 'transcribing' yet — wait for the Whisper model to be ready
      // so the clip doesn't appear stuck while the model is still downloading.

      audioRepository
        .load(clip.id)
        .then(async (original) => {
          if (!original) throw new Error('No audio found for this clip.');
          await getWhisperPreloadPromise();
          patchClip(clip.id, { status: 'transcribing', errorMessage: undefined });
          return transcribeWithLocalWhisper(original);
        })
        .then((result) => {
          if (result.ok) {
            autoTranscribingRef.current.delete(clip.id);
            retryCountRef.current.delete(clip.id);
            patchClip(clip.id, {
              status: 'transcribed',
              transcript: result.text,
              t2Transcript: result.text,
              transcriptChunks: result.chunks,
              transcriptedAt: Date.now(),
              errorMessage: undefined,
            });
            // sessionRef has the latest clip list; override this clip's text directly
            // to avoid a race with the React state update that follows patchClip above.
            const freshClips = (sessionRef.current?.clips ?? []).map((c) =>
              c.id === clip.id
                ? { ...c, status: 'transcribed' as const, transcript: result.text }
                : c,
            );
            // Use fallback-aware merge so that failed clips' t1Transcripts
            // are not dropped when this clip's Whisper result comes in.
            const merged = buildBestAvailableTranscript(freshClips);
            if (merged) {
              setTranscript(merged);
              // t2Transcript frozen here — never overwritten by cloud pass
              patchSession({ transcript: merged, activeTranscriptTier: 't2', t2Transcript: merged });
            }
          } else if (result.error !== 'Aborted.') {
            // Permanent content failure (no speech, audio too short, Whisper returned
            // nothing). clip.id intentionally stays in autoTranscribingRef so the next
            // patchClip re-render doesn't trigger a retry — retrying won't help here.
            patchClip(clip.id, { status: 'ready', errorMessage: undefined });
            addNotification('warning', `Clip ${clip.index + 1}: automatic transcription found no usable audio. Use Transcribe to retry with cloud.`);
            // Fall back to t1Transcript so the session doesn't lose this clip's content.
            const fallback = buildBestAvailableTranscript(sessionRef.current?.clips ?? []);
            if (fallback) {
              setTranscript(fallback);
              patchSession({ transcript: fallback, activeTranscriptTier: 't1' });
            }
          }
        })
        .catch((e: Error) => {
          // Transient failure — network error, worker crash, or model still downloading.
          // Revert the clip to 'ready' but keep clip.id in autoTranscribingRef during
          // the backoff window so the immediate patchClip re-render doesn't re-trigger
          // the effect and produce a rapid ready↔transcribing flicker. After the delay,
          // release the guard and bump retryTick to schedule one more attempt.
          patchClip(clip.id, { status: 'ready', errorMessage: undefined });
          // Fall back to t1Transcript so the session doesn't lose this clip's content.
          const fallback = buildBestAvailableTranscript(sessionRef.current?.clips ?? []);
          if (fallback) {
            setTranscript(fallback);
            patchSession({ transcript: fallback, activeTranscriptTier: 't1' });
          }

          const retries = (retryCountRef.current.get(clip.id) ?? 0) + 1;
          if (retries <= MAX_AUTO_RETRIES) {
            retryCountRef.current.set(clip.id, retries);
            // Release the guard after the backoff, then wake the effect for a retry.
            // Notifications are suppressed during retries — only shown when giving up.
            setTimeout(() => {
              autoTranscribingRef.current.delete(clip.id);
              setRetryTick((t) => t + 1);
            }, RETRY_DELAY_MS);
          } else {
            // Max retries exhausted — clip.id stays in ref so no more auto-attempts.
            // Notify once so the user knows to use cloud transcription.
            const isFetchError = e.message.toLowerCase().includes('fetch') || e.message.toLowerCase().includes('network');
            if (isFetchError) {
              addNotification('error', 'Whisper model unavailable — use the Transcribe button for cloud transcription.');
            } else {
              addNotification('error', `Clip ${clip.index + 1}: automatic transcription failed. Use Transcribe to retry.`);
            }
          }
        });
    }
    // addNotification is stable (useCallback); patchClip / patchSession / setTranscript
    // use functional updates — safe to omit from deps. retryTick is included so retry
    // timers can re-run the effect without needing an external session.clips change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.clips, retryTick]);
}
