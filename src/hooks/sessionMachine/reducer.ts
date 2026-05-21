import type { SessionMachineAction, SessionMachineState } from './types';

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

    default:
      return state;
  }
}
