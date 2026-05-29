import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeneratePhase, type UseGeneratePhaseParams } from './useGeneratePhase';
import { MAX_GENERATES_PER_SESSION } from './useActionGuard';
import type { GenerateNoteResult } from '@/services/ai/generate';
import type { NoteTemplate, Patient, Session, Settings } from '@/types';

const updateNote = vi.fn();
const addNote = vi.fn();
const finalizeNote = vi.fn();
const unfinalizeNote = vi.fn();

vi.mock('@/contexts/NotesProvider', () => ({
  useNotes: () => ({ addNote, updateNote, finalizeNote, unfinalizeNote, notes: [] }),
}));

vi.mock('@/services/ai/generate', () => ({
  generateNote: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { generateNote } from '@/services/ai/generate';
import { toast } from 'sonner';

const mockGenerate = vi.mocked(generateNote);

function makeResult(): GenerateNoteResult {
  return {
    sections: [{ key: 'subjective', label: 'Subjective', body: 'Patient reports improvement.' }],
    rawText: '{"subjective":"Patient reports improvement."}',
    debugPrompts: { model: 'claude-sonnet-4-6', system: 's', modifierBlock: '', user: 'u' },
    keyReport: {
      matched: ['subjective'],
      returned: ['subjective'],
      expected: ['subjective'],
      missing: [],
      unexpected: [],
      emptyMatched: [],
    },
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const now = 1_000;
  return {
    id: 'sess-1',
    patientId: 'pat-1',
    type: 'follow_up',
    date: now,
    status: 'draft',
    clips: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const template = { id: 'tpl-1', format: 'soap', sections: [{ key: 'subjective', label: 'Subjective' }] } as unknown as NoteTemplate;
const patient = { id: 'pat-1', firstName: 'A', lastName: 'B' } as unknown as Patient;
const settings = { ai: { generation: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } } as unknown as Settings;

const allowGuard: UseGeneratePhaseParams['checkActionGuard'] = () => ({ allowed: true });

function makeParams(overrides: Partial<UseGeneratePhaseParams> = {}): UseGeneratePhaseParams {
  return {
    session: makeSession(),
    patient,
    note: undefined,
    template,
    transcript: 'A real transcript with content.',
    settings,
    patchSession: vi.fn(),
    setError: vi.fn(),
    setBusy: vi.fn(),
    dispatch: vi.fn(),
    checkActionGuard: vi.fn(allowGuard),
    recordAction: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockGenerate.mockResolvedValue(makeResult());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useGeneratePhase — persisted generate cap', () => {
  it('blocks generation when session.generateCount has reached MAX_GENERATES_PER_SESSION', async () => {
    const params = makeParams({
      session: makeSession({ generateCount: MAX_GENERATES_PER_SESSION }),
    });
    const { result } = renderHook(() => useGeneratePhase(params));

    await act(async () => {
      await result.current.run('replace');
    });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining(`${MAX_GENERATES_PER_SESSION} per session`),
    );
    // No status patch — the run bailed before dispatching/patching 'generating'.
    expect(params.patchSession).not.toHaveBeenCalled();
  });

  it('increments generateCount by exactly 1, folded into the terminal success patch', async () => {
    const params = makeParams({ session: makeSession({ generateCount: 0 }) });
    const { result } = renderHook(() => useGeneratePhase(params));

    await act(async () => {
      await result.current.run('replace');
    });

    const patch = vi.mocked(params.patchSession);
    // The terminal success patch carries BOTH status:'ready' and generateCount:1
    // in a single object — a separate increment patch would clobber status.
    const terminal = patch.mock.calls.find(([p]) => p.status === 'ready');
    expect(terminal).toBeDefined();
    expect(terminal![0]).toMatchObject({ status: 'ready', generateCount: 1 });

    // No patchSession call sets generateCount without also carrying status (no clobber).
    const orphanIncrement = patch.mock.calls.find(
      ([p]) => p.generateCount !== undefined && p.status === undefined,
    );
    expect(orphanIncrement).toBeUndefined();
  });

  it('counts from the persisted value, not from zero', async () => {
    const params = makeParams({ session: makeSession({ generateCount: 4 }) });
    const { result } = renderHook(() => useGeneratePhase(params));

    await act(async () => {
      await result.current.run('replace');
    });

    const patch = vi.mocked(params.patchSession);
    const terminal = patch.mock.calls.find(([p]) => p.status === 'ready');
    expect(terminal![0]).toMatchObject({ generateCount: 5 });
  });
});

describe('useGeneratePhase — finalize stamps finalizedAt', () => {
  it('stamps finalizedAt alongside status:finalized in a single patch', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(777_000);
    const params = makeParams();
    const { result } = renderHook(() => useGeneratePhase(params));

    act(() => result.current.finalize());

    expect(params.patchSession).toHaveBeenCalledWith({ status: 'finalized', finalizedAt: 777_000 });
    now.mockRestore();
  });

  it('clears finalizedAt when a finalized session is re-opened', () => {
    const params = makeParams({
      note: { id: 'note-1', sections: [] } as never,
      session: makeSession({ status: 'finalized', finalizedAt: 777_000 }),
    });
    const { result } = renderHook(() => useGeneratePhase(params));

    act(() => result.current.unfinalize());

    expect(params.patchSession).toHaveBeenCalledWith({ status: 'ready', finalizedAt: undefined });
  });
});
