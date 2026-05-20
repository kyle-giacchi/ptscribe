import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { transcribe } from '@/services/ai/transcribe';
import { AiCallError as AiCallErrorClass, friendlyAiError } from '@/services/ai/errors';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { useActionGuard, MAX_TRANSCRIBES_PER_SESSION } from '@/hooks/useActionGuard';
import { useBackgroundTranscription } from '@/hooks/useBackgroundTranscription';
import type { Session, SessionClip, Settings } from '@/types';

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
  setEditedTranscript?: (next: string) => void;
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
}

export interface UseTranscriptionFlowResult {
  mergedAudioBlob: Blob | null;
  setMergedAudioBlob: (b: Blob | null) => void;
  silencedMergedBlob: Blob | null;
  setSilencedMergedBlob: (b: Blob | null) => void;
  isMerging: boolean;
  setIsMerging: (v: boolean) => void;
  debugStats: DebugStats | null;
  transcribeUsed: number;
  generateUsed: number;
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
  handleCreateTranscript: (clipId?: string) => Promise<void>;
  handleRevertToLocal: () => void;
  aiError: AiCallErrorClass | null;
  retryStatus: { provider: 'anthropic' | 'nova'; attempt: number; max: number } | null;
  clearAiError: () => void;
}

/**
 * Owns the explicit cloud (Nova) transcription action, action-guard counters,
 * the revert-to-local helper, and the merged audio blob states for the review tab.
 *
 * Background local-Whisper transcription is handled separately by
 * useBackgroundTranscription, which is called internally here so that the
 * hook ordering invariant in Session.tsx is preserved.
 *
 * "Improve with AI" flow:
 *   silencedMergedBlob → optional speed-up → single Nova request → session.t3Transcript
 *
 * Speed-up is applied here (not pre-computed) so the sped-up audio is never
 * stored and is only generated when the user explicitly requests cloud
 * transcription.
 */
export function useTranscriptionFlow(
  params: UseTranscriptionFlowParams,
): UseTranscriptionFlowResult {
  const {
    session,
    settings,
    setTranscript,
    setEditedTranscript,
    patchSession,
    setBusy,
  } = params;

  const [mergedAudioBlob, setMergedAudioBlob] = useState<Blob | null>(null);
  // Silence-removed combined blob — produced by handleRecordingComplete and
  // used as the audio source for both T2 (Whisper) and T3 (Nova).
  const [silencedMergedBlob, setSilencedMergedBlob] = useState<Blob | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null);
  const [aiError, setAiError] = useState<AiCallErrorClass | null>(null);
  const [retryStatus, setRetryStatus] = useState<
    { provider: 'anthropic' | 'nova'; attempt: number; max: number } | null
  >(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const { checkActionGuard, recordAction, transcribeUsed, generateUsed } = useActionGuard();

  // Background local-Whisper pass: runs automatically when silencedMergedBlob
  // becomes available. Must be initialised before useRecordingFlow in Session.tsx.
  useBackgroundTranscription({ session, patchSession, setTranscript, silencedMergedBlob });

  // ── Cloud (Nova) pass ─────────────────────────────────────────────────────

  async function handleCreateTranscript(_clipId?: string) {
    if (!session) return;

    if (!silencedMergedBlob) {
      toast.error('No audio to transcribe yet. Record or upload audio first.');
      return;
    }

    const guard = checkActionGuard('transcribe');
    if (!guard.allowed) {
      toast.error(guard.reason);
      return;
    }

    setAiError(null);
    setRetryStatus(null);
    setBusy('transcribing');
    patchSession({ status: 'transcribing' });

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 180_000);
    try {
      // Apply speed-up to the combined silenced blob if the setting is enabled.
      // This is the only place speed-up is generated — never pre-computed.
      let blobToSend: Blob = silencedMergedBlob;
      let speedReport: { savedSec: number; originalSec: number } | undefined;

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
          /* speed-up failure must never block transcription */
        }
      }

      const result = await transcribe({
        blob: blobToSend,
        provider: 'cloudflare',
        model: '@cf/deepgram/nova-3',
        signal: controller.signal,
        onRetry: (info) =>
          setRetryStatus({ provider: 'nova', attempt: info.attempt, max: info.max }),
      });

      setRetryStatus(null);
      const text = result.text?.trim() ?? '';
      if (text) {
        setTranscript(text);
        setEditedTranscript?.('');
        // t3Transcript frozen here — t2Transcript is preserved untouched
        patchSession({
          transcript: text,
          t3Transcript: text,
          activeTranscriptTier: 't3',
          status: 'draft',
          editedTranscript: undefined,
        });
        recordAction('transcribe');
        setDebugStats({
          droppedSec: 0,
          originalSec: 0,
          speedSavedSec: speedReport?.savedSec ?? 0,
          speedOriginalSec: speedReport?.originalSec ?? 0,
        });
        toast.success('Transcription complete.');
      } else {
        patchSession({ status: 'draft' });
        toast.error('Transcription returned no text. Try again or check your audio.');
      }
    } catch (e) {
      setRetryStatus(null);
      patchSession({ status: 'draft' });
      if ((e as Error).name === 'AbortError') {
        // user-initiated cancel; no UI noise
      } else if (e instanceof AiCallErrorClass) {
        setAiError(e);
        toast.error(friendlyAiError(e).title);
      } else {
        toast.error(`Transcription failed: ${(e as Error).message}`);
      }
    } finally {
      clearTimeout(abortTimer);
      setBusy(null);
    }
  }

  function handleRevertToLocal() {
    const t2 = session?.t2Transcript;
    const t1 = session?.t1Transcript;
    const text = t2 || t1;
    if (text?.trim()) {
      setTranscript(text);
      setEditedTranscript?.('');
      patchSession({
        transcript: text,
        activeTranscriptTier: t2 ? 't2' : 't1',
        editedTranscript: undefined,
      });
      toast.success('Reverted to local transcription.');
    } else {
      toast.error('No local transcription to revert to.');
    }
  }

  return {
    mergedAudioBlob,
    setMergedAudioBlob,
    silencedMergedBlob,
    setSilencedMergedBlob,
    isMerging,
    setIsMerging,
    debugStats,
    transcribeUsed,
    generateUsed,
    checkActionGuard,
    recordAction,
    handleCreateTranscript,
    handleRevertToLocal,
    aiError,
    retryStatus,
    clearAiError: () => setAiError(null),
  };
}

export { MAX_TRANSCRIBES_PER_SESSION };
