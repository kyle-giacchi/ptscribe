import { describe, expect, it } from 'vitest';
import { sessionMachineReducer } from './reducer';
import { initialSessionMachineState, type SessionMachineState } from './types';
import { AiCallError } from '@/services/ai/errors';

function makeAiError(): AiCallError {
  return new AiCallError({
    kind: 'network',
    provider: 'anthropic',
    attemptsMade: 3,
    message: 'network failed',
  });
}

describe('sessionMachineReducer', () => {
  describe('generate/start', () => {
    it('transitions idle → generating and clears prior error+retry', () => {
      const dirty: SessionMachineState = {
        generate: {
          phase: 'error',
          lastRawPayload: 'old',
          aiError: makeAiError(),
          retryStatus: { provider: 'anthropic', attempt: 2, max: 3 },
        },
      };
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
      const seeded: SessionMachineState = {
        generate: {
          phase: 'generating',
          lastRawPayload: null,
          aiError: null,
          retryStatus: { provider: 'anthropic', attempt: 1, max: 3 },
        },
      };
      const next = sessionMachineReducer(seeded, {
        type: 'generate/retry',
        status: { provider: 'anthropic', attempt: 2, max: 3 },
      });
      expect(next.generate.retryStatus).toEqual({ provider: 'anthropic', attempt: 2, max: 3 });
    });
  });

  describe('generate/success', () => {
    it('stores rawText, returns to idle, clears retry+error', () => {
      const dirty: SessionMachineState = {
        generate: {
          phase: 'generating',
          lastRawPayload: null,
          aiError: makeAiError(),
          retryStatus: { provider: 'anthropic', attempt: 2, max: 3 },
        },
      };
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
      const errored: SessionMachineState = {
        generate: {
          phase: 'error',
          lastRawPayload: null,
          aiError: makeAiError(),
          retryStatus: null,
        },
      };
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

  describe('immutability', () => {
    it('returns a new state object on every dispatch', () => {
      const next = sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
      expect(next).not.toBe(initialSessionMachineState);
      expect(next.generate).not.toBe(initialSessionMachineState.generate);
    });

    it('does not mutate input state', () => {
      const before = JSON.parse(JSON.stringify(initialSessionMachineState));
      sessionMachineReducer(initialSessionMachineState, { type: 'generate/start' });
      expect(initialSessionMachineState).toEqual(before);
    });
  });
});
