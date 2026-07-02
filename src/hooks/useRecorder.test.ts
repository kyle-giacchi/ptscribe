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

vi.mock('@/lib/audio/voiceDetector', () => ({
  createVoiceDetector: () => ({
    setup: vi.fn(),
    teardown: vi.fn(),
    sample: vi.fn(),
    resetIdleTimer: vi.fn(),
    analyser: {} as AnalyserNode,
    lastVoiceAtMs: 0,
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
