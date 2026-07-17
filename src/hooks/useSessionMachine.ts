import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { useNotes } from '@/contexts/NotesProvider';
import { audioRepository } from '@/services/AudioRepository';
import { noteMatchesInputs } from '@/services/note/staleness';
import { appendAiError } from '@/lib/debug/aiErrorLog';
import { isDemoMode } from '@/lib/demoMode';
import { useActionGuard } from './useActionGuard';
import { useCapturePhase } from './useCapturePhase';
import { useTranscriptSource } from './useTranscriptSource';
import { useGeneratePhase } from './useGeneratePhase';
import { useAutoRotateClip } from './useAutoRotateClip';
import { useWhisperLoading } from './useWhisperLoading';
import { useUploadPhase } from './useUploadPhase';
import { useTemplateChangePhase } from './useTemplateChangePhase';
import { sessionMachineReducer } from './sessionMachine/reducer';
import {
  createInitialSessionMachineState,
  type GateResolution,
  type SessionMachineState,
} from './sessionMachine/types';
import type { BackgroundT2State } from './useBackgroundTranscription';
import type { UseRecorder } from './useRecorder';
import type { UseWebSpeechTranscript } from './useLiveTranscript';
import { MAX_GENERATES_PER_SESSION, MAX_TRANSCRIBES_PER_SESSION } from '@/types';
import type {
  Note,
  NoteTemplate,
  Patient,
  Session,
  SessionClip,
  SessionModifiers,
  Settings,
} from '@/types';

export type { GateResolution, SessionGate } from './sessionMachine/types';

/**
 * Observational workflow outcomes. Cross-slice *policy* lives in the host —
 * e.g. demo mode discharging the demo patient on `note/finalized` — so the
 * machine never needs mutators for slices it does not own.
 */
export type SessionMachineEvent =
  | { type: 'note/finalized'; sessionId: string; patientId: string }
  | { type: 'session/reset'; sessionId: string };

export interface UseSessionMachineParams {
  // Entity inputs (live provider values)
  session: Session | undefined;
  patient: Patient | undefined;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  /** Local + org-shared templates, page-resolved (read-only). */
  allTemplates: NoteTemplate[];
  settings: Settings;

  // Device modules (injected; they own hardware + wake lock)
  recorder: UseRecorder;
  webSpeech: UseWebSpeechTranscript;

  // Single-write-path persistence — the ONLY Session-entity mutation callbacks
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;

  /**
   * Required port into the Settings slice: persist
   * `settings.session.phiConfirmDismissed = true`. Called exactly once when
   * the PHI gate resolves with `dontShowAgain`. The machine cannot reach the
   * Settings slice itself.
   */
  persistPhiConfirmDismissed: () => void;

  /** Mount-time intent from deep links. Read once; later changes are ignored.
   *  The host owns URL hygiene (stripping the params). */
  initial?: { quickMode?: boolean; autoRecord?: boolean };

  /** Observational outcome channel. See SessionMachineEvent. */
  onEvent?: (event: SessionMachineEvent) => void;
}

export interface SessionMachineSelectors {
  /** Edited overlay if non-blank, else the machine baseline. */
  effectiveTranscript: string;
  hasUserEdits: boolean;
  busy: 'transcribing' | 'generating' | null;
  /** Live generation inputs match the note's snapshot (Regenerate soft-gate). */
  inputsUnchanged: boolean;
  /** Inverse for an existing note — stale banner + Finalize gate. */
  noteIsStale: boolean;
  canGenerate: boolean;
  isTranscriptLocked: boolean;
  isRecording: boolean;
  hasGeneratedNote: boolean;
  showBackgroundWarning: boolean;
  missingRequiredLabels: string[];
  sortedClips: SessionClip[];
  totalDurationSec: number;
  hasT2Transcript: boolean;
  hasT3Transcript: boolean;
  canImproveWithAI: boolean;
  cloudDisabledReason: string | undefined;
  currentModifiers: SessionModifiers;
  generateUsed: number;
  transcribeUsed: number;
}

export interface SessionMachineActions {
  // Capture
  /** May open the whisper-unavailable gate instead of starting. */
  startRecording: () => void;
  pauseResume: () => void;
  /** Stops, persists the clip, kicks merge + T2, navigates to review. */
  stopAndFinish: () => void;
  deleteClip: (clipId: string) => Promise<void>;
  /** Owns the whole processing choreography incl. tab navigation. */
  uploadAudio: (file: File) => Promise<void>;
  /** "Go to notes" bail-out from the processing screen. */
  dismissUploadProcessing: () => void;
  skipRecording: () => void;
  dismissBackgroundWarning: () => void;
  dismissRecordWarning: () => void;
  setTab: (tab: 'record' | 'review') => void;
  // Transcript (Curate)
  /** Overlay only — in-memory until commitTranscriptEdits/applyScrub. */
  editTranscript: (text: string) => void;
  commitTranscriptEdits: () => void;
  revertEdits: () => void;
  applyScrub: (scrubbed: string) => void;
  logScrubFailure: (model: string, detail: string) => void;
  /** T3 cloud Nova — capped per session, hard-disabled in demo mode. */
  improveWithAI: () => Promise<void>;
  revertToLocal: () => void;
  clearTranscribeAiError: () => void;
  copyTranscript: () => void;
  // Note (Generate / Finalize)
  /** May open the PHI gate instead of generating. */
  generate: (mode?: 'replace' | 'append', feedback?: string) => void;
  /** May open the stale-finalize gate instead of finalizing. */
  finalize: () => void;
  unfinalize: () => void;
  sectionChange: (key: string, body: string) => void;
  /** May open the template-change gate when the note has content. */
  changeTemplate: (templateId: string) => void;
  setModifiers: (next: SessionModifiers) => void;
  clearGenerateAiError: () => void;
  // Session
  /** Opens the reset-confirm gate (refused with a toast while recording). */
  requestReset: () => void;
  dismissError: () => void;
  /** Resolve the currently open gate. Mismatched/absent gate → no-op. */
  resolveGate: (resolution: GateResolution) => void;
}

export interface SessionMachine {
  state: SessionMachineState;
  selectors: SessionMachineSelectors;
  actions: SessionMachineActions;
  /** Live-preview bubbles for the active recording clip. */
  whisperBubbles: string[];
  /** Background T2 pass surface (phase, progress label, retry). */
  backgroundT2: BackgroundT2State;
}

const EMPTY_MODIFIERS: SessionModifiers = {
  clinicalDetail: [],
  codingBilling: [],
  beyondNote: [],
  customInstructions: [],
};

/**
 * The session workflow module — Capture → Curate → Generate → Finalize.
 *
 * Deep interface: callers send intents (`actions.*`), render `state` +
 * `selectors`, and resolve the single open workflow gate (`state.gate`,
 * CONTEXT.md §Workflow gate). The reducer owns all transient workflow state
 * (transcript document, busy/error, view tab, gates, provider override,
 * upload choreography); the three phase hooks are implementation.
 *
 * Invariants callers must know:
 * - The host component MUST be keyed by sessionId. The transcript document
 *   and `initial` intent are seeded once per mount and never re-read.
 * - At most one gate is open; an intent that would open a second gate is
 *   dropped, not queued. `resolveGate` with a mismatched kind is a no-op.
 * - Workflow-owned Session fields (transcript/clips/status/templateId/
 *   modifiers/noteId/aiErrors/counters) are written only through `actions`.
 *   Patching them from the page desynchronizes the machine.
 * - `stale-finalize → regenerate` re-enters the generate pipeline and may
 *   legitimately open the PHI gate next.
 */
export function useSessionMachine(params: UseSessionMachineParams): SessionMachine {
  const {
    session,
    patient,
    note,
    template,
    allTemplates,
    settings,
    recorder,
    webSpeech,
    patchSession,
    patchClips,
    patchClip,
    persistPhiConfirmDismissed,
    initial,
    onEvent,
  } = params;

  // ── Reducer — seeded once per mount (host is keyed by sessionId) ─────────
  const [state, dispatch] = useReducer(sessionMachineReducer, undefined, () =>
    createInitialSessionMachineState({
      quickMode: initial?.quickMode,
      baseline: session?.transcript ?? '',
      edited: session?.editedTranscript ?? '',
    }),
  );

  // Latest-value refs so event handlers and effects never read stale state.
  // Assigned in an effect (not during render) per react-hooks/refs; handlers
  // always run after the effect pass, so reads see the committed values.
  const stateRef = useRef(state);
  const sessionRef = useRef(session);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    stateRef.current = state;
    sessionRef.current = session;
    onEventRef.current = onEvent;
  });
  const initialRef = useRef(initial);

  const emitEvent = useCallback((event: SessionMachineEvent) => {
    onEventRef.current?.(event);
  }, []);

  // ── Shared guard + internal seams ────────────────────────────────────────
  const { checkActionGuard, recordAction } = useActionGuard();
  const { removeNote } = useNotes();
  const { exhausted: whisperExhausted } = useWhisperLoading();

  // Effective Web Speech state — the whisper gate's override wins over settings.
  const webSpeechEnabled =
    state.providerOverride === 'webspeech'
      ? true
      : state.providerOverride === 'none'
        ? false
        : settings.session.webSpeechEnabled;

  const sortedClips = useMemo(
    () => (session ? [...session.clips].sort((a, b) => a.createdAt - b.createdAt) : []),
    [session],
  );

  const effectiveTranscript = state.transcript.edited.trim()
    ? state.transcript.edited
    : state.transcript.baseline;

  // ── Phase hooks (implementation) ─────────────────────────────────────────
  const capturePhase = useCapturePhase({
    session,
    recorder,
    webSpeech,
    webSpeechEnabled,
    transcriptionProviderOverride: state.providerOverride,
    sortedClips,
    settings,
    patchSession,
    patchClips,
    patchClip,
    uploadStatus: state.capture.uploadStatus,
    dispatch,
  });
  const captureRef = useRef(capturePhase);
  useEffect(() => {
    captureRef.current = capturePhase;
  });

  const transcriptSource = useTranscriptSource({
    session,
    silencedMergedBlob: capturePhase.silencedMergedBlob,
    settings,
    patchSession,
    dispatch,
    checkActionGuard,
    recordAction,
  });

  const generatePhase = useGeneratePhase({
    session,
    patient,
    note,
    template,
    transcript: effectiveTranscript,
    settings,
    patchSession,
    dispatch,
    checkActionGuard,
    recordAction,
  });

  // Mid-recording clip rotation restarts the recorder directly — no gate.
  useAutoRotateClip(
    recorder.status,
    recorder.getDurationSec,
    capturePhase.handleFinishedRecording,
    capturePhase.handleStartRecording,
  );

  // ── Derived values ───────────────────────────────────────────────────────
  const currentModifiers = session?.modifiers ?? EMPTY_MODIFIERS;
  const generateUsed = session?.generateCount ?? 0;
  const transcribeUsed = session?.cloudTranscribeCount ?? 0;

  const inputsUnchanged = useMemo(() => {
    if (!session) return false;
    return noteMatchesInputs(note, {
      transcript: effectiveTranscript,
      templateId: session.templateId,
      modifiers: currentModifiers,
    });
  }, [note, session, effectiveTranscript, currentModifiers]);
  const noteHasContent = !!note && note.sections.some((s) => s.body.trim().length > 0);
  const noteIsStale = noteHasContent && !inputsUnchanged;

  // ── Generate / Finalize (PHI + stale gates) ──────────────────────────────
  const generate = useCallback(
    (mode: 'replace' | 'append' = 'replace', feedback?: string) => {
      if (settings.session.phiConfirmDismissed) {
        void generatePhase.run(mode, feedback);
      } else {
        dispatch({ type: 'gate/open', gate: { kind: 'phi-confirm', intent: { mode, feedback } } });
      }
    },
    [settings.session.phiConfirmDismissed, generatePhase],
  );

  const doFinalize = useCallback(() => {
    // generatePhase.finalize blocks (with a toast) when required sections are
    // empty — only emit the outcome event when it actually finalized.
    const blocked = generatePhase.missingRequiredLabels.length > 0;
    generatePhase.finalize();
    if (!blocked && session && patient) {
      emitEvent({ type: 'note/finalized', sessionId: session.id, patientId: patient.id });
    }
  }, [generatePhase, session, patient, emitEvent]);

  const finalize = useCallback(() => {
    if (noteIsStale) {
      dispatch({ type: 'gate/open', gate: { kind: 'stale-finalize' } });
      return;
    }
    doFinalize();
  }, [noteIsStale, doFinalize]);

  // ── Recording (whisper gate) ─────────────────────────────────────────────
  const startRecording = useCallback(() => {
    const provider = state.providerOverride ?? settings.ai.transcription.provider;
    if (provider === 'local' && whisperExhausted) {
      dispatch({ type: 'gate/open', gate: { kind: 'whisper-unavailable' } });
      return;
    }
    void captureRef.current.handleStartRecording();
  }, [state.providerOverride, settings.ai.transcription.provider, whisperExhausted]);
  const startRecordingRef = useRef(startRecording);
  useEffect(() => {
    startRecordingRef.current = startRecording;
  });

  // A continue-outcome from the whisper gate sets the override and parks a
  // pending start; the start fires only after the override has committed, so
  // the capture phase wires live transcription against the chosen provider.
  const pendingStartRef = useRef(false);
  useEffect(() => {
    if (!pendingStartRef.current) return;
    if (state.providerOverride === null) return;
    pendingStartRef.current = false;
    void captureRef.current.handleStartRecording();
  }, [state.providerOverride]);

  // ?autoRecord=1 deep link: fires once, only when idle with zero clips.
  // Goes through startRecording, so it respects the whisper gate (deliberate
  // change — the old page path bypassed it).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!initialRef.current?.autoRecord) return;
    if (autoStartedRef.current) return;
    if (!session || !patient) return;
    if (recorder.status !== 'idle') return;
    if (session.clips.length > 0) return;
    autoStartedRef.current = true;
    startRecordingRef.current();
  }, [session, patient, recorder.status]);

  // ── Template change (content-loss gate + section cache) ─────────────────
  const { changeTemplate, applyTemplateChange } = useTemplateChangePhase({
    session,
    note,
    allTemplates,
    patchSession,
    replaceSections: generatePhase.replaceSections,
    dispatch,
  });

  // ── Reset session (reset-confirm gate) ───────────────────────────────────
  const requestReset = useCallback(() => {
    if (recorder.status === 'recording' || recorder.status === 'paused') {
      toast.error('Stop recording before resetting the session.');
      return;
    }
    dispatch({ type: 'gate/open', gate: { kind: 'reset-confirm' } });
  }, [recorder.status]);

  const doResetSession = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    await Promise.allSettled(current.clips.map((c) => audioRepository.remove(c.id)));
    if (current.noteId) removeNote(current.noteId);
    patchSession({
      status: 'draft',
      clips: [],
      transcript: undefined,
      t1Transcript: undefined,
      t2Transcript: undefined,
      t3Transcript: undefined,
      editedTranscript: undefined,
      activeTranscriptTier: undefined,
      noteId: undefined,
      durationMin: undefined,
    });
    captureRef.current.reset();
    dispatch({ type: 'machine/reset' });
    emitEvent({ type: 'session/reset', sessionId: current.id });
  }, [removeNote, patchSession, emitEvent]);

  // ── Gate resolution ──────────────────────────────────────────────────────
  const resolveGate = useCallback(
    (resolution: GateResolution) => {
      const gate = stateRef.current.gate;
      if (!gate || gate.kind !== resolution.kind) {
        if (import.meta.env.DEV) {
          console.warn('[useSessionMachine] resolveGate ignored — no matching open gate:', {
            open: gate?.kind ?? null,
            resolution,
          });
        }
        return;
      }
      dispatch({ type: 'gate/close' });

      if (gate.kind === 'phi-confirm' && resolution.kind === 'phi-confirm') {
        if (resolution.outcome === 'confirm') {
          if (resolution.dontShowAgain) persistPhiConfirmDismissed();
          void generatePhase.run(gate.intent.mode, gate.intent.feedback);
        }
      } else if (resolution.kind === 'stale-finalize') {
        if (resolution.outcome === 'regenerate') generate('replace');
        else if (resolution.outcome === 'finalize-anyway') doFinalize();
      } else if (resolution.kind === 'whisper-unavailable') {
        if (resolution.outcome === 'use-web-speech') {
          pendingStartRef.current = true;
          dispatch({ type: 'override/set', value: 'webspeech' });
        } else if (resolution.outcome === 'record-without-transcription') {
          pendingStartRef.current = true;
          dispatch({ type: 'override/set', value: 'none' });
        }
      } else if (gate.kind === 'template-change' && resolution.kind === 'template-change') {
        if (resolution.outcome === 'confirm') applyTemplateChange(gate.targetTemplateId);
      } else if (resolution.kind === 'reset-confirm') {
        if (resolution.outcome === 'confirm') void doResetSession();
      }
    },
    [
      persistPhiConfirmDismissed,
      generatePhase,
      generate,
      doFinalize,
      applyTemplateChange,
      doResetSession,
    ],
  );

  // ── Upload-processing choreography ───────────────────────────────────────
  const t2Phase = transcriptSource.backgroundT2.phase;
  const { uploadAudio, dismissUploadProcessing } = useUploadPhase({
    session,
    uploadFlow: state.uploadFlow,
    t2Phase,
    dispatch,
    captureRef,
  });

  // ── Transcript document actions ──────────────────────────────────────────
  const editTranscript = useCallback(
    (text: string) => dispatch({ type: 'transcript/setEdited', text }),
    [],
  );

  const commitTranscriptEdits = useCallback(() => {
    const edited = stateRef.current.transcript.edited;
    if (edited.trim()) {
      patchSession({ editedTranscript: edited, activeTranscriptTier: 'edited' });
    } else if (sessionRef.current?.editedTranscript) {
      patchSession({ editedTranscript: undefined });
    }
  }, [patchSession]);

  const revertEdits = useCallback(() => {
    dispatch({ type: 'transcript/setEdited', text: '' });
    patchSession({ editedTranscript: undefined });
  }, [patchSession]);

  const applyScrub = useCallback(
    (scrubbed: string) => {
      dispatch({ type: 'transcript/setEdited', text: scrubbed });
      patchSession({ editedTranscript: scrubbed, activeTranscriptTier: 'edited' });
    },
    [patchSession],
  );

  const logScrubFailure = useCallback(
    (model: string, detail: string) => {
      patchSession({
        aiErrors: appendAiError(sessionRef.current?.aiErrors, {
          call: 'pii',
          kind: 'parse',
          detail: `PII deep scan failed (${model}): ${detail}`,
        }),
      });
    },
    [patchSession],
  );

  const copyTranscript = useCallback(() => {
    const doc = stateRef.current.transcript;
    const text = doc.edited.trim() ? doc.edited : doc.baseline;
    navigator.clipboard.writeText(text).then(
      () => toast.success('Transcript copied'),
      () => toast.error('Copy failed'),
    );
  }, []);

  // ── Simple delegations / dispatches ──────────────────────────────────────
  const stopAndFinish = useCallback(() => {
    captureRef.current.handleStopAndFinish();
    dispatch({ type: 'view/setTab', tab: 'review' });
  }, []);

  const setTab = useCallback(
    (tab: 'record' | 'review') => dispatch({ type: 'view/setTab', tab }),
    [],
  );
  const skipRecording = useCallback(() => dispatch({ type: 'view/skipRecording' }), []);
  const dismissRecordWarning = useCallback(
    () => dispatch({ type: 'view/dismissRecordWarning' }),
    [],
  );
  const dismissError = useCallback(() => dispatch({ type: 'error/set', message: null }), []);
  const setModifiers = useCallback(
    (next: SessionModifiers) => patchSession({ modifiers: next }),
    [patchSession],
  );

  // ── Public API assembly ──────────────────────────────────────────────────
  const actions = useMemo<SessionMachineActions>(
    () => ({
      startRecording,
      pauseResume: capturePhase.handlePauseResume,
      stopAndFinish,
      deleteClip: capturePhase.handleDeleteClip,
      uploadAudio,
      dismissUploadProcessing,
      skipRecording,
      dismissBackgroundWarning: () => capturePhase.setBackgroundWarningDismissed(true),
      dismissRecordWarning,
      setTab,
      editTranscript,
      commitTranscriptEdits,
      revertEdits,
      applyScrub,
      logScrubFailure,
      improveWithAI: () => transcriptSource.runT3(),
      revertToLocal: transcriptSource.revertToLocal,
      clearTranscribeAiError: transcriptSource.clearTranscribeAiError,
      copyTranscript,
      generate,
      finalize,
      unfinalize: generatePhase.unfinalize,
      sectionChange: generatePhase.sectionChange,
      changeTemplate,
      setModifiers,
      clearGenerateAiError: generatePhase.clearAiError,
      requestReset,
      dismissError,
      resolveGate,
    }),
    [
      startRecording,
      capturePhase,
      stopAndFinish,
      uploadAudio,
      dismissUploadProcessing,
      skipRecording,
      dismissRecordWarning,
      setTab,
      editTranscript,
      commitTranscriptEdits,
      revertEdits,
      applyScrub,
      logScrubFailure,
      transcriptSource,
      copyTranscript,
      generate,
      finalize,
      generatePhase,
      changeTemplate,
      setModifiers,
      requestReset,
      dismissError,
      resolveGate,
    ],
  );

  const busy: 'transcribing' | 'generating' | null =
    state.generate.phase === 'generating'
      ? 'generating'
      : state.transcribe.phase === 'transcribing'
        ? 'transcribing'
        : null;

  const selectors = useMemo<SessionMachineSelectors>(
    () => ({
      effectiveTranscript,
      hasUserEdits: state.transcript.edited.trim().length > 0,
      busy,
      inputsUnchanged,
      noteIsStale,
      canGenerate:
        effectiveTranscript.trim().length > 0 &&
        settings.ai.generation.provider !== 'none' &&
        generateUsed < MAX_GENERATES_PER_SESSION,
      isTranscriptLocked:
        sortedClips.length === 0 && !effectiveTranscript.trim() && !state.view.recordingSkipped,
      isRecording: recorder.status === 'recording' || recorder.status === 'paused',
      hasGeneratedNote: !!note,
      showBackgroundWarning: capturePhase.backgrounded && !capturePhase.backgroundWarningDismissed,
      missingRequiredLabels: generatePhase.missingRequiredLabels,
      sortedClips,
      totalDurationSec: sortedClips.reduce((sum, c) => sum + (c.durationSec ?? 0), 0),
      hasT2Transcript: !!session?.t2Transcript,
      hasT3Transcript: !!session?.t3Transcript,
      canImproveWithAI: !session?.t3Transcript,
      cloudDisabledReason: isDemoMode()
        ? 'Cloud transcription is disabled in demo mode.'
        : transcribeUsed >= MAX_TRANSCRIBES_PER_SESSION
          ? 'Cloud transcription was already used for this session.'
          : undefined,
      currentModifiers,
      generateUsed,
      transcribeUsed,
    }),
    [
      effectiveTranscript,
      state.transcript.edited,
      state.view.tab,
      state.view.recordWarnDismissed,
      state.view.recordingSkipped,
      busy,
      inputsUnchanged,
      noteIsStale,
      settings.ai.generation.provider,
      generateUsed,
      transcribeUsed,
      sortedClips,
      recorder.status,
      capturePhase.backgrounded,
      capturePhase.backgroundWarningDismissed,
      generatePhase.missingRequiredLabels,
      note,
      session?.t2Transcript,
      session?.t3Transcript,
      currentModifiers,
    ],
  );

  return useMemo<SessionMachine>(
    () => ({
      state,
      selectors,
      actions,
      whisperBubbles: capturePhase.whisperBubbles,
      backgroundT2: transcriptSource.backgroundT2,
    }),
    [state, selectors, actions, capturePhase.whisperBubbles, transcriptSource.backgroundT2],
  );
}
