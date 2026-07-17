import {
  createInitialSessionMachineState,
  type SessionMachineAction,
  type SessionMachineState,
} from './types';

/**
 * Pure reducer for the session lifecycle machine. Only owns local
 * lifecycle state (phase + transient AI surface). Side effects — the
 * actual provider call, toasts, repository writes, abort timers — live
 * in `useSessionMachine` runners that dispatch into here.
 */
export function sessionMachineReducer(
  state: SessionMachineState,
  action: SessionMachineAction,
): SessionMachineState {
  switch (action.type) {
    case 'generate/start':
      return {
        ...state,
        generate: {
          ...state.generate,
          phase: 'generating',
          aiError: null,
          retryStatus: null,
        },
      };

    case 'generate/retry':
      return {
        ...state,
        generate: { ...state.generate, retryStatus: action.status },
      };

    case 'generate/success':
      return {
        ...state,
        generate: {
          ...state.generate,
          phase: 'idle',
          lastRawPayload: action.rawText,
          lastAiPrompts: action.prompts,
          lastKeyReport: action.keyReport,
          retryStatus: null,
          aiError: null,
        },
      };

    case 'generate/error':
      return {
        ...state,
        generate: {
          ...state.generate,
          phase: 'error',
          aiError: action.aiError,
          retryStatus: null,
        },
      };

    case 'generate/clearAiError':
      return {
        ...state,
        generate: { ...state.generate, aiError: null },
      };

    case 'transcribe/start':
      return {
        ...state,
        transcribe: {
          ...state.transcribe,
          phase: 'transcribing',
          aiError: null,
          retryStatus: null,
        },
      };

    case 'transcribe/retry':
      return {
        ...state,
        transcribe: { ...state.transcribe, retryStatus: action.status },
      };

    case 'transcribe/success':
      return {
        ...state,
        transcribe: {
          ...state.transcribe,
          phase: 'idle',
          debugStats: action.stats,
          retryStatus: null,
          aiError: null,
        },
      };

    case 'transcribe/empty':
      return {
        ...state,
        transcribe: {
          ...state.transcribe,
          phase: 'idle',
          aiError: null,
          retryStatus: null,
        },
      };

    case 'transcribe/error':
      return {
        ...state,
        transcribe: {
          ...state.transcribe,
          phase: 'error',
          aiError: action.aiError,
          retryStatus: null,
        },
      };

    case 'transcribe/abort':
      return {
        ...state,
        transcribe: {
          ...state.transcribe,
          phase: 'idle',
          aiError: null,
          retryStatus: null,
        },
      };

    case 'transcribe/clearAiError':
      return {
        ...state,
        transcribe: { ...state.transcribe, aiError: null },
      };

    case 'capture/upload':
      return {
        ...state,
        capture: { ...state.capture, uploadStatus: action.status },
      };

    case 'view/setTab':
      return { ...state, view: { ...state.view, tab: action.tab } };

    case 'view/skipRecording':
      return {
        ...state,
        view: { ...state.view, tab: 'review', recordingSkipped: true },
      };

    case 'view/dismissRecordWarning':
      return { ...state, view: { ...state.view, recordWarnDismissed: true } };

    case 'transcript/setBaseline':
      return { ...state, transcript: { ...state.transcript, baseline: action.text } };

    case 'transcript/setEdited':
      return { ...state, transcript: { ...state.transcript, edited: action.text } };

    // Single-gate invariant: opening while a gate is already open drops the
    // triggering intent (no queueing). The runner relies on this no-op.
    case 'gate/open':
      return state.gate ? state : { ...state, gate: action.gate };

    case 'gate/close':
      return { ...state, gate: null };

    case 'override/set':
      return { ...state, providerOverride: action.value };

    case 'error/set':
      return { ...state, error: action.message };

    case 'uploadFlow/begin':
      return {
        ...state,
        uploadFlow: { active: true, clipId: null, startedAt: null, mergeStarted: false },
      };

    case 'uploadFlow/clipSaved':
      return {
        ...state,
        uploadFlow: {
          active: true,
          clipId: action.clipId,
          startedAt: action.startedAt,
          mergeStarted: false,
        },
      };

    case 'uploadFlow/mergeStarted':
      return { ...state, uploadFlow: { ...state.uploadFlow, mergeStarted: true } };

    case 'uploadFlow/clear':
      return {
        ...state,
        uploadFlow: { active: false, clipId: null, startedAt: null, mergeStarted: false },
      };

    // Machine-state half of Reset Session. Entity wipes (audio blobs, note,
    // session patch) happen in the runner before this dispatch. The provider
    // override and the record-warning dismissal deliberately survive reset.
    case 'machine/reset':
      return {
        ...createInitialSessionMachineState(),
        view: {
          tab: 'record',
          recordingSkipped: false,
          recordWarnDismissed: state.view.recordWarnDismissed,
        },
        providerOverride: state.providerOverride,
      };

    default:
      return state;
  }
}
