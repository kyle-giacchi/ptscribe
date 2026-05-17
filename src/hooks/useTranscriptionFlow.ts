import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { audioRepository } from '@/services/AudioRepository';
import { transcribe } from '@/services/ai/transcribe';
import { blobToFloat32, transcribeFloat32Parallel, LOCAL_WHISPER_DEFAULT_MODEL } from '@/services/ai/client/localWhisper';
import { findSpeechRangesML } from '@/lib/audio/vadML';
import { extractRanges } from '@/lib/audio/silenceTrim';
import { DEFAULT_VAD_OPTIONS } from '@/lib/audio/vad';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { mergeClipTranscripts, getTranscribableClips } from '@/utils/clips';
import { useActionGuard, MAX_TRANSCRIBES_PER_SESSION } from '@/hooks/useActionGuard';
import type { ClipStatus, Session, SessionClip, Settings, TranscriptChunk } from '@/types';

export interface DebugStats {
  droppedSec: number;
  originalSec: number;
  speedSavedSec: number;
  speedOriginalSec: number;
}

export interface UseTranscriptionFlowParams {
  session: Session | undefined;
  settings: Settings;
  setTranscript: (next: string) => void;
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
}

export interface UseTranscriptionFlowResult {
  // State exposed for UI
  mergedAudioBlob: Blob | null;
  setMergedAudioBlob: (b: Blob | null) => void;
  isMerging: boolean;
  setIsMerging: (v: boolean) => void;
  debugStats: DebugStats | null;
  // Action-guard counters (passed through from useActionGuard)
  transcribeUsed: number;
  generateUsed: number;
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
  // Handlers
  handleCreateTranscript: (clipId?: string) => Promise<void>;
  handleRevertToLocal: () => void;
}

const LOCAL_CHUNK_SEC = 120; // 2-minute segments — each maps to a real audio timestamp

/**
 * Local-first transcription pipeline used by the background auto-pass.
 *
 * Pipeline: chunk original audio at 2-min boundaries → VAD per chunk →
 * Whisper per chunk (parallel). Chunking the original audio first preserves
 * real timestamps: chunk i always starts at i * LOCAL_CHUNK_SEC seconds in
 * the recording. VAD runs per-chunk so silence within each bucket is still
 * stripped before Whisper sees it.
 *
 * Returns structured { startSec, text } chunks so the transcript view can
 * render timestamp headers at real audio positions instead of word-count
 * estimates.
 *
 * See docs/invariants.md — "Local-first transcription".
 */
async function transcribeLocalChunked(
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

  // Split original audio into 2-min windows; VAD each window independently.
  // Chunking first ensures chunk i starts at exactly i * LOCAL_CHUNK_SEC seconds.
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
      speech = ranges.length > 0 ? extractRanges(chunkAudio, SR, ranges) : chunkAudio;
    } catch {
      speech = chunkAudio;
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

/**
 * Owns transcription state + handlers for a session: the local-Whisper
 * background pass triggered after each clip save, the explicit cloud
 * transcribe loop (Nova) bound to the action guard, and the merge/revert
 * helpers used by TranscriptPanel. Also owns the `mergedAudioBlob`/`isMerging`
 * state that RecordingPanel consumes for review-tab playback.
 */
export function useTranscriptionFlow(
  params: UseTranscriptionFlowParams,
): UseTranscriptionFlowResult {
  const {
    session,
    settings,
    setTranscript,
    patchSession,
    patchClips,
    patchClip,
    setBusy,
  } = params;

  const [mergedAudioBlob, setMergedAudioBlob] = useState<Blob | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null);

  // Always tracks the latest session so async callbacks read fresh clips, not a stale closure.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Tracks which clips are currently being auto-transcribed to prevent duplicate runs.
  const autoTranscribingRef = useRef(new Set<string>());
  // Ref so the background-pass effect always calls the latest closure.
  const transcribeClipBlobRef = useRef<typeof transcribeClipBlob>(transcribeClipBlob);

  const { checkActionGuard, recordAction, transcribeUsed, generateUsed } = useActionGuard();

  // ── Transcription ────────────────────────────────────────────────────────
  async function transcribeClipBlob(
    clip: SessionClip,
    onProgress?: (msg: string) => void,
    useNova?: boolean,
    signal?: AbortSignal,
    forceLocal?: boolean,
  ): Promise<
    | {
        ok: true;
        text: string;
        chunks?: TranscriptChunk[];
        trimReport?: { droppedSec: number; originalSec: number };
        speedReport?: { savedSec: number; originalSec: number };
      }
    | { ok: false; error: string }
  > {
    try {
      const original = await audioRepository.load(clip.id);
      if (!original) return { ok: false, error: 'No audio found for this clip.' };

      // Local-first background pass: VAD silence extraction + chunked Whisper.
      // See docs/invariants.md — "Local-first transcription".
      if (forceLocal && !useNova) {
        return await transcribeLocalChunked(original, onProgress, signal);
      }

      let blobToSend: Blob = original;
      let trimReport: { droppedSec: number; originalSec: number } | undefined;
      let speedReport: { savedSec: number; originalSec: number } | undefined;

      const sd = settings.audio.silenceDetection;
      if (sd.enabled) {
        try {
          const trimResult = await trimSilence(original, {
            sensitivity: sd.sensitivity,
            padMs: sd.padMs,
          });
          blobToSend = trimResult.trimmed;
          trimReport = {
            droppedSec: trimResult.report.droppedSec,
            originalSec: trimResult.report.originalSec,
          };
        } catch {
          // Trim failure must never block transcription — fall back to original.
          blobToSend = original;
        }
      }

      const su = settings.audio.speedUp;
      if (su.enabled) {
        try {
          const speedResult = await speedUpAudio(blobToSend, su.speed as SpeedFactor);
          blobToSend = speedResult.result;
          speedReport = {
            savedSec: speedResult.report.savedSec,
            originalSec: speedResult.report.originalSec,
          };
        } catch {
          // Speed-up failure must never block transcription — fall back as-is.
        }
      }

      const effectiveProvider = useNova ? 'cloudflare' : forceLocal ? 'local' : settings.ai.transcription.provider;
      const effectiveModel = useNova
        ? '@cf/deepgram/nova-3'
        : forceLocal && settings.ai.transcription.provider !== 'local'
          ? LOCAL_WHISPER_DEFAULT_MODEL
          : settings.ai.transcription.model;
      const result = await transcribe({
        blob: blobToSend,
        provider: effectiveProvider,
        model: effectiveModel,
        onProgress,
        signal,
      });
      return { ok: true, text: result.text, trimReport, speedReport };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async function runTranscribeLoop(
    pending: SessionClip[],
    transcribed: SessionClip[],
    useNova?: boolean,
    signal?: AbortSignal,
  ): Promise<{
    textByClip: Map<string, string>;
    successes: number;
    failures: number;
    totalDroppedSec: number;
    totalOriginalSec: number;
    totalSpeedSavedSec: number;
    totalSpeedOriginalSec: number;
  }> {
    const textByClip = new Map<string, string>();
    for (const c of transcribed) {
      if (c.transcript) textByClip.set(c.id, c.transcript);
    }
    let successes = 0;
    let failures = 0;
    let totalDroppedSec = 0;
    let totalOriginalSec = 0;
    let totalSpeedSavedSec = 0;
    let totalSpeedOriginalSec = 0;
    await Promise.allSettled(
      pending.map(async (clip) => {
        const result = await transcribeClipBlob(clip, undefined, useNova, signal);
        if (result.ok) {
          successes += 1;
          textByClip.set(clip.id, result.text);
          if (result.trimReport) {
            totalDroppedSec += result.trimReport.droppedSec;
            totalOriginalSec += result.trimReport.originalSec;
          }
          if (result.speedReport) {
            totalSpeedSavedSec += result.speedReport.savedSec;
            totalSpeedOriginalSec += result.speedReport.originalSec;
          }
          patchClip(clip.id, {
            status: 'transcribed',
            transcript: result.text,
            transcriptChunks: useNova ? undefined : result.chunks,
            transcriptedAt: Date.now(),
            errorMessage: undefined,
          });
        } else {
          failures += 1;
          patchClip(clip.id, { status: 'failed', errorMessage: result.error });
        }
      }),
    );
    return {
      textByClip,
      successes,
      failures,
      totalDroppedSec,
      totalOriginalSec,
      totalSpeedSavedSec,
      totalSpeedOriginalSec,
    };
  }

  function reportTranscribeOutcome(successes: number, failures: number) {
    if (successes > 0 && failures === 0) {
      toast.success(`Transcribed ${successes} clip${successes === 1 ? '' : 's'} and merged.`);
    } else if (successes > 0 && failures > 0) {
      toast.error(
        `${successes} transcribed, ${failures} failed. Try again to retry the failed clips.`,
      );
    } else {
      toast.error('Transcription failed for all clips.');
    }
  }

  async function handleCreateTranscript(clipId?: string) {
    if (!session) return;

    const guard = checkActionGuard('transcribe');
    if (!guard.allowed) {
      toast.error(guard.reason);
      return;
    }

    // Include locally-transcribed clips (localTranscript === transcript means nova hasn't run yet)
    const pending = getTranscribableClips(session.clips).filter(
      (c) => clipId == null || c.id === clipId,
    );
    const transcribed = session.clips.filter(
      (c) => c.status === 'transcribed' && !pending.some((p) => p.id === c.id),
    );

    if (pending.length === 0 && transcribed.length === 0) {
      toast.error('No clips to transcribe yet.');
      return;
    }

    if (pending.length === 0) {
      const merged = mergeClipTranscripts(session.clips);
      setTranscript(merged);
      patchSession({ transcript: merged, transcriptSource: 'whisper' });
      toast.success('Transcript merged from existing clips.');
      return;
    }

    setBusy('transcribing');
    patchSession({ status: 'transcribing' });
    patchClips((clips) =>
      clips.map((c) =>
        pending.some((t) => t.id === c.id)
          ? {
              ...c,
              status: 'transcribing' as ClipStatus,
              errorMessage: undefined,
              updatedAt: Date.now(),
            }
          : c,
      ),
    );

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 180_000);
    try {
      const {
        textByClip,
        successes,
        failures,
        totalDroppedSec,
        totalOriginalSec,
        totalSpeedSavedSec,
        totalSpeedOriginalSec,
      } = await runTranscribeLoop(pending, transcribed, true, controller.signal);

      const merged = mergeClipTranscripts(
        session.clips.map((c) => {
          const t = textByClip.get(c.id);
          return t ? { ...c, status: 'transcribed' as const, transcript: t } : c;
        }),
      );

      if (merged) {
        setTranscript(merged);
        patchSession({ transcript: merged, transcriptSource: 'whisper', status: 'draft' });
      } else {
        patchSession({ status: 'draft' });
      }

      recordAction('transcribe');
      setDebugStats({
        droppedSec: totalDroppedSec,
        originalSec: totalOriginalSec,
        speedSavedSec: totalSpeedSavedSec,
        speedOriginalSec: totalSpeedOriginalSec,
      });
      reportTranscribeOutcome(successes, failures);
      if (totalDroppedSec > 1) {
        const pct = Math.round((totalDroppedSec / Math.max(totalOriginalSec, 1)) * 100);
        toast.info(
          `Silence trimming saved ${Math.round(totalDroppedSec)}s (~${pct}%) before transcription.`,
        );
      }
      if (totalSpeedSavedSec > 1) {
        const pct = Math.round((totalSpeedSavedSec / Math.max(totalSpeedOriginalSec, 1)) * 100);
        toast.info(
          `Audio speed-up saved ${Math.round(totalSpeedSavedSec)}s (~${pct}%) before transcription.`,
        );
      }
    } finally {
      clearTimeout(abortTimer);
      setBusy(null);
    }
  }

  function handleRevertToLocal() {
    const clips = session?.clips ?? [];
    const reverted = clips.map((c) =>
      c.localTranscript
        ? { ...c, transcript: c.localTranscript, status: 'transcribed' as ClipStatus }
        : c,
    );
    patchClips(() => reverted);
    const merged = mergeClipTranscripts(reverted);
    if (merged.trim()) {
      setTranscript(merged);
      patchSession({ transcript: merged, transcriptSource: 'whisper' });
    }
    toast.success('Reverted to local transcription.');
  }

  transcribeClipBlobRef.current = transcribeClipBlob;

  // Background local-Whisper pass: automatically transcribes every newly-saved clip
  // regardless of the configured provider.  This is intentional — local Whisper
  // always runs first so the Review tab populates without any manual action, and
  // the result is stored in localTranscript.  Cloud transcription (Nova-3) is a
  // separate explicit user action that upgrades over the local result.
  // See docs/invariants.md — "Local-first transcription".
  useEffect(() => {
    if (!session) return;

    const eligible = session.clips.filter(
      (c) =>
        c.status === 'ready' &&
        !c.localTranscript &&
        !autoTranscribingRef.current.has(c.id),
    );
    if (eligible.length === 0) return;

    for (const clip of eligible) {
      autoTranscribingRef.current.add(clip.id);
      patchClip(clip.id, { status: 'transcribing', errorMessage: undefined });
      const tid = toast.loading(`Transcribing clip ${clip.index + 1}…`, { duration: Infinity });

      transcribeClipBlobRef
        .current(clip, (msg) => toast.loading(msg, { id: tid }), false, undefined, true)
        .then((result) => {
          autoTranscribingRef.current.delete(clip.id);
          if (result.ok) {
            patchClip(clip.id, {
              status: 'transcribed',
              transcript: result.text,
              localTranscript: result.text,
              transcriptChunks: result.chunks,
              transcriptedAt: Date.now(),
              errorMessage: undefined,
            });
            toast.success(`Clip ${clip.index + 1} transcribed.`, { id: tid });

            // Merge fresh result with other clips. sessionRef has the latest clip list;
            // override this clip's text directly to avoid a race with the React state
            // update that follows patchClip above.
            const freshClips = (sessionRef.current?.clips ?? []).map((c) =>
              c.id === clip.id ? { ...c, status: 'transcribed' as const, transcript: result.text } : c,
            );
            const merged = mergeClipTranscripts(freshClips);
            if (merged) {
              setTranscript(merged);
              patchSession({ transcript: merged, transcriptSource: 'whisper' });
            }
          } else {
            patchClip(clip.id, { status: 'failed', errorMessage: result.error });
            toast.error(`Clip ${clip.index + 1}: ${result.error}`, { id: tid });
          }
        })
        .catch((e: Error) => {
          autoTranscribingRef.current.delete(clip.id);
          patchClip(clip.id, { status: 'failed', errorMessage: e.message });
          toast.error(`Clip ${clip.index + 1} transcription failed.`, { id: tid });
        });
    }
    // patchClip / patchSession / setTranscript use functional updates — safe to omit.
    // transcribeClipBlobRef is a stable ref — intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.clips]);

  return {
    mergedAudioBlob,
    setMergedAudioBlob,
    isMerging,
    setIsMerging,
    debugStats,
    transcribeUsed,
    generateUsed,
    checkActionGuard,
    recordAction,
    handleCreateTranscript,
    handleRevertToLocal,
  };
}

export { MAX_TRANSCRIBES_PER_SESSION };
