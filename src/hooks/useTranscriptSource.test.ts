import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import * as demo from '@/lib/demoMode';
import { useTranscriptSource, type UseTranscriptSourceParams } from './useTranscriptSource';

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
