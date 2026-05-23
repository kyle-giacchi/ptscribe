import { useMemo, useReducer } from 'react';
import { useActionGuard } from './useActionGuard';
import { useCapturePhase } from './useCapturePhase';
import { useTranscriptSource } from './useTranscriptSource';
import { useGeneratePhase } from './useGeneratePhase';
import { sessionMachineReducer } from './sessionMachine/reducer';
import {
  initialSessionMachineState,
  type SessionMachineState,
  type UploadStatus,
} from './sessionMachine/types';
import type { BackgroundT2State } from './useBackgroundTranscription';
import type { UseRecorder } from './useRecorder';
import type { UseWebSpeechTranscript } from './useLiveTranscript';
import type {
  Note,
  NoteSection,
  NoteTemplate,
  Patient,
  Session,
  SessionClip,
  Settings,
} from '@/types';

export interface UseSessionMachineParams {
  session: Session | undefined;
  patient: Patient | undefined;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  settings: Settings;
  transcript: string;
  recorder: UseRecorder;
  webSpeech: UseWebSpeechTranscript;
  webSpeechEnabled: boolean;
  /**
   * When set, overrides `settings.ai.transcription.provider` for this session only.
   * `'webspeech'` forces Web Speech captions even if the user's default is Local Whisper;
   * `'none'` suppresses live transcription entirely (record-now, transcribe-later);
   * `null`/`undefined` falls back to `webSpeechEnabled`.
   */
  transcriptionProviderOverride?: 'webspeech' | 'none' | null;
  sortedClips: SessionClip[];
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  setTranscript: (next: string) => void;
  setEditedTranscript?: (next: string) => void;
  setError: (msg: string | null) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
  setActiveTab: (tab: 'record' | 'review') => void;
}

export interface SessionMachineGenerateApi {
  run: (mode?: 'replace' | 'append', feedback?: string) => Promise<void>;
  finalize: () => void;
  unfinalize: () => void;
  sectionChange: (key: string, body: string) => void;
  replaceSections: (sections: NoteSection[]) => void;
  copyMarkdown: (markdown: string) => void;
  clearAiError: () => void;
  missingRequiredLabels: string[];
}

export interface SessionMachineTranscribeApi {
  run: (clipId?: string) => Promise<void>;
  revertToLocal: () => void;
  clearAiError: () => void;
  mergedAudioBlob: Blob | null;
  setMergedAudioBlob: (b: Blob | null) => void;
  silencedMergedBlob: Blob | null;
  setSilencedMergedBlob: (b: Blob | null) => void;
  isMerging: boolean;
  setIsMerging: (v: boolean) => void;
}

export interface SessionMachineActionGuardApi {
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
  transcribeUsed: number;
  generateUsed: number;
}

export interface SessionMachineCaptureApi {
  backgroundWarningDismissed: boolean;
  setBackgroundWarningDismissed: (v: boolean) => void;
  whisperBubbles: string[];
  uploadStatus: UploadStatus;
  handleStartRecording: () => Promise<void>;
  handleFinishedRecording: () => Promise<void>;
  handlePauseResume: () => void;
  handleStopAndFinish: () => void;
  handleUploadAudio: (file: File) => Promise<string | null>;
  handleDeleteClip: (clipId: string) => Promise<void>;
  buildMergedAudioForReview: (opts?: { skipNav?: boolean }) => Promise<void>;
}

export interface SessionMachine {
  state: SessionMachineState;
  generate: SessionMachineGenerateApi;
  transcribe: SessionMachineTranscribeApi;
  capture: SessionMachineCaptureApi;
  actionGuard: SessionMachineActionGuardApi;
  backgroundT2: BackgroundT2State;
}

/**
 * Session lifecycle coordinator.
 *
 * Wires three phase hooks (capture → transcriptSource → generate) and the
 * shared reducer + action guard into the unified SessionMachine interface.
 * Each phase hook owns its own state and side effects; this coordinator only
 * holds the shared reducer and routes data between phases.
 *
 *   useCapturePhase      — recording, upload, clip merge → silencedMergedBlob
 *   useTranscriptSource  — T2 auto-pass + T3 cloud + tier switching
 *   useGeneratePhase     — note generation, lock, finalize
 */
export function useSessionMachine(params: UseSessionMachineParams): SessionMachine {
  const {
    session,
    patient,
    note,
    template,
    settings,
    transcript,
    recorder,
    webSpeech,
    webSpeechEnabled: settingsWebSpeechEnabled,
    transcriptionProviderOverride,
    sortedClips,
    patchSession,
    patchClips,
    patchClip,
    setTranscript,
    setEditedTranscript,
    setError,
    setBusy,
    setActiveTab,
  } = params;

  // Resolve the effective Web Speech state for this recording session. The
  // override is in-memory only — it never mutates persisted settings.
  const webSpeechEnabled =
    transcriptionProviderOverride === 'webspeech'
      ? true
      : transcriptionProviderOverride === 'none'
        ? false
        : settingsWebSpeechEnabled;

  // Shared reducer — owns lifecycle phase + transient AI surface for all three phases.
  const [state, dispatch] = useReducer(sessionMachineReducer, initialSessionMachineState);

  // Shared action guard — tracks per-session transcribe/generate quotas.
  const { checkActionGuard, recordAction, transcribeUsed, generateUsed } = useActionGuard();

  // ── Phase hooks ──────────────────────────────────────────────────────────

  const capturePhase = useCapturePhase({
    session,
    recorder,
    webSpeech,
    webSpeechEnabled,
    transcriptionProviderOverride,
    sortedClips,
    settings,
    patchSession,
    patchClips,
    patchClip,
    setTranscript,
    setError,
    setActiveTab,
    uploadStatus: state.capture.uploadStatus,
    dispatch,
  });

  const transcriptSource = useTranscriptSource({
    session,
    silencedMergedBlob: capturePhase.silencedMergedBlob,
    settings,
    patchSession,
    setTranscript,
    setEditedTranscript,
    setBusy,
    dispatch,
    checkActionGuard,
    recordAction,
  });

  const generatePhase = useGeneratePhase({
    session,
    patient,
    note,
    template,
    transcript,
    settings,
    patchSession,
    setError,
    setBusy,
    dispatch,
    checkActionGuard,
    recordAction,
  });

  // ── Public API assembly ──────────────────────────────────────────────────

  const generate = useMemo<SessionMachineGenerateApi>(
    () => ({
      run: generatePhase.run,
      finalize: generatePhase.finalize,
      unfinalize: generatePhase.unfinalize,
      sectionChange: generatePhase.sectionChange,
      replaceSections: generatePhase.replaceSections,
      copyMarkdown: generatePhase.copyMarkdown,
      clearAiError: generatePhase.clearAiError,
      missingRequiredLabels: generatePhase.missingRequiredLabels,
    }),
    [generatePhase],
  );

  const transcribeApi = useMemo<SessionMachineTranscribeApi>(
    () => ({
      run: transcriptSource.runT3,
      revertToLocal: transcriptSource.revertToLocal,
      clearAiError: transcriptSource.clearTranscribeAiError,
      mergedAudioBlob: capturePhase.mergedAudioBlob,
      setMergedAudioBlob: capturePhase.setMergedAudioBlob,
      silencedMergedBlob: capturePhase.silencedMergedBlob,
      setSilencedMergedBlob: capturePhase.setSilencedMergedBlob,
      isMerging: capturePhase.isMerging,
      setIsMerging: capturePhase.setIsMerging,
    }),
    [
      transcriptSource.runT3,
      transcriptSource.revertToLocal,
      transcriptSource.clearTranscribeAiError,
      capturePhase.mergedAudioBlob,
      capturePhase.silencedMergedBlob,
      capturePhase.isMerging,
    ],
  );

  const actionGuard = useMemo<SessionMachineActionGuardApi>(
    () => ({ checkActionGuard, recordAction, transcribeUsed, generateUsed }),
    [checkActionGuard, recordAction, transcribeUsed, generateUsed],
  );

  const capture = useMemo<SessionMachineCaptureApi>(
    () => ({
      backgroundWarningDismissed: capturePhase.backgroundWarningDismissed,
      setBackgroundWarningDismissed: capturePhase.setBackgroundWarningDismissed,
      whisperBubbles: capturePhase.whisperBubbles,
      uploadStatus: capturePhase.uploadStatus,
      handleStartRecording: capturePhase.handleStartRecording,
      handleFinishedRecording: capturePhase.handleFinishedRecording,
      handlePauseResume: capturePhase.handlePauseResume,
      handleStopAndFinish: capturePhase.handleStopAndFinish,
      handleUploadAudio: capturePhase.handleUploadAudio,
      handleDeleteClip: capturePhase.handleDeleteClip,
      buildMergedAudioForReview: capturePhase.buildMergedAudioForReview,
    }),
    // Handlers are stable closures over refs — only re-memo when UI-visible values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capturePhase.backgroundWarningDismissed, capturePhase.whisperBubbles, capturePhase.uploadStatus],
  );

  return useMemo(
    () => ({ state, generate, transcribe: transcribeApi, capture, actionGuard, backgroundT2: transcriptSource.backgroundT2 }),
    [state, generate, transcribeApi, capture, actionGuard, transcriptSource.backgroundT2],
  );
}
