import { useCallback, useEffect } from 'react';
import type { Dispatch } from 'react';
import { toast } from 'sonner';
import { transcribe } from '@/services/ai/transcribe';
import { promoteTier } from '@/services/transcript/promoteTier';
import { AiCallError, friendlyAiError } from '@/services/ai/errors';
import { appendAiError } from '@/lib/debug/aiErrorLog';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { isDemoMode } from '@/lib/demoMode';
import { useBackgroundTranscription } from './useBackgroundTranscription';
import type { BackgroundT2State } from './useBackgroundTranscription';
import { MAX_TRANSCRIBES_PER_SESSION, type useActionGuard } from './useActionGuard';
import type { SessionMachineAction } from './sessionMachine/types';
import type { Session, Settings } from '@/types';

export interface UseTranscriptSourceParams {
  session: Session | undefined;
  silencedMergedBlob: Blob | null;
  settings: Settings;
  patchSession: (patch: Partial<Session>) => void;
  dispatch: Dispatch<SessionMachineAction>;
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
}

export interface TranscriptSourceResult {
  backgroundT2: BackgroundT2State;
  runT3: (_clipId?: string) => Promise<void>;
  revertToLocal: () => void;
  clearTranscribeAiError: () => void;
}

/**
 * Owns the transcript tier lifecycle for a session:
 *   - T2: auto-fires local Whisper when silencedMergedBlob is available
 *   - T3: cloud Nova on explicit user action ("Improve with AI")
 *   - Revert: falls back to T2 → T1
 *
 * Mirrors T2 phase into the machine reducer so T2 errors are part of
 * the testable machine state, not just notification side-effects.
 */
export function useTranscriptSource({
  session,
  silencedMergedBlob,
  settings,
  patchSession,
  dispatch,
  checkActionGuard,
  recordAction,
}: UseTranscriptSourceParams): TranscriptSourceResult {
  // The transcript document lives in the machine reducer; tier producers write
  // the baseline through dispatch. useBackgroundTranscription keeps its narrow
  // setTranscript param (internal seam) and receives a dispatch-backed adapter.
  const setBaseline = useCallback(
    (text: string) => dispatch({ type: 'transcript/setBaseline', text }),
    [dispatch],
  );
  const clearEdited = useCallback(
    () => dispatch({ type: 'transcript/setEdited', text: '' }),
    [dispatch],
  );

  const backgroundT2 = useBackgroundTranscription({
    session,
    patchSession,
    setTranscript: setBaseline,
    silencedMergedBlob,
  });

  // Mirror T2 phase into the reducer so machine state is testable.
  // 'retrying' maps to 'running' — it's still an active pipeline pass.
  useEffect(() => {
    const { phase } = backgroundT2;
    if (phase === 'transcribing' || phase === 'retrying') dispatch({ type: 't2/start' });
    else if (phase === 'done') dispatch({ type: 't2/done' });
    else if (phase === 'error') dispatch({ type: 't2/error' });
    // backgroundT2 object is recreated each render; depend only on phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundT2.phase, dispatch]);

  const runT3 = useCallback(
    async (_clipId?: string) => {
      // Demo-mode hard rule: cloud Nova is unreachable. This guard wins before any
      // session/blob check so a demo build can never bill Nova. See CLAUDE.md hard rules.
      if (isDemoMode()) {
        toast.error('Cloud transcription is disabled in demo mode.');
        return;
      }
      if (!session) return;
      if (!silencedMergedBlob) {
        toast.error('No audio to transcribe yet. Record or upload audio first.');
        return;
      }

      // Lifetime cap is session-backed (persisted) so it survives reload, Revert,
      // and Unlock. CONTEXT.md §Cloud-transcription cap. Absent count reads as 0.
      const spent = session.cloudTranscribeCount ?? 0;
      if (spent >= MAX_TRANSCRIBES_PER_SESSION) {
        toast.error('Cloud transcription was already used for this session.');
        return;
      }
      // checkActionGuard now enforces only the 3-second cooldown for transcription.
      const guard = checkActionGuard('transcribe');
      if (!guard.allowed) {
        toast.error(guard.reason);
        return;
      }

      // transcribe/start flips transcribe.phase to 'transcribing' — the
      // machine's busy selector derives from it; no separate busy setter.
      dispatch({ type: 'transcribe/start' });
      patchSession({ status: 'transcribing' });

      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 180_000);
      try {
        // Apply speed-up to the combined silenced blob if enabled.
        // Speed-up is generated on demand — never pre-computed.
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
            dispatch({
              type: 'transcribe/retry',
              status: { provider: 'nova', attempt: info.attempt, max: info.max },
            }),
        });

        const text = result.text?.trim() ?? '';
        if (text) {
          setBaseline(text);
          clearEdited();
          // T3 is the top tier — promoteTier never blocks it; the fallback is
          // defensive only. t3Transcript frozen here; t2 preserved untouched.
          const promo = promoteTier(session, { tier: 't3', text }) ?? {
            transcript: text,
            activeTranscriptTier: 't3' as const,
          };
          patchSession({
            ...promo,
            t3Transcript: text,
            status: 'draft',
            editedTranscript: undefined,
            cloudTranscribeCount: spent + 1,
          });
          recordAction('transcribe');
          dispatch({
            type: 'transcribe/success',
            stats: {
              droppedSec: 0,
              originalSec: 0,
              speedSavedSec: speedReport?.savedSec ?? 0,
              speedOriginalSec: speedReport?.originalSec ?? 0,
            },
          });
          toast.success('Transcription complete.');
        } else {
          dispatch({ type: 'transcribe/empty' });
          toast.error('Transcription returned no text. Try again or check your audio.');
          // Single write: fold the error-log append into the same status patch.
          patchSession({
            status: 'draft',
            aiErrors: appendAiError(session.aiErrors, {
              call: 'transcribe-cloud',
              provider: 'nova',
              kind: 'empty',
              detail: 'Cloud transcription returned no text.',
            }),
          });
        }
      } catch (e) {
        let errorPatch: Partial<Session>;
        if ((e as Error).name === 'AbortError') {
          dispatch({ type: 'transcribe/abort' });
          errorPatch = {
            aiErrors: appendAiError(session.aiErrors, {
              call: 'transcribe-cloud',
              provider: 'nova',
              kind: 'timeout',
              detail: 'Cloud transcription aborted after the 180s timeout.',
            }),
          };
        } else if (e instanceof AiCallError) {
          dispatch({ type: 'transcribe/error', aiError: e });
          toast.error(friendlyAiError(e).title);
          errorPatch = {
            aiErrors: appendAiError(session.aiErrors, {
              call: 'transcribe-cloud',
              provider: e.provider,
              kind: e.kind,
              status: e.status,
              attempts: e.attemptsMade,
              detail: e.message,
              rawSnippet: e.rawDetail,
            }),
          };
        } else {
          dispatch({ type: 'transcribe/error', aiError: null });
          toast.error(`Transcription failed: ${(e as Error).message}`);
          errorPatch = {
            aiErrors: appendAiError(session.aiErrors, {
              call: 'transcribe-cloud',
              provider: 'nova',
              kind: 'parse',
              detail: (e as Error).message,
            }),
          };
        }
        patchSession({ status: 'draft', ...errorPatch });
      } finally {
        clearTimeout(abortTimer);
      }
    },
    [
      session,
      silencedMergedBlob,
      settings,
      checkActionGuard,
      recordAction,
      patchSession,
      setBaseline,
      clearEdited,
      dispatch,
    ],
  );

  const revertToLocal = useCallback(() => {
    const t2 = session?.t2Transcript;
    const t1 = session?.t1Transcript;
    const text = t2 || t1;
    if (text?.trim()) {
      setBaseline(text);
      clearEdited();
      patchSession({
        transcript: text,
        activeTranscriptTier: t2 ? 't2' : 't1',
        editedTranscript: undefined,
      });
      toast.success('Reverted to local transcription.');
    } else {
      toast.error('No local transcription to revert to.');
    }
  }, [session, setBaseline, clearEdited, patchSession]);

  const clearTranscribeAiError = useCallback(() => {
    dispatch({ type: 'transcribe/clearAiError' });
  }, [dispatch]);

  return { backgroundT2, runT3, revertToLocal, clearTranscribeAiError };
}
