import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBackgroundTranscription } from './useBackgroundTranscription';
import type { Session } from '@/types';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockAddNotification = vi.fn();
vi.mock('@/contexts/NotificationsProvider', () => ({
  useNotifications: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('@/lib/audio/vadML', () => ({
  findSpeechRangesML: vi.fn(),
}));

vi.mock('@/lib/audio/vad', () => ({
  DEFAULT_VAD_OPTIONS: {},
}));

vi.mock('@/lib/audio/silenceTrim', () => ({
  extractRanges: vi.fn(),
  trimSilence: vi.fn(),
}));

vi.mock('@/services/ai/client/localWhisper', () => ({
  blobToFloat32: vi.fn(),
  transcribeFloat32Parallel: vi.fn(),
  LOCAL_WHISPER_DEFAULT_MODEL: 'Xenova/whisper-tiny.en',
  getWhisperPreloadPromise: vi.fn(),
}));

// ── Import mocked functions ───────────────────────────────────────────────────

import { findSpeechRangesML } from '@/lib/audio/vadML';
import { extractRanges } from '@/lib/audio/silenceTrim';
import {
  blobToFloat32,
  transcribeFloat32Parallel,
  getWhisperPreloadPromise,
} from '@/services/ai/client/localWhisper';

const mockFindSpeechRangesML = vi.mocked(findSpeechRangesML);
const mockExtractRanges = vi.mocked(extractRanges);
const mockBlobToFloat32 = vi.mocked(blobToFloat32);
const mockTranscribeFloat32Parallel = vi.mocked(transcribeFloat32Parallel);
const mockGetWhisperPreloadPromise = vi.mocked(getWhisperPreloadPromise);

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLES = 32_000; // 2 seconds — above the 0.5s minimum

function makeSession(overrides: Partial<Session> = {}): Session {
  return { id: 'sess1', status: 'draft', ...overrides } as Session;
}

function makeSilencedBlob() {
  return new Blob([new Uint8Array(100)], { type: 'audio/webm' });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockGetWhisperPreloadPromise.mockResolvedValue(undefined);
  mockBlobToFloat32.mockResolvedValue(new Float32Array(SAMPLES));
  mockFindSpeechRangesML.mockResolvedValue([{ startSec: 0, endSec: 2 }]);
  mockExtractRanges.mockReturnValue(new Float32Array(SAMPLES));
  mockTranscribeFloat32Parallel.mockResolvedValue(['hello world']);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useBackgroundTranscription — guard conditions', () => {
  it('does nothing when session is undefined', async () => {
    const patchSession = vi.fn();

    renderHook(() =>
      useBackgroundTranscription({
        session: undefined,
        patchSession,
        setTranscript: vi.fn(),
        silencedMergedBlob: makeSilencedBlob(),
      }),
    );

    // Allow effects to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(patchSession).not.toHaveBeenCalled();
    expect(mockBlobToFloat32).not.toHaveBeenCalled();
  });

  it('does nothing when silencedMergedBlob is null', async () => {
    const patchSession = vi.fn();

    renderHook(() =>
      useBackgroundTranscription({
        session: makeSession(),
        patchSession,
        setTranscript: vi.fn(),
        silencedMergedBlob: null,
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(patchSession).not.toHaveBeenCalled();
    expect(mockBlobToFloat32).not.toHaveBeenCalled();
  });
});

describe('useBackgroundTranscription — T2 success path', () => {
  it('calls Whisper and patches session with t2Transcript', async () => {
    const patchSession = vi.fn();
    const setTranscript = vi.fn();

    renderHook(() =>
      useBackgroundTranscription({
        session: makeSession(),
        patchSession,
        setTranscript,
        silencedMergedBlob: makeSilencedBlob(),
      }),
    );

    await waitFor(() => expect(patchSession).toHaveBeenCalled());

    expect(patchSession).toHaveBeenCalledWith(
      expect.objectContaining({
        t2Transcript: 'hello world',
        transcript: 'hello world',
        activeTranscriptTier: 't2',
      }),
    );
    expect(setTranscript).toHaveBeenCalledWith('hello world');
  });

  it('awaits the Whisper preload promise before transcribing', async () => {
    let resolvePreload!: () => void;
    mockGetWhisperPreloadPromise.mockReturnValue(
      new Promise<void>((r) => { resolvePreload = r; }),
    );

    const patchSession = vi.fn();

    renderHook(() =>
      useBackgroundTranscription({
        session: makeSession(),
        patchSession,
        setTranscript: vi.fn(),
        silencedMergedBlob: makeSilencedBlob(),
      }),
    );

    // Preload not resolved — Whisper should not have run yet
    await new Promise((r) => setTimeout(r, 20));
    expect(mockBlobToFloat32).not.toHaveBeenCalled();

    resolvePreload();
    await waitFor(() => expect(patchSession).toHaveBeenCalled());
    expect(mockBlobToFloat32).toHaveBeenCalled();
  });
});

describe('useBackgroundTranscription — T3 guard', () => {
  it('does not patch session when t3Transcript already exists', async () => {
    const patchSession = vi.fn();

    renderHook(() =>
      useBackgroundTranscription({
        session: makeSession({ t3Transcript: 'cloud result' }),
        patchSession,
        setTranscript: vi.fn(),
        silencedMergedBlob: makeSilencedBlob(),
      }),
    );

    // Whisper runs but result is discarded
    await waitFor(() => expect(mockBlobToFloat32).toHaveBeenCalled());
    await waitFor(() => expect(mockTranscribeFloat32Parallel).toHaveBeenCalled());

    // Allow .then() to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(patchSession).not.toHaveBeenCalled();
  });
});

describe('useBackgroundTranscription — speech-not-found', () => {
  it('shows a warning notification when Whisper finds no speech', async () => {
    // Return too few samples to pass the 0.5s minimum threshold after VAD
    mockExtractRanges.mockReturnValue(new Float32Array(100)); // < SR * 0.5 = 8000

    renderHook(() =>
      useBackgroundTranscription({
        session: makeSession(),
        patchSession: vi.fn(),
        setTranscript: vi.fn(),
        silencedMergedBlob: makeSilencedBlob(),
      }),
    );

    await waitFor(() => expect(mockAddNotification).toHaveBeenCalled());

    expect(mockAddNotification).toHaveBeenCalledWith(
      'warning',
      expect.any(String),
    );
  });
});

describe('useBackgroundTranscription — re-run on blob change', () => {
  it('re-runs T2 when silencedMergedBlob changes', async () => {
    const blob1 = new Blob([new Uint8Array(100)]);
    const blob2 = new Blob([new Uint8Array(200)]);
    const patchSession = vi.fn();

    const { rerender } = renderHook(
      ({ blob }: { blob: Blob }) =>
        useBackgroundTranscription({
          session: makeSession(),
          patchSession,
          setTranscript: vi.fn(),
          silencedMergedBlob: blob,
        }),
      { initialProps: { blob: blob1 } },
    );

    await waitFor(() => expect(patchSession).toHaveBeenCalledTimes(1));

    rerender({ blob: blob2 });

    await waitFor(() => expect(patchSession).toHaveBeenCalledTimes(2));
  });

  it('does not run a second time when the same blob instance is kept', async () => {
    const blob = new Blob([new Uint8Array(100)]);
    const patchSession = vi.fn();
    const session = makeSession();

    const { rerender } = renderHook(() =>
      useBackgroundTranscription({
        session,
        patchSession,
        setTranscript: vi.fn(),
        silencedMergedBlob: blob,
      }),
    );

    await waitFor(() => expect(patchSession).toHaveBeenCalledTimes(1));

    rerender();
    await new Promise((r) => setTimeout(r, 50));

    expect(patchSession).toHaveBeenCalledTimes(1);
  });
});
