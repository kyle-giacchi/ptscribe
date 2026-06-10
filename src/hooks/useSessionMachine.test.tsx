import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Note, NoteTemplate, Patient, Session, Settings } from '@/types';
import type { UseRecorder } from './useRecorder';
import type { UseWebSpeechTranscript } from './useLiveTranscript';

// ── Hoisted mock state ──────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  whisperExhausted: false,
  addNote: vi.fn(),
  updateNote: vi.fn(),
  finalizeNote: vi.fn(),
  unfinalizeNote: vi.fn(),
  removeNote: vi.fn(),
  audioRemove: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/contexts/NotesProvider', () => ({
  useNotes: () => ({
    addNote: h.addNote,
    updateNote: h.updateNote,
    finalizeNote: h.finalizeNote,
    unfinalizeNote: h.unfinalizeNote,
    removeNote: h.removeNote,
    notes: [],
  }),
}));
vi.mock('@/contexts/NotificationsProvider', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));
vi.mock('@/services/AudioRepository', () => ({
  audioRepository: {
    save: vi.fn(() => Promise.resolve()),
    load: vi.fn(() => Promise.resolve(null)),
    remove: h.audioRemove,
    clearChunks: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock('@/services/ai/client/localWhisper', () => ({
  whisperLoader: { ensureReady: vi.fn(() => Promise.resolve()) },
  transcribeLocally: vi.fn(),
  LOCAL_WHISPER_DEFAULT_MODEL: 'whisper-tiny.en',
}));
vi.mock('./useWhisperLoading', () => ({
  useWhisperLoading: () => ({ exhausted: h.whisperExhausted }),
}));
vi.mock('./useBackgroundTranscription', () => ({
  useBackgroundTranscription: () => ({ phase: 'idle', progressLabel: '', retry: () => {} }),
}));
vi.mock('@/services/ai/generate', () => ({ generateNote: vi.fn() }));
vi.mock('@/services/ai/transcribe', () => ({ transcribe: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useSessionMachine, type UseSessionMachineParams } from './useSessionMachine';
import { generateNote } from '@/services/ai/generate';
import { toast } from 'sonner';

const mockGenerate = vi.mocked(generateNote);

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeRecorder(overrides: Partial<UseRecorder> = {}): UseRecorder {
  return {
    status: 'idle',
    durationSec: 0,
    getDurationSec: () => 0,
    onChunk: { current: null },
    start: vi.fn(() => Promise.resolve(true)),
    stop: vi.fn(() => Promise.resolve(null)),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    wasBackgrounded: false,
    hardCapStopped: false,
    idleAutoStopped: false,
    recorderInterrupted: false,
    micDisconnected: false,
    ...overrides,
  } as unknown as UseRecorder;
}

const webSpeech = {
  supported: false,
  accumulatedText: '',
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
} as unknown as UseWebSpeechTranscript;

function makeSettings(opts?: {
  phiConfirmDismissed?: boolean;
  transcriptionProvider?: string;
}): Settings {
  return {
    session: {
      phiConfirmDismissed: opts?.phiConfirmDismissed ?? false,
      webSpeechEnabled: false,
    },
    ai: {
      generation: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      transcription: { provider: opts?.transcriptionProvider ?? 'cloudflare' },
    },
    audio: {
      speedUp: { enabled: false, speed: 1.25 },
      silenceDetection: { enabled: false, sensitivity: 0.5, padMs: 100 },
    },
  } as unknown as Settings;
}

const template = {
  id: 'tpl-1',
  name: 'SOAP',
  format: 'soap',
  sections: [{ key: 'subjective', label: 'Subjective' }],
} as unknown as NoteTemplate;
const template2 = {
  id: 'tpl-2',
  name: 'Eval',
  format: 'custom',
  sections: [{ key: 'a', label: 'A' }],
} as unknown as NoteTemplate;
const patient = { id: 'pat-1', firstName: 'A', lastName: 'B' } as unknown as Patient;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    patientId: 'pat-1',
    type: 'follow_up',
    date: 1_000,
    status: 'draft',
    clips: [],
    templateId: 'tpl-1',
    transcript: 'current text',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  } as Session;
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    sessionId: 'sess-1',
    patientId: 'pat-1',
    format: 'soap',
    templateId: 'tpl-1',
    sections: [{ key: 'subjective', label: 'Subjective', body: 'Has content' }],
    finalized: false,
    createdAt: 1,
    updatedAt: 1,
    generatedFromTranscript: 'current text',
    ...overrides,
  } as Note;
}

function makeParams(overrides: Partial<UseSessionMachineParams> = {}): UseSessionMachineParams {
  return {
    session: makeSession(),
    patient,
    note: undefined,
    template,
    allTemplates: [template, template2],
    settings: makeSettings(),
    recorder: makeRecorder(),
    webSpeech,
    patchSession: vi.fn(),
    patchClips: vi.fn(),
    patchClip: vi.fn(),
    persistPhiConfirmDismissed: vi.fn(),
    onEvent: vi.fn(),
    ...overrides,
  };
}

function makeGenerateResult() {
  return {
    sections: [{ key: 'subjective', label: 'Subjective', body: 'Generated.' }],
    rawText: '{"subjective":"Generated."}',
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

beforeEach(() => {
  mockGenerate.mockResolvedValue(makeGenerateResult());
  h.whisperExhausted = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── PHI gate (Generate) ─────────────────────────────────────────────────────

describe('PHI gate', () => {
  it('generate() opens the gate instead of generating when PHI confirm is not dismissed', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.generate('replace'));

    expect(result.current.state.gate).toMatchObject({ kind: 'phi-confirm' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('confirm resumes the parked intent (mode + feedback survive the gate)', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.generate('append', 'shorter please'));
    await act(async () =>
      result.current.actions.resolveGate({
        kind: 'phi-confirm',
        outcome: 'confirm',
        dontShowAgain: false,
      }),
    );

    expect(result.current.state.gate).toBeNull();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ regenerationFeedback: 'shorter please' }),
    );
    expect(params.persistPhiConfirmDismissed).not.toHaveBeenCalled();
  });

  it('confirm with dontShowAgain calls the Settings port exactly once', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.generate());
    await act(async () =>
      result.current.actions.resolveGate({
        kind: 'phi-confirm',
        outcome: 'confirm',
        dontShowAgain: true,
      }),
    );

    expect(params.persistPhiConfirmDismissed).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('cancel discards the parked intent', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.generate());
    await act(async () =>
      result.current.actions.resolveGate({ kind: 'phi-confirm', outcome: 'cancel' }),
    );

    expect(result.current.state.gate).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('skips the gate entirely when phiConfirmDismissed is set', async () => {
    const params = makeParams({ settings: makeSettings({ phiConfirmDismissed: true }) });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.generate());

    expect(result.current.state.gate).toBeNull();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});

// ── Gate exclusivity + mismatched resolution ───────────────────────────────

describe('single-gate invariant', () => {
  it('an intent that would open a second gate is dropped, not queued', async () => {
    const params = makeParams({ note: makeNote() });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.generate());
    expect(result.current.state.gate).toMatchObject({ kind: 'phi-confirm' });

    // Template change over note content would open its own gate — dropped.
    await act(async () => result.current.actions.changeTemplate('tpl-2'));
    expect(result.current.state.gate).toMatchObject({ kind: 'phi-confirm' });
    expect(params.patchSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'tpl-2' }),
    );
  });

  it('resolveGate with a mismatched kind is a no-op', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.generate());
    await act(async () =>
      result.current.actions.resolveGate({ kind: 'reset-confirm', outcome: 'confirm' }),
    );

    expect(result.current.state.gate).toMatchObject({ kind: 'phi-confirm' });
    expect(h.removeNote).not.toHaveBeenCalled();
  });
});

// ── Stale-finalize gate ─────────────────────────────────────────────────────

describe('stale-finalize gate', () => {
  const staleNote = () => makeNote({ generatedFromTranscript: 'old text' });

  it('finalize() opens the gate when the note is stale', async () => {
    const params = makeParams({ note: staleNote() });
    const { result } = renderHook(() => useSessionMachine(params));

    expect(result.current.selectors.noteIsStale).toBe(true);
    await act(async () => result.current.actions.finalize());

    expect(result.current.state.gate).toMatchObject({ kind: 'stale-finalize' });
    expect(h.finalizeNote).not.toHaveBeenCalled();
  });

  it('finalize-anyway finalizes and emits note/finalized', async () => {
    const params = makeParams({ note: staleNote() });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.finalize());
    await act(async () =>
      result.current.actions.resolveGate({ kind: 'stale-finalize', outcome: 'finalize-anyway' }),
    );

    expect(h.finalizeNote).toHaveBeenCalledWith('note-1');
    expect(params.onEvent).toHaveBeenCalledWith({
      type: 'note/finalized',
      sessionId: 'sess-1',
      patientId: 'pat-1',
    });
  });

  it('regenerate re-enters the generate pipeline and may open the PHI gate next', async () => {
    const params = makeParams({ note: staleNote() });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.finalize());
    await act(async () =>
      result.current.actions.resolveGate({ kind: 'stale-finalize', outcome: 'regenerate' }),
    );

    // PHI not dismissed → the regenerate intent parks behind the PHI gate.
    expect(result.current.state.gate).toMatchObject({ kind: 'phi-confirm' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('finalize() with matching inputs skips the gate and emits the event', async () => {
    const params = makeParams({ note: makeNote() });
    const { result } = renderHook(() => useSessionMachine(params));

    expect(result.current.selectors.noteIsStale).toBe(false);
    await act(async () => result.current.actions.finalize());

    expect(result.current.state.gate).toBeNull();
    expect(h.finalizeNote).toHaveBeenCalledWith('note-1');
    expect(params.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'note/finalized' }),
    );
  });
});

// ── Whisper-unavailable gate (Record) ───────────────────────────────────────

describe('whisper-unavailable gate', () => {
  it('startRecording() opens the gate when local Whisper is exhausted', async () => {
    h.whisperExhausted = true;
    const recorder = makeRecorder();
    const params = makeParams({
      recorder,
      settings: makeSettings({ transcriptionProvider: 'local' }),
    });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.startRecording());

    expect(result.current.state.gate).toMatchObject({ kind: 'whisper-unavailable' });
    expect(recorder.start).not.toHaveBeenCalled();
  });

  it('record-without-transcription sets the override, then starts recording', async () => {
    h.whisperExhausted = true;
    const recorder = makeRecorder();
    const params = makeParams({
      recorder,
      settings: makeSettings({ transcriptionProvider: 'local' }),
    });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.startRecording());
    await act(async () =>
      result.current.actions.resolveGate({
        kind: 'whisper-unavailable',
        outcome: 'record-without-transcription',
      }),
    );

    expect(result.current.state.providerOverride).toBe('none');
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });

  it('cancel neither starts recording nor sets an override', async () => {
    h.whisperExhausted = true;
    const recorder = makeRecorder();
    const params = makeParams({
      recorder,
      settings: makeSettings({ transcriptionProvider: 'local' }),
    });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.startRecording());
    await act(async () =>
      result.current.actions.resolveGate({ kind: 'whisper-unavailable', outcome: 'cancel' }),
    );

    expect(result.current.state.providerOverride).toBeNull();
    expect(recorder.start).not.toHaveBeenCalled();
  });

  it('startRecording() bypasses the gate for non-local providers', async () => {
    h.whisperExhausted = true;
    const recorder = makeRecorder();
    const params = makeParams({ recorder }); // provider: 'cloudflare'
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.startRecording());

    expect(result.current.state.gate).toBeNull();
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });
});

// ── Template-change gate ────────────────────────────────────────────────────

describe('template-change gate', () => {
  it('opens only when the note has content, and confirm applies the switch', async () => {
    const params = makeParams({ note: makeNote() });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.changeTemplate('tpl-2'));
    expect(result.current.state.gate).toMatchObject({
      kind: 'template-change',
      targetTemplateId: 'tpl-2',
    });

    await act(async () =>
      result.current.actions.resolveGate({ kind: 'template-change', outcome: 'confirm' }),
    );

    expect(params.patchSession).toHaveBeenCalledWith({ templateId: 'tpl-2' });
    // Sections reset to the incoming template's skeleton (replaceSections → updateNote).
    expect(h.updateNote).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({ sections: [{ key: 'a', label: 'A', body: '' }] }),
    );
  });

  it('switches directly when the note has no content', async () => {
    const params = makeParams({
      note: makeNote({ sections: [{ key: 'subjective', label: 'Subjective', body: '  ' }] }),
    });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.changeTemplate('tpl-2'));

    expect(result.current.state.gate).toBeNull();
    expect(params.patchSession).toHaveBeenCalledWith({ templateId: 'tpl-2' });
  });
});

// ── Reset-confirm gate ──────────────────────────────────────────────────────

describe('reset-confirm gate', () => {
  it('refuses with a toast while recording', async () => {
    const params = makeParams({ recorder: makeRecorder({ status: 'recording' }) });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.requestReset());

    expect(result.current.state.gate).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Stop recording before resetting the session.');
  });

  it('confirm wipes audio, note, session fields, and machine state, then emits session/reset', async () => {
    const clips = [
      { id: 'c1', index: 0, durationSec: 5, status: 'ready', createdAt: 1, updatedAt: 1 },
      { id: 'c2', index: 1, durationSec: 7, status: 'ready', createdAt: 2, updatedAt: 2 },
    ] as Session['clips'];
    const params = makeParams({ session: makeSession({ clips, noteId: 'note-1' }) });
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.requestReset());
    expect(result.current.state.gate).toMatchObject({ kind: 'reset-confirm' });

    await act(async () =>
      result.current.actions.resolveGate({ kind: 'reset-confirm', outcome: 'confirm' }),
    );

    expect(h.audioRemove).toHaveBeenCalledWith('c1');
    expect(h.audioRemove).toHaveBeenCalledWith('c2');
    expect(h.removeNote).toHaveBeenCalledWith('note-1');
    expect(params.patchSession).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', clips: [], noteId: undefined }),
    );
    expect(result.current.state.transcript.baseline).toBe('');
    expect(result.current.state.view.tab).toBe('record');
    expect(params.onEvent).toHaveBeenCalledWith({ type: 'session/reset', sessionId: 'sess-1' });
  });
});

// ── Transcript document + view seeding ──────────────────────────────────────

describe('transcript document', () => {
  it('seeds the baseline from the session once per mount', () => {
    const { result } = renderHook(() => useSessionMachine(makeParams()));
    expect(result.current.selectors.effectiveTranscript).toBe('current text');
  });

  it('edit is in-memory; commit persists the overlay through patchSession', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useSessionMachine(params));

    await act(async () => result.current.actions.editTranscript('hand-edited text'));
    expect(result.current.selectors.effectiveTranscript).toBe('hand-edited text');
    expect(result.current.selectors.hasUserEdits).toBe(true);
    expect(params.patchSession).not.toHaveBeenCalled();

    await act(async () => result.current.actions.commitTranscriptEdits());
    expect(params.patchSession).toHaveBeenCalledWith({
      editedTranscript: 'hand-edited text',
      activeTranscriptTier: 'edited',
    });
  });

  it('quickMode initial intent starts on the review tab with recording skipped', () => {
    const { result } = renderHook(() =>
      useSessionMachine(makeParams({ initial: { quickMode: true } })),
    );
    expect(result.current.state.view.tab).toBe('review');
    expect(result.current.state.view.recordingSkipped).toBe(true);
    expect(result.current.selectors.isTranscriptLocked).toBe(false);
  });
});
