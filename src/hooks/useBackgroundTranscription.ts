import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { audioRepository } from '@/services/AudioRepository';
import { blobToFloat32, transcribeFloat32Parallel, LOCAL_WHISPER_DEFAULT_MODEL } from '@/services/ai/client/localWhisper';
import { findSpeechRangesML } from '@/lib/audio/vadML';
import { extractRanges } from '@/lib/audio/silenceTrim';
import { DEFAULT_VAD_OPTIONS } from '@/lib/audio/vad';
import type { Session, SessionClip, TranscriptChunk } from '@/types';

const LOCAL_CHUNK_SEC = 120; // 2-minute segments — each maps to a real audio timestamp

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
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Tracks which clips are currently being auto-transcribed to prevent duplicate runs.
  const autoTranscribingRef = useRef(new Set<string>());

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
      patchClip(clip.id, { status: 'transcribing', errorMessage: undefined });
      const tid = toast.loading(`Transcribing clip ${clip.index + 1}…`, { duration: Infinity });

      audioRepository
        .load(clip.id)
        .then((original) => {
          if (!original) throw new Error('No audio found for this clip.');
          return transcribeWithLocalWhisper(original, (msg) => toast.loading(msg, { id: tid }));
        })
        .then((result) => {
          autoTranscribingRef.current.delete(clip.id);
          if (result.ok) {
            patchClip(clip.id, {
              status: 'transcribed',
              transcript: result.text,
              t2Transcript: result.text,
              transcriptChunks: result.chunks,
              transcriptedAt: Date.now(),
              errorMessage: undefined,
            });
            toast.success(`Clip ${clip.index + 1} transcribed.`, { id: tid });
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
          } else {
            patchClip(clip.id, { status: 'failed', errorMessage: result.error });
            toast.error(`Clip ${clip.index + 1}: ${result.error}`, { id: tid });
            // Fall back to t1Transcript so the session doesn't lose this clip's content.
            const fallback = buildBestAvailableTranscript(sessionRef.current?.clips ?? []);
            if (fallback) {
              setTranscript(fallback);
            patchSession({ transcript: fallback, activeTranscriptTier: 't1' });
            }
          }
        })
        .catch((e: Error) => {
          autoTranscribingRef.current.delete(clip.id);
          patchClip(clip.id, { status: 'failed', errorMessage: e.message });
          toast.error(`Clip ${clip.index + 1}: ${e.message}`, { id: tid });
          // Fall back to t1Transcript so the session doesn't lose this clip's content.
          const fallback = buildBestAvailableTranscript(sessionRef.current?.clips ?? []);
          if (fallback) {
            setTranscript(fallback);
            patchSession({ transcript: fallback, activeTranscriptTier: 't1' });
          }
        });
    }
    // patchClip / patchSession / setTranscript use functional updates — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.clips]);
}
