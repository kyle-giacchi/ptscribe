import { describe, expect, it } from 'vitest';
import { sessionMachineReducer } from './reducer';
import {
  initialSessionMachineState,
  type GenerateState,
  type SessionMachineState,
  type TranscribeState,
} from './types';
import { AiCallError } from '@/services/ai/errors';

function makeAiError(provider: 'anthropic' | 'nova' = 'anthropic'): AiCallError {
  return new AiCallError({
    kind: 'network',
    provider,
    attemptsMade: 3,
    message: 'network failed',
  });
}

function seedGenerate(overrides: Partial<GenerateState>): SessionMachineState {
  return {
    ...initialSessionMachineState,
    generate: { ...initialSessionMachineState.generate, ...overrides },
  };
}

function seedTranscribe(overrides: Partial<TranscribeState>): SessionMachineState {
  return {
    ...initialSessionMachineState,
    transcribe: { ...initialSessionMachineState.transcribe, ...overrides },
  };
}

describe('sessionMachineReducer — generate slice', () => {
  describe('generate/start', () => {
    it('transitions idle → generating and clears prior error+retry', () => {
      const dirty = seedGenerate({
        phase: 'error',
        lastRawPayload: 'old',
        aiError: makeAiError(),
        retryStatus: { provider: 'anthropic', attempt: 2, max: 3 },
      });
      const next = sessionMachineReducer(dirty, { type: 'generate/start' });
      expect(next.generate.phase).toBe('generating');
      expect(next.generate.aiError).toBeNull();
      expect(next.generate.retryStatus).toBeNull();
      expect(next.generate.lastRawPayload).toBe('old');
    });

    it('transitions idle → generating from initial state', () => {
      const next = sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
      expect(next.generate.phase).toBe('generating');
    });
  });

  describe('generate/retry', () => {
    it('stores retry status without changing phase', () => {
      const generating = sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
      const next = sessionMachineReducer(generating, {
        type: 'generate/retry',
        status: { provider: 'anthropic', attempt: 1, max: 3 },
      });
      expect(next.generate.phase).toBe('generating');
      expect(next.generate.retryStatus).toEqual({ provider: 'anthropic', attempt: 1, max: 3 });
    });

    it('overwrites prior retry status', () => {
      const seeded = seedGenerate({
        phase: 'generating',
        retryStatus: { provider: 'anthropic', attempt: 1, max: 3 },
      });
      const next = sessionMachineReducer(seeded, {
        type: 'generate/retry',
        status: { provider: 'anthropic', attempt: 2, max: 3 },
      });
      expect(next.generate.retryStatus).toEqual({ provider: 'anthropic', attempt: 2, max: 3 });
    });
  });

  describe('generate/success', () => {
    it('stores rawText, returns to idle, clears retry+error', () => {
      const dirty = seedGenerate({
        phase: 'generating',
        aiError: makeAiError(),
        retryStatus: { provider: 'anthropic', attempt: 2, max: 3 },
      });
      const next = sessionMachineReducer(dirty, {
        type: 'generate/success',
        rawText: '{"a":1}',
      });
      expect(next.generate.phase).toBe('idle');
      expect(next.generate.lastRawPayload).toBe('{"a":1}');
      expect(next.generate.aiError).toBeNull();
      expect(next.generate.retryStatus).toBeNull();
    });
  });

  describe('generate/error', () => {
    it('transitions to error phase with aiError when provided', () => {
      const generating = sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
      const err = makeAiError();
      const next = sessionMachineReducer(generating, { type: 'generate/error', aiError: err });
      expect(next.generate.phase).toBe('error');
      expect(next.generate.aiError).toBe(err);
      expect(next.generate.retryStatus).toBeNull();
    });

    it('transitions to error phase with null aiError (non-AI error path)', () => {
      const generating = sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
      const next = sessionMachineReducer(generating, { type: 'generate/error', aiError: null });
      expect(next.generate.phase).toBe('error');
      expect(next.generate.aiError).toBeNull();
    });
  });

  describe('generate/clearAiError', () => {
    it('drops aiError without changing phase', () => {
      const errored = seedGenerate({
        phase: 'error',
        aiError: makeAiError(),
      });
      const next = sessionMachineReducer(errored, { type: 'generate/clearAiError' });
      expect(next.generate.aiError).toBeNull();
      expect(next.generate.phase).toBe('error');
    });

    it('is a no-op when aiError is already null', () => {
      const next = sessionMachineReducer(initialSessionMachineState, {
        type: 'generate/clearAiError',
      });
      expect(next.generate.aiError).toBeNull();
    });
  });
});

describe('sessionMachineReducer — transcribe slice', () => {
  describe('transcribe/start', () => {
    it('transitions idle → transcribing and clears prior error+retry', () => {
      const dirty = seedTranscribe({
        phase: 'error',
        aiError: makeAiError('nova'),
        retryStatus: { provider: 'nova', attempt: 2, max: 3 },
      });
      const next = sessionMachineReducer(dirty, { type: 'transcribe/start' });
      expect(next.transcribe.phase).toBe('transcribing');
      expect(next.transcribe.aiError).toBeNull();
      expect(next.transcribe.retryStatus).toBeNull();
    });
  });

  describe('transcribe/retry', () => {
    it('stores retry status without changing phase', () => {
      const transcribing = sessionMachineReducer(initialSessionMachineState, {
        type: 'transcribe/start',
      });
      const next = sessionMachineReducer(transcribing, {
        type: 'transcribe/retry',
        status: { provider: 'nova', attempt: 2, max: 3 },
      });
      expect(next.transcribe.phase).toBe('transcribing');
      expect(next.transcribe.retryStatus).toEqual({ provider: 'nova', attempt: 2, max: 3 });
    });
  });

  describe('transcribe/success', () => {
    it('returns to idle, stores debugStats, clears retry+error', () => {
      const dirty = seedTranscribe({
        phase: 'transcribing',
        aiError: makeAiError('nova'),
        retryStatus: { provider: 'nova', attempt: 1, max: 3 },
      });
      const stats = {
        droppedSec: 0,
        originalSec: 0,
        speedSavedSec: 12.5,
        speedOriginalSec: 60,
      };
      const next = sessionMachineReducer(dirty, { type: 'transcribe/success', stats });
      expect(next.transcribe.phase).toBe('idle');
      expect(next.transcribe.debugStats).toEqual(stats);
      expect(next.transcribe.aiError).toBeNull();
      expect(next.transcribe.retryStatus).toBeNull();
    });
  });

  describe('transcribe/empty', () => {
    it('returns to idle with no aiError (200 OK but no text)', () => {
      const transcribing = sessionMachineReducer(initialSessionMachineState, {
        type: 'transcribe/start',
      });
      const next = sessionMachineReducer(transcribing, { type: 'transcribe/empty' });
      expect(next.transcribe.phase).toBe('idle');
      expect(next.transcribe.aiError).toBeNull();
      expect(next.transcribe.retryStatus).toBeNull();
    });
  });

  describe('transcribe/error', () => {
    it('transitions to error phase with AiCallError', () => {
      const transcribing = sessionMachineReducer(initialSessionMachineState, {
        type: 'transcribe/start',
      });
      const err = makeAiError('nova');
      const next = sessionMachineReducer(transcribing, {
        type: 'transcribe/error',
        aiError: err,
      });
      expect(next.transcribe.phase).toBe('error');
      expect(next.transcribe.aiError).toBe(err);
      expect(next.transcribe.retryStatus).toBeNull();
    });

    it('transitions to error phase with null aiError (non-AI error)', () => {
      const transcribing = sessionMachineReducer(initialSessionMachineState, {
        type: 'transcribe/start',
      });
      const next = sessionMachineReducer(transcribing, {
        type: 'transcribe/error',
        aiError: null,
      });
      expect(next.transcribe.phase).toBe('error');
      expect(next.transcribe.aiError).toBeNull();
    });
  });

  describe('transcribe/abort', () => {
    it('returns to idle silently (user-initiated cancel)', () => {
      const dirty = seedTranscribe({
        phase: 'transcribing',
        retryStatus: { provider: 'nova', attempt: 2, max: 3 },
      });
      const next = sessionMachineReducer(dirty, { type: 'transcribe/abort' });
      expect(next.transcribe.phase).toBe('idle');
      expect(next.transcribe.aiError).toBeNull();
      expect(next.transcribe.retryStatus).toBeNull();
    });
  });

  describe('transcribe/clearAiError', () => {
    it('drops aiError without changing phase', () => {
      const errored = seedTranscribe({
        phase: 'error',
        aiError: makeAiError('nova'),
      });
      const next = sessionMachineReducer(errored, { type: 'transcribe/clearAiError' });
      expect(next.transcribe.aiError).toBeNull();
      expect(next.transcribe.phase).toBe('error');
    });
  });
});

describe('sessionMachineReducer — slice isolation', () => {
  it('generate actions do not affect transcribe slice', () => {
    const seeded = seedTranscribe({
      phase: 'transcribing',
      retryStatus: { provider: 'nova', attempt: 1, max: 3 },
    });
    const next = sessionMachineReducer(seeded, { type: 'generate/start' });
    expect(next.transcribe).toBe(seeded.transcribe);
  });

  it('transcribe actions do not affect generate slice', () => {
    const seeded = seedGenerate({
      phase: 'generating',
      lastRawPayload: 'pending',
    });
    const next = sessionMachineReducer(seeded, { type: 'transcribe/start' });
    expect(next.generate).toBe(seeded.generate);
  });
});

describe('sessionMachineReducer — immutability', () => {
  it('returns a new state object on every dispatch', () => {
    const next = sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
    expect(next).not.toBe(initialSessionMachineState);
    expect(next.generate).not.toBe(initialSessionMachineState.generate);
  });

  it('does not mutate input state', () => {
    const before = JSON.parse(JSON.stringify(initialSessionMachineState));
    sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
    sessionMachineReducer(initialSessionMachineState, { type: 'transcribe/start' });
    expect(initialSessionMachineState).toEqual(before);
  });
});
