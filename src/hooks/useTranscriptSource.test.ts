import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import * as demo from '@/lib/demoMode';
import { useTranscriptSource, type UseTranscriptSourceParams } from './useTranscriptSource';
import { MAX_TRANSCRIBES_PER_SESSION } from './useActionGuard';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/services/ai/transcribe', () => ({ transcribe: vi.fn() }));
// useBackgroundTranscription pulls in NotificationsProvider via useNotifications;
// stub it so the hook renders without the full provider tree.
vi.mock('./useBackgroundTranscription', () => ({
  useBackgroundTranscription: () => ({ phase: 'idle' }),
}));

function makeParams(overrides: Record<string, unknown> = {}): UseTranscriptSourceParams {
  return {
    session: { id: 's1', type: 'evaluation', clips: [], status: 'draft' } as never,
    silencedMergedBlob: new Blob(['x'], { type: 'audio/webm' }),
    settings: { audio: { speedUp: { enabled: false, speed: 1.25 } } } as never,
    patchSession: vi.fn(),
    setTranscript: vi.fn(),
    setBusy: vi.fn(),
    dispatch: vi.fn(),
    checkActionGuard: vi.fn(() => ({ allowed: true as const })),
    recordAction: vi.fn(),
    ...overrides,
  };
}

describe('runT3 demo-mode guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses to call Nova when demo mode is on', async () => {
    vi.spyOn(demo, 'isDemoMode').mockReturnValue(true);
    const { transcribe } = await import('@/services/ai/transcribe');
    const params = makeParams();
    const { result } = renderHook(() => useTranscriptSource(params));
    await result.current.runT3();
    expect(transcribe).not.toHaveBeenCalled();
    expect(params.checkActionGuard).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Cloud transcription is disabled in demo mode.');
  });
});

describe('runT3 session-backed cap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks Nova when session.cloudTranscribeCount already equals the cap', async () => {
    vi.spyOn(demo, 'isDemoMode').mockReturnValue(false);
    const { transcribe } = await import('@/services/ai/transcribe');
    const params = makeParams({
      session: {
        id: 's1',
        type: 'evaluation',
        clips: [],
        status: 'draft',
        cloudTranscribeCount: MAX_TRANSCRIBES_PER_SESSION,
      } as never,
    });
    const { result } = renderHook(() => useTranscriptSource(params));
    await result.current.runT3();
    expect(transcribe).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Cloud transcription was already used for this session.',
    );
  });

  it('increments cloudTranscribeCount on a successful Nova pass', async () => {
    vi.spyOn(demo, 'isDemoMode').mockReturnValue(false);
    const { transcribe } = await import('@/services/ai/transcribe');
    (transcribe as Mock).mockResolvedValue({ text: 'final transcript' });
    const params = makeParams({
      session: {
        id: 's1',
        type: 'evaluation',
        clips: [],
        status: 'draft',
        cloudTranscribeCount: 0,
      } as never,
    });
    const { result } = renderHook(() => useTranscriptSource(params));
    await result.current.runT3();
    expect(params.patchSession).toHaveBeenCalledWith(
      expect.objectContaining({ cloudTranscribeCount: 1 }),
    );
  });
});
