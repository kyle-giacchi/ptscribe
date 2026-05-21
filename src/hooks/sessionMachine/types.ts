import type { AiCallError } from '@/services/ai/errors';

export type GeneratePhase = 'idle' | 'generating' | 'error';

export interface RetryStatus {
  provider: 'anthropic' | 'nova';
  attempt: number;
  max: number;
}

export interface GenerateState {
  phase: GeneratePhase;
  lastRawPayload: string | null;
  aiError: AiCallError | null;
  retryStatus: RetryStatus | null;
}

export interface SessionMachineState {
  generate: GenerateState;
}

export type SessionMachineAction =
  | { type: 'generate/start' }
  | { type: 'generate/retry'; status: RetryStatus }
  | { type: 'generate/success'; rawText: string }
  | { type: 'generate/error'; aiError: AiCallError | null }
  | { type: 'generate/clearAiError' };

export const initialSessionMachineState: SessionMachineState = {
  generate: {
    phase: 'idle',
    lastRawPayload: null,
    aiError: null,
    retryStatus: null,
  },
};
