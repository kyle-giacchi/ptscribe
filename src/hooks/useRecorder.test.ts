import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Module mocks ────────────────────────────────────────────────────────────
// The recorder owns three resources per clip (MediaRecorder, wake lock,
// visibilitychange listener). These tests pin the hard-rule invariant that all
// three are released on every exit path: stop, reset, error, unmount.
// See docs/invariants.md#recorder-lifecycle-wake-lock--visibility.

vi.mock('@/services/AudioRepository', () => ({
  audioRepository: {
    clearChunks: vi.fn().mockResolvedValue(undefined),
    appendChunk: vi.fn().mockResolvedValue(undefined),
    saveChunkMime: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/wakeLock', () => ({
  acquireWakeLock: vi.fn(),
  releaseWakeLock: vi.fn().mockResolvedValue(undefined),
}));

// `lastVoiceAtMs` is read on every 250 ms tick to decide whether a live-preview
// segment recorder should open or close. Tests drive it through this handle:
// `speaking: false` (the default) reads as permanent silence; `true` keeps the
// timestamp pinned to now, i.e. continuous speech.
const voiceState = vi.hoisted(() => ({ speaking: false }));

vi.mock('@/lib/audio/voiceDetector', () => ({
  createVoiceDetector: () => ({
    setup: vi.fn(),
    teardown: vi.fn(),
    sample: vi.fn(),
    resetIdleTimer: vi.fn(),
    analyser: {} as AnalyserNode,
    get lastVoiceAtMs() {
      return voiceState.speaking ? Date.now() : 0;
    },
  }),
}));

import { useRecorder } from './useRecorder';
import { acquireWakeLock, releaseWakeLock } from '@/lib/wakeLock';

const mockAcquire = vi.mocked(acquireWakeLock);
const mockRelease = vi.mocked(releaseWakeLock);

// ── Fakes for browser APIs jsdom does not implement ─────────────────────────

interface FakeTrack {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

function makeTrack(): FakeTrack {
  return { kind: 'audio', stop: vi.fn(), addEventListener: vi.fn() };
}

class FakeMediaStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks;
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(): boolean {
    return true;
  }
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.instances.push(this);
  }
  start(): void {
    this.state = 'recording';
  }
  pause(): void {
    this.state = 'paused';
  }
  resume(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    // Real MediaRecorder fires onstop after a turn; the hook only needs it to
    // fire after stop() is invoked, so synchronous is fine for the contract.
    this.onstop?.();
  }
}

let sentinel: { release: ReturnType<typeof vi.fn> };
let getUserMedia: ReturnType<typeof vi.fn>;
let currentStream: FakeMediaStream;

/** Count of live (added − removed) visibilitychange listeners. */
function visibilityListenerCount(
  add: ReturnType<typeof vi.spyOn>,
  remove: ReturnType<typeof vi.spyOn>,
): number {
  const added = (add.mock.calls as unknown[][]).filter((c) => c[0] === 'visibilitychange').length;
  const removed = (remove.mock.calls as unknown[][]).filter(
    (c) => c[0] === 'visibilitychange',
  ).length;
  return added - removed;
}

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  voiceState.speaking = false;

  sentinel = { release: vi.fn().mockResolvedValue(undefined) };
  mockAcquire.mockResolvedValue(sentinel as unknown as WakeLockSentinel);

  currentStream = new FakeMediaStream([makeTrack()]);
  getUserMedia = vi.fn().mockResolvedValue(currentStream);

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;

  addSpy = vi.spyOn(document, 'addEventListener');
  removeSpy = vi.spyOn(document, 'removeEventListener');
});

afterEach(() => {
  vi.useRealTimers();
  addSpy.mockRestore();
  removeSpy.mockRestore();
});

/** start() and flush the fire-and-forget wake-lock acquisition microtask. */
async function startRecording(
  result: { current: ReturnType<typeof useRecorder> },
  clipId = 'clip-1',
): Promise<boolean> {
  let ok = false;
  await act(async () => {
    ok = await result.current.start(clipId);
  });
  // The wake lock is acquired via a fire-and-forget .then(); flush it.
  await act(async () => {});
  return ok;
}

describe('useRecorder — start()', () => {
  it('acquires stream + wake lock + visibility listener and reports recording', async () => {
    const { result } = renderHook(() => useRecorder());

    const ok = await startRecording(result);

    expect(ok).toBe(true);
    expect(result.current.status).toBe('recording');
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(mockAcquire).toHaveBeenCalledOnce();
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(1);
  });

  it('fails cleanly when mediaDevices is unavailable — no leaked listener', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });
    const { result } = renderHook(() => useRecorder());

    const ok = await startRecording(result);

    expect(ok).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/not available/i);
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(0);
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it('fails cleanly and tears down when getUserMedia rejects', async () => {
    getUserMedia.mockRejectedValue(new Error('Permission denied'));
    const { result } = renderHook(() => useRecorder());

    const ok = await startRecording(result);

    expect(ok).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Permission denied');
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(0);
  });
});

describe('useRecorder — exit paths release all three resources', () => {
  it('stop() resolves a blob and releases wake lock, tracks, and listener', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result);
    const track = currentStream.getTracks()[0];
    // Feed a chunk so the resolved value is a real recording — with no chunks at
    // all, stop() correctly resolves null (nothing was captured).
    await act(async () => {
      FakeMediaRecorder.instances[0].ondataavailable?.({
        data: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      });
    });

    let stopped: Blob | null = null;
    await act(async () => {
      stopped = await result.current.stop();
    });

    expect(stopped).toBeInstanceOf(Blob);
    expect(result.current.status).toBe('stopped');
    expect(mockRelease).toHaveBeenCalledWith(sentinel);
    expect(track.stop).toHaveBeenCalled();
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(0);
  });

  it('reset() releases all three and returns to idle', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result);
    const track = currentStream.getTracks()[0];

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.durationSec).toBe(0);
    expect(mockRelease).toHaveBeenCalledWith(sentinel);
    expect(track.stop).toHaveBeenCalled();
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(0);
  });

  it('unmount tears down the wake lock, tracks, and listener', async () => {
    const { result, unmount } = renderHook(() => useRecorder());
    await startRecording(result);
    const track = currentStream.getTracks()[0];

    unmount();

    expect(mockRelease).toHaveBeenCalledWith(sentinel);
    expect(track.stop).toHaveBeenCalled();
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(0);
  });

  it('recorder.onerror transitions to error state and tears down', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result);
    const track = currentStream.getTracks()[0];
    const recorder = FakeMediaRecorder.instances[0];

    act(() => {
      recorder.onerror?.({ message: 'boom' } as unknown);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('boom');
    expect(mockRelease).toHaveBeenCalledWith(sentinel);
    expect(track.stop).toHaveBeenCalled();
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(0);
  });
});

describe('useRecorder — backgrounding (Page Visibility)', () => {
  function latestVisibilityHandler(): () => void {
    const calls = (addSpy.mock.calls as unknown[][]).filter((c) => c[0] === 'visibilitychange');
    return calls[calls.length - 1][1] as () => void;
  }

  it('emits a backgrounded event when the tab is hidden mid-recording, once per clip', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result);

    const handler = latestVisibilityHandler();
    expect(handler).toBeTypeOf('function');

    const events: string[] = [];
    result.current.subscribeEvents((e) => events.push(e.type));

    const hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => handler());
    // A second hide (e.g. a hide/show/hide cycle) must not re-emit within the same clip.
    act(() => handler());
    hiddenSpy.mockRestore();

    expect(events).toEqual(['backgrounded']);
  });

  it('re-arms the one-shot guard on the next start(), so a fresh clip can emit again', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result);

    const events: string[] = [];
    result.current.subscribeEvents((e) => events.push(e.type));

    const hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => latestVisibilityHandler()());
    hiddenSpy.mockRestore();
    expect(events).toEqual(['backgrounded']);

    act(() => result.current.reset());
    await startRecording(result);

    const hiddenSpy2 = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => latestVisibilityHandler()());
    hiddenSpy2.mockRestore();

    expect(events).toEqual(['backgrounded', 'backgrounded']);
  });
});

describe('useRecorder — stop() after an auto-stop returns the captured audio', () => {
  // Regression: on every non-manual stop (hardCap, idleAuto, micDisconnected,
  // browser-interrupted) the recorder fires onstop itself, then useCapturePhase's
  // subscriber calls stop() to collect the blob. stop() used to return the `blob`
  // state captured by its closure — a render behind, so null — and the caller
  // read that as "recording failed" and deleted the clip and its audio.
  async function autoStop() {
    const recorder = FakeMediaRecorder.instances[0];
    await act(async () => {
      recorder.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
    });
    // Browser-initiated: nothing called our stop(), so stopResolveRef is unset.
    await act(async () => {
      recorder.stop();
    });
  }

  it('returns the recorded blob, not null, when onstop already ran', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result);

    await autoStop();

    let returned: Blob | null = null;
    await act(async () => {
      returned = await result.current.stop();
    });

    expect(returned).toBeInstanceOf(Blob);
    expect(returned!.size).toBeGreaterThan(0);
  });

  it('does not hand the previous clip audio to the next clip', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result, 'clip-1');
    await autoStop();
    await act(async () => {
      await result.current.stop();
    });

    // Second clip starts and is auto-stopped before producing any data.
    await startRecording(result, 'clip-2');
    const second = FakeMediaRecorder.instances[1];
    await act(async () => {
      second.stop();
    });

    let returned: Blob | null = new Blob(['sentinel']);
    await act(async () => {
      returned = await result.current.stop();
    });

    // No data for clip-2 — must be null, never clip-1's audio.
    expect(returned).toBeNull();
  });

  it('releases all three resources when the 8s stop fallback fires', async () => {
    const { result } = renderHook(() => useRecorder());
    await startRecording(result);
    const track = currentStream.getTracks()[0];
    const recorder = FakeMediaRecorder.instances[0];
    // Recorder that never fires onstop — the safety-net timer must still tear down.
    recorder.onstop = null;

    let settled: Blob | null | undefined;
    await act(async () => {
      void result.current.stop().then((b) => {
        settled = b;
      });
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(settled).toBeNull();
    expect(mockRelease).toHaveBeenCalledWith(sentinel);
    expect(track.stop).toHaveBeenCalled();
    expect(visibilityListenerCount(addSpy, removeSpy)).toBe(0);
  });
});

describe('useRecorder — live-preview segment duration gate', () => {
  /**
   * Segments below MIN_SEGMENT_MS (a cough, a chair scrape) cost a full 30 s-padded
   * Whisper pass and starve the real utterance queued behind them. The gate drops
   * them from the *preview* only — the main recorder still captures the audio for T2.
   */
  async function runSegment(speakingMs: number): Promise<Blob[]> {
    const onChunk = vi.fn();
    const { result } = renderHook(() => useRecorder());
    result.current.onChunk.current = onChunk;
    await startRecording(result);

    const before = FakeMediaRecorder.instances.length;
    voiceState.speaking = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250); // one tick → segment recorder opens
    });
    const segment = FakeMediaRecorder.instances[before];
    expect(segment).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(speakingMs);
    });
    segment.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) } as BlobEvent);

    return onChunk.mock.calls.map((c) => c[0] as Blob);
  }

  it('drops a sub-700 ms segment', async () => {
    expect(await runSegment(300)).toHaveLength(0);
  });

  it('forwards a segment past the floor', async () => {
    expect(await runSegment(1000)).toHaveLength(1);
  });
});
