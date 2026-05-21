import type { AiCallError } from '@/services/ai/errors';

// ── Shared ────────────────────────────────────────────────────────────────

export interface RetryStatus {
  provider: 'anthropic' | 'nova';
  attempt: number;
  max: number;
}

// ── Generate slice ────────────────────────────────────────────────────────

export type GeneratePhase = 'idle' | 'generating' | 'error';

export interface GenerateState {
  phase: GeneratePhase;
  lastRawPayload: string | null;
  aiError: AiCallError | null;
  retryStatus: RetryStatus | null;
}

// ── Transcribe slice ──────────────────────────────────────────────────────

export type TranscribePhase = 'idle' | 'transcribing' | 'error';

export interface TranscribeDebugStats {
  droppedSec: number;
  originalSec: number;
  speedSavedSec: number;
  speedOriginalSec: number;
}

export interface TranscribeState {
  phase: TranscribePhase;
  aiError: AiCallError | null;
  retryStatus: RetryStatus | null;
  debugStats: TranscribeDebugStats | null;
}

// ── Capture slice ─────────────────────────────────────────────────────────

export type UploadPhase = 'idle' | 'reading' | 'saving' | 'done' | 'error';

export interface UploadStatus {
  phase: UploadPhase;
  message: string;
}

export interface CaptureState {
  uploadStatus: UploadStatus;
}

// ── Combined state ────────────────────────────────────────────────────────

export interface SessionMachineState {
  generate: GenerateState;
  transcribe: TranscribeState;
  capture: CaptureState;
}

export type SessionMachineAction =
  // generate
  | { type: 'generate/start' }
  | { type: 'generate/retry'; status: RetryStatus }
  | { type: 'generate/success'; rawText: string }
  | { type: 'generate/error'; aiError: AiCallError | null }
  | { type: 'generate/clearAiError' }
  // transcribe
  | { type: 'transcribe/start' }
  | { type: 'transcribe/retry'; status: RetryStatus }
  | { type: 'transcribe/success'; stats: TranscribeDebugStats }
  | { type: 'transcribe/empty' }
  | { type: 'transcribe/error'; aiError: AiCallError | null }
  | { type: 'transcribe/abort' }
  | { type: 'transcribe/clearAiError' }
  // capture
  | { type: 'capture/upload'; status: UploadStatus };

export const initialSessionMachineState: SessionMachineState = {
  generate: {
    phase: 'idle',
    lastRawPayload: null,
    aiError: null,
    retryStatus: null,
  },
  transcribe: {
    phase: 'idle',
    aiError: null,
    retryStatus: null,
    debugStats: null,
  },
  capture: {
    uploadStatus: { phase: 'idle', message: '' },
  },
};
