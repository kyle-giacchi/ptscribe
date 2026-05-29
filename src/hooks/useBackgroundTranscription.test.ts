import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useBackgroundTranscription,
  transcribeWithLocalWhisper,
} from './useBackgroundTranscription';
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
}));

// ── Import mocked functions ───────────────────────────────────────────────────

import { findSpeechRangesML } from '@/lib/audio/vadML';
import { extractRanges } from '@/lib/audio/silenceTrim';
import { blobToFloat32, transcribeFloat32Parallel } from '@/services/ai/client/localWhisper';

const mockFindSpeechRangesML = vi.mocked(findSpeechRangesML);
const mockExtractRanges = vi.mocked(extractRanges);
const mockBlobToFloat32 = vi.mocked(blobToFloat32);
const mockTranscribeFloat32Parallel = vi.mocked(transcribeFloat32Parallel);

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

    expect(mockAddNotification).toHaveBeenCalledWith('warning', expect.any(String));
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

// ── Abort behavior (Plan 13) ────────────────────────────────────────────────

/**
 * Replace `transcribeFloat32Parallel` with a deferred promise so a pass can be
 * held in-flight while we mutate the hook (change blob / unmount). Returns a
 * `resolve` to settle the held pass afterwards, plus the captured abort signal.
 */
function deferParallelPass() {
  let resolve!: (texts: string[]) => void;
  const captured: { signal?: AbortSignal } = {};
  mockTranscribeFloat32Parallel.mockImplementation(async () => {
    return new Promise<string[]>((res) => {
      resolve = res;
    });
  });
  return { resolve: (texts: string[]) => resolve(texts), captured };
}

describe('useBackgroundTranscription — abort on blob change', () => {
  it('aborts the prior pass and starts a fresh one when the blob changes mid-pass', async () => {
    const { resolve } = deferParallelPass();
    const blob1 = new Blob([new Uint8Array(100)]);
    const blob2 = new Blob([new Uint8Array(200)]);
    const patchSession = vi.fn();
    const setTranscript = vi.fn();
    const session = makeSession();

    const { rerender } = renderHook(
      ({ blob }: { blob: Blob }) =>
        useBackgroundTranscription({
          session,
          patchSession,
          setTranscript,
          silencedMergedBlob: blob,
        }),
      { initialProps: { blob: blob1 } },
    );

    // First pass is now in-flight (parallel call entered, awaiting resolve).
    await waitFor(() => expect(mockTranscribeFloat32Parallel).toHaveBeenCalledTimes(1));

    // Swap to a fresh parallel impl for the second pass so it can complete.
    mockTranscribeFloat32Parallel.mockResolvedValue(['second pass']);

    // Change the blob mid-pass — reset effect should abort the first controller.
    rerender({ blob: blob2 });

    // Second pass should complete and patch with its result.
    await waitFor(() =>
      expect(patchSession).toHaveBeenCalledWith(
        expect.objectContaining({ t2Transcript: 'second pass' }),
      ),
    );

    // Now resolve the (aborted) first pass; its guard must drop the write so the
    // only patch is from the second pass.
    resolve(['first pass — should be dropped']);
    await new Promise((r) => setTimeout(r, 50));

    const patchedTexts = patchSession.mock.calls.map(
      (c) => (c[0] as { t2Transcript?: string }).t2Transcript,
    );
    expect(patchedTexts).not.toContain('first pass — should be dropped');
    expect(setTranscript).not.toHaveBeenCalledWith('first pass — should be dropped');
  });
});

describe('useBackgroundTranscription — abort on unmount', () => {
  it('does not patchSession/setTranscript after unmount mid-pass', async () => {
    const { resolve } = deferParallelPass();
    const patchSession = vi.fn();
    const setTranscript = vi.fn();
    const blob = makeSilencedBlob();
    const session = makeSession();

    const { unmount } = renderHook(() =>
      useBackgroundTranscription({
        session,
        patchSession,
        setTranscript,
        silencedMergedBlob: blob,
      }),
    );

    await waitFor(() => expect(mockTranscribeFloat32Parallel).toHaveBeenCalledTimes(1));

    // Unmount while the pass is in-flight — unmount effect aborts the controller.
    unmount();

    // Resolve after unmount; the abort guard in .then must bail before any write.
    resolve(['post-unmount result']);
    await new Promise((r) => setTimeout(r, 50));

    expect(patchSession).not.toHaveBeenCalled();
    expect(setTranscript).not.toHaveBeenCalled();
  });
});

describe('transcribeWithLocalWhisper — direct abort checks', () => {
  it('returns { ok: false, error: "Aborted." } for a pre-aborted signal without calling the parallel pass', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await transcribeWithLocalWhisper(
      makeSilencedBlob(),
      undefined,
      controller.signal,
    );

    expect(result).toEqual({ ok: false, error: 'Aborted.' });
    expect(mockTranscribeFloat32Parallel).not.toHaveBeenCalled();
    expect(mockBlobToFloat32).not.toHaveBeenCalled();
  });

  it('aborts after decode (before VAD/parallel) when the signal trips during blobToFloat32', async () => {
    const controller = new AbortController();
    // Abort while decoding; the post-decode check should catch it before any
    // VAD work or the parallel Whisper pass runs.
    mockBlobToFloat32.mockImplementation(async () => {
      controller.abort();
      return new Float32Array(SAMPLES);
    });

    const result = await transcribeWithLocalWhisper(
      makeSilencedBlob(),
      undefined,
      controller.signal,
    );

    expect(result).toEqual({ ok: false, error: 'Aborted.' });
    expect(mockFindSpeechRangesML).not.toHaveBeenCalled();
    expect(mockTranscribeFloat32Parallel).not.toHaveBeenCalled();
  });

  it('stops in the VAD loop on a multi-chunk pass aborted after the first chunk', async () => {
    const controller = new AbortController();
    // Two chunks worth of samples (chunkLen = 16000 * 120). Abort during the
    // first chunk's VAD so the top-of-loop check stops the second iteration.
    const chunkLen = 16_000 * 120;
    mockBlobToFloat32.mockResolvedValue(new Float32Array(chunkLen + 16_000));
    let vadCalls = 0;
    mockFindSpeechRangesML.mockImplementation(async () => {
      vadCalls++;
      controller.abort();
      return [{ startSec: 0, endSec: 2 }];
    });

    const result = await transcribeWithLocalWhisper(
      makeSilencedBlob(),
      undefined,
      controller.signal,
    );

    expect(result).toEqual({ ok: false, error: 'Aborted.' });
    expect(vadCalls).toBe(1); // second iteration short-circuited by the loop guard
    expect(mockTranscribeFloat32Parallel).not.toHaveBeenCalled();
  });
});
