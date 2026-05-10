import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { audioRepository } from '@/services/AudioRepository';
import { transcribe } from '@/services/ai/transcribe';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { mergeClipTranscripts, getTranscribableClips } from '@/utils/clips';
import { useActionGuard, MAX_TRANSCRIBES_PER_SESSION } from '@/hooks/useActionGuard';
import type { ClipStatus, Session, SessionClip, Settings } from '@/types';

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
  runLocalTranscription: (clipId: string, blob: Blob) => Promise<void>;
  handleCreateTranscript: (clipId?: string) => Promise<void>;
  handleRevertToLocal: () => void;
  handleRemergeFromClips: () => void;
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

  const { checkActionGuard, recordAction, transcribeUsed, generateUsed } = useActionGuard();

  // ── Local auto-transcription (always runs in background after any clip is saved) ──
  async function runLocalTranscription(clipId: string, blob: Blob): Promise<void> {
    patchClip(clipId, { status: 'transcribing', updatedAt: Date.now() });
    try {
      const { transcribeLocally, LOCAL_WHISPER_DEFAULT_MODEL } = await import(
        '@/services/ai/client/localWhisper'
      );
      const result = await transcribeLocally(blob, LOCAL_WHISPER_DEFAULT_MODEL);
      const text = result.text.trim();
      if (text) {
        patchClip(clipId, {
          status: 'transcribed',
          transcript: text,
          localTranscript: text,
          transcriptedAt: Date.now(),
          errorMessage: undefined,
        });
        const otherMerged = mergeClipTranscripts(
          (sessionRef.current?.clips ?? []).filter((c) => c.id !== clipId),
        );
        const merged = [otherMerged, text].filter(Boolean).join('\n\n');
        setTranscript(merged);
        patchSession({ transcript: merged, transcriptSource: 'whisper' });
      } else {
        patchClip(clipId, { status: 'ready', updatedAt: Date.now() });
      }
    } catch {
      patchClip(clipId, { status: 'ready', updatedAt: Date.now() });
      // Deduplicated by toast ID — only one notice shown even across multiple clips.
      toast.info('Background transcription unavailable — tap Transcribe to use cloud.', {
        id: 'local-whisper-fail',
      });
    }
  }

  // ── Transcription ────────────────────────────────────────────────────────
  async function transcribeClipBlob(
    clip: SessionClip,
    onProgress?: (msg: string) => void,
    useNova?: boolean,
    signal?: AbortSignal,
  ): Promise<
    | {
        ok: true;
        text: string;
        trimReport?: { droppedSec: number; originalSec: number };
        speedReport?: { savedSec: number; originalSec: number };
      }
    | { ok: false; error: string }
  > {
    try {
      const original = await audioRepository.load(clip.id);
      if (!original) return { ok: false, error: 'No audio found for this clip.' };

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

      const result = await transcribe({
        blob: blobToSend,
        provider: useNova ? 'cloudflare' : settings.ai.transcription.provider,
        model: useNova ? '@cf/deepgram/nova-3' : settings.ai.transcription.model,
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

      const merged = [...session.clips]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((c) => textByClip.get(c.id))
        .filter((t): t is string => Boolean(t && t.trim()))
        .join('\n\n');

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

  function handleRemergeFromClips() {
    if (!session) return;
    const merged = mergeClipTranscripts(session.clips);
    if (!merged) {
      toast.error('No transcribed clips to merge.');
      return;
    }
    setTranscript(merged);
    patchSession({ transcript: merged, transcriptSource: 'whisper' });
    toast.success('Transcript re-merged from clips.');
  }

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
    runLocalTranscription,
    handleCreateTranscript,
    handleRevertToLocal,
    handleRemergeFromClips,
  };
}

export { MAX_TRANSCRIBES_PER_SESSION };
