import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAudioProcessing } from './useAudioProcessing';

vi.mock('@/contexts/SettingsProvider', () => ({
  useSettings: () => ({
    settings: {
      audio: {
        silenceDetection: { enabled: true, sensitivity: 'medium', padMs: 400 },
      },
    },
  }),
}));

vi.mock('@/lib/audio/silenceTrim', () => ({
  trimSilence: vi.fn(),
}));

import { trimSilence } from '@/lib/audio/silenceTrim';
const mockTrimSilence = vi.mocked(trimSilence);

const fakeSource = new Blob([new Uint8Array(32)], { type: 'audio/webm' });
const fakeTrimmed = new Blob([new Uint8Array(16)], { type: 'audio/webm' });

beforeEach(() => {
  vi.clearAllMocks();
  mockTrimSilence.mockResolvedValue({
    trimmed: fakeTrimmed,
    report: { droppedSec: 1.5, droppedRanges: [], originalSec: 3, keptSec: 1.5 },
  });
});

describe('useAudioProcessing — precomputedSilenced', () => {
  it('adopts the precomputed blob directly without calling trimSilence', async () => {
    const precomputed = new Blob([new Uint8Array(20)], { type: 'audio/webm' });

    const { result } = renderHook(() =>
      useAudioProcessing(fakeSource, precomputed),
    );

    await waitFor(() => expect(result.current.activeSilenced).not.toBeNull());

    expect(result.current.activeSilenced?.blob).toBe(precomputed);
    expect(result.current.activeSilenced?.savedSec).toBe(0);
    expect(mockTrimSilence).not.toHaveBeenCalled();
  });

  it('does not auto-run trimSilence when precomputedSilenced is provided', async () => {
    const precomputed = new Blob([new Uint8Array(20)]);

    renderHook(() => useAudioProcessing(fakeSource, precomputed));

    // Wait for any effects to settle
    await act(async () => {});

    expect(mockTrimSilence).not.toHaveBeenCalled();
  });
});

describe('useAudioProcessing — auto-run', () => {
  it('auto-runs compileSilence on first sourceBlob when no precomputed blob', async () => {
    const { result } = renderHook(() => useAudioProcessing(fakeSource));

    await waitFor(() => expect(result.current.activeSilenced).not.toBeNull());

    expect(mockTrimSilence).toHaveBeenCalledOnce();
    expect(mockTrimSilence).toHaveBeenCalledWith(
      fakeSource,
      expect.objectContaining({ sensitivity: 'medium', padMs: 400 }),
    );
    expect(result.current.activeSilenced?.blob).toBe(fakeTrimmed);
    expect(result.current.activeSilenced?.savedSec).toBe(1.5);
  });

  it('does not auto-run when sourceBlob is null', async () => {
    renderHook(() => useAudioProcessing(null));

    await act(async () => {});

    expect(mockTrimSilence).not.toHaveBeenCalled();
  });

  it('does not auto-run a second time on re-render with the same sourceBlob', async () => {
    const { result, rerender } = renderHook(() => useAudioProcessing(fakeSource));

    await waitFor(() => expect(result.current.activeSilenced).not.toBeNull());
    expect(mockTrimSilence).toHaveBeenCalledOnce();

    rerender();
    await act(async () => {});

    expect(mockTrimSilence).toHaveBeenCalledOnce(); // still once
  });
});

describe('useAudioProcessing — compileSilence / resetSilence', () => {
  it('compileSilence updates activeSilenced with the trimmed blob', async () => {
    // Start with null sourceBlob so auto-run does not fire first
    const { result } = renderHook(() => useAudioProcessing(fakeSource, fakeSource));

    // Adopt precomputed, then reset to test manual compile
    await waitFor(() => expect(result.current.activeSilenced).not.toBeNull());

    act(() => result.current.resetSilence());

    expect(result.current.activeSilenced).toBeNull();

    await act(async () => { await result.current.compileSilence(); });

    expect(mockTrimSilence).toHaveBeenCalledOnce();
    expect(result.current.activeSilenced?.blob).toBe(fakeTrimmed);
  });

  it('resetSilence clears activeSilenced', async () => {
    const { result } = renderHook(() => useAudioProcessing(fakeSource));

    await waitFor(() => expect(result.current.activeSilenced).not.toBeNull());

    act(() => result.current.resetSilence());

    expect(result.current.activeSilenced).toBeNull();
  });

  it('compilingSilence is false after compileSilence resolves', async () => {
    const { result } = renderHook(() => useAudioProcessing(fakeSource, fakeSource));

    // Adopt precomputed to populate activeSilenced, then reset and manually compile
    await waitFor(() => expect(result.current.activeSilenced).not.toBeNull());
    act(() => result.current.resetSilence());

    await act(async () => { await result.current.compileSilence(); });

    expect(result.current.compilingSilence).toBe(false);
    expect(result.current.activeSilenced).not.toBeNull();
  });
});

describe('useAudioProcessing — return shape', () => {
  it('does not expose any speed-up fields', () => {
    const { result } = renderHook(() => useAudioProcessing(null));

    const keys = Object.keys(result.current);
    const speedKeys = keys.filter((k) => k.toLowerCase().includes('speed'));
    expect(speedKeys).toHaveLength(0);
  });

  it('exposes exactly the expected fields', () => {
    const { result } = renderHook(() => useAudioProcessing(null));

    expect(result.current).toHaveProperty('activeSilenced');
    expect(result.current).toHaveProperty('compilingSilence');
    expect(result.current).toHaveProperty('activeSilenceError');
    expect(result.current).toHaveProperty('compileSilence');
    expect(result.current).toHaveProperty('resetSilence');
  });
});
