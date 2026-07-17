import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject } from 'react';
import type { SessionMachineAction, UploadFlowState } from './sessionMachine/types';
import type { CapturePhaseResult } from './useCapturePhase';
import type { T2Phase } from './useBackgroundTranscription';
import type { Session } from '@/types';

export interface UseUploadPhaseParams {
  session: Session | undefined;
  uploadFlow: UploadFlowState;
  t2Phase: T2Phase;
  dispatch: Dispatch<SessionMachineAction>;
  /** Latest-value ref — capturePhase is recreated every render. */
  captureRef: MutableRefObject<CapturePhaseResult>;
}

export interface UploadPhaseResult {
  /** Owns the whole processing choreography incl. tab navigation. */
  uploadAudio: (file: File) => Promise<void>;
  /** "Go to notes" bail-out from the processing screen. */
  dismissUploadProcessing: () => void;
}

/**
 * Upload-processing choreography (CONTEXT.md — UploadProcessingView):
 * upload → clip saved → merge + T2 (skipNav) → ≥2s minimum display →
 * navigate to review.
 */
export function useUploadPhase({
  session,
  uploadFlow,
  t2Phase,
  dispatch,
  captureRef,
}: UseUploadPhaseParams): UploadPhaseResult {
  const uploadAudio = useCallback(
    async (file: File) => {
      dispatch({ type: 'uploadFlow/begin' });
      dispatch({ type: 'view/setTab', tab: 'record' });
      const clipId = await captureRef.current.handleUploadAudio(file);
      if (clipId) {
        dispatch({ type: 'uploadFlow/clipSaved', clipId, startedAt: Date.now() });
      } else {
        dispatch({ type: 'uploadFlow/clear' });
      }
    },
    [dispatch, captureRef],
  );

  useEffect(() => {
    const { active, clipId, mergeStarted, startedAt } = uploadFlow;
    if (!active || !clipId) return;
    const clip = session?.clips.find((c) => c.id === clipId);
    if (!clip) return;

    const audioSaved =
      clip.status === 'ready' || clip.status === 'transcribed' || clip.status === 'failed';

    // Once audio is saved: kick off merge+T2 once (skipNav keeps the
    // processing screen up until T2 lands).
    if (audioSaved && !mergeStarted) {
      dispatch({ type: 'uploadFlow/mergeStarted' });
      void captureRef.current.buildMergedAudioForReview({ skipNav: true });
      return;
    }

    // T2 finished — navigate to review after a brief minimum display time.
    if (mergeStarted && t2Phase === 'done') {
      const elapsed = Date.now() - (startedAt ?? Date.now());
      const delay = Math.max(0, 2000 - elapsed);
      const t = setTimeout(() => {
        dispatch({ type: 'uploadFlow/clear' });
        dispatch({ type: 'view/setTab', tab: 'review' });
      }, delay);
      return () => clearTimeout(t);
    }
    // t2Phase === 'error': stay on the processing screen; retry / go-to-notes
    // (dismissUploadProcessing) handle it.
  }, [session?.clips, uploadFlow, t2Phase, dispatch, captureRef]);

  const dismissUploadProcessing = useCallback(() => {
    dispatch({ type: 'uploadFlow/clear' });
    dispatch({ type: 'view/setTab', tab: 'review' });
  }, [dispatch]);

  return { uploadAudio, dismissUploadProcessing };
}
