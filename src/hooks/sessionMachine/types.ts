import type { AiCallError } from '@/services/ai/errors';
import type { AiDebugPrompts, GenerateKeyReport } from '@/types';

// ── Shared ────────────────────────────────────────────────────────────────

export interface RetryStatus {
  provider: 'anthropic' | 'nova' | 'openai' | 'google';
  attempt: number;
  max: number;
}

// ── Generate slice ────────────────────────────────────────────────────────

export type GeneratePhase = 'idle' | 'generating' | 'error';

export interface GenerateState {
  phase: GeneratePhase;
  lastRawPayload: string | null;
  lastAiPrompts: AiDebugPrompts | null;
  lastKeyReport: GenerateKeyReport | null;
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

// ── Workflow gates (CONTEXT.md §Workflow gate) ────────────────────────────
// A gate is a blocking dialog raised by the workflow itself: it intercepts an
// action, holds the pending intent, and either resumes it (confirm outcome)
// or discards it (cancel). At most one gate is open at a time — `gate/open`
// while a gate is already open is a no-op (the triggering intent is dropped,
// not queued).

export type SessionGate =
  /** PHI confirmation before Generate. Holds the parked generate intent. */
  | { kind: 'phi-confirm'; intent: { mode: 'replace' | 'append'; feedback?: string } }
  /** Stale-note confirmation before Finalize (CONTEXT.md §Note staleness). */
  | { kind: 'stale-finalize' }
  /** Local Whisper unavailable before Recording (CONTEXT.md §T2 failure handling). */
  | { kind: 'whisper-unavailable' }
  /** Content-loss confirmation before switching templates over note text. */
  | { kind: 'template-change'; targetTemplateId: string }
  /** Confirmation before wiping clips, transcripts, and the note. */
  | { kind: 'reset-confirm' };

export type GateResolution =
  | { kind: 'phi-confirm'; outcome: 'confirm'; dontShowAgain: boolean }
  | { kind: 'phi-confirm'; outcome: 'cancel' }
  | { kind: 'stale-finalize'; outcome: 'cancel' | 'regenerate' | 'finalize-anyway' }
  | {
      kind: 'whisper-unavailable';
      outcome: 'use-web-speech' | 'record-without-transcription' | 'cancel';
    }
  | { kind: 'template-change'; outcome: 'confirm' | 'cancel' }
  | { kind: 'reset-confirm'; outcome: 'confirm' | 'cancel' };

// ── View slice (workflow view, not layout) ────────────────────────────────

export interface ViewState {
  tab: 'record' | 'review';
  /** "Skip — edit manually" entry: review tab is reachable with zero clips. */
  recordingSkipped: boolean;
  /** Once dismissed per session, the re-record warning does not resurface. */
  recordWarnDismissed: boolean;
}

// ── Transcript document slice ─────────────────────────────────────────────
// The machine baseline + the clinician's in-memory edit overlay. The
// effective transcript (edited if non-blank, else baseline) is a selector.

export interface TranscriptDocState {
  baseline: string;
  edited: string;
}

// ── Upload-processing flow slice ──────────────────────────────────────────
// Drives the UploadProcessingView choreography: upload → clip saved → merge
// + T2 (skipNav) → ≥2 s minimum display → navigate to review.

export interface UploadFlowState {
  /** True from upload start until the flow clears (success, bail, or error). */
  active: boolean;
  clipId: string | null;
  /** Timestamp when the processing screen appeared (min-display anchor). */
  startedAt: number | null;
  /** Guards the one-shot merge+T2 kick for the current upload. */
  mergeStarted: boolean;
}

// ── Combined state ────────────────────────────────────────────────────────

export interface SessionMachineState {
  generate: GenerateState;
  transcribe: TranscribeState;
  capture: CaptureState;
  view: ViewState;
  transcript: TranscriptDocState;
  gate: SessionGate | null;
  /** Session-scoped live-transcription override set by the whisper gate.
   *  In-memory only; never persisted; survives machine/reset by design. */
  providerOverride: 'webspeech' | 'none' | null;
  uploadFlow: UploadFlowState;
  /** Banner-level, user-actionable error (ErrorBanner). AI errors live in
   *  the generate/transcribe slices. */
  error: string | null;
}

export type SessionMachineAction =
  // generate
  | { type: 'generate/start' }
  | { type: 'generate/retry'; status: RetryStatus }
  | {
      type: 'generate/success';
      rawText: string;
      prompts: AiDebugPrompts;
      keyReport: GenerateKeyReport;
    }
  | { type: 'generate/error'; aiError: AiCallError | null }
  | { type: 'generate/clearAiError' }
  // transcribe (T3 cloud Nova)
  | { type: 'transcribe/start' }
  | { type: 'transcribe/retry'; status: RetryStatus }
  | { type: 'transcribe/success'; stats: TranscribeDebugStats }
  | { type: 'transcribe/empty' }
  | { type: 'transcribe/error'; aiError: AiCallError | null }
  | { type: 'transcribe/abort' }
  | { type: 'transcribe/clearAiError' }
  // capture
  | { type: 'capture/upload'; status: UploadStatus }
  // view
  | { type: 'view/setTab'; tab: 'record' | 'review' }
  | { type: 'view/skipRecording' }
  | { type: 'view/dismissRecordWarning' }
  // transcript document
  | { type: 'transcript/setBaseline'; text: string }
  | { type: 'transcript/setEdited'; text: string }
  // gates
  | { type: 'gate/open'; gate: SessionGate }
  | { type: 'gate/close' }
  // provider override
  | { type: 'override/set'; value: 'webspeech' | 'none' | null }
  // error banner
  | { type: 'error/set'; message: string | null }
  // upload-processing flow
  | { type: 'uploadFlow/begin' }
  | { type: 'uploadFlow/clipSaved'; clipId: string; startedAt: number }
  | { type: 'uploadFlow/mergeStarted' }
  | { type: 'uploadFlow/clear' }
  // session reset (machine-state half; entity wipes happen in the runner)
  | { type: 'machine/reset' };

export interface SessionMachineInit {
  /** ?mode=quick — start on the review tab with recording skipped. */
  quickMode?: boolean;
  /** Transcript baseline seeded once per mount from session.transcript. */
  baseline?: string;
  /** Edit overlay seeded once per mount from session.editedTranscript. */
  edited?: string;
}

export function createInitialSessionMachineState(init?: SessionMachineInit): SessionMachineState {
  return {
    generate: {
      phase: 'idle',
      lastRawPayload: null,
      lastAiPrompts: null,
      lastKeyReport: null,
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
    view: {
      tab: init?.quickMode ? 'review' : 'record',
      recordingSkipped: init?.quickMode ?? false,
      recordWarnDismissed: false,
    },
    transcript: {
      baseline: init?.baseline ?? '',
      edited: init?.edited ?? '',
    },
    gate: null,
    providerOverride: null,
    uploadFlow: { active: false, clipId: null, startedAt: null, mergeStarted: false },
    error: null,
  };
}

export const initialSessionMachineState: SessionMachineState = createInitialSessionMachineState();
