import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCaptureEnd } from './runCaptureEnd';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { trimSilence } from '@/lib/audio/silenceTrim';
import type { SessionClip } from '@/types';

vi.mock('@/lib/audio/merge', () => ({
  mergeAudioBlobs: vi.fn(async (blobs: Blob[]) => new Blob([`merged:${blobs.length}`])),
}));
vi.mock('@/lib/audio/silenceTrim', () => ({
  trimSilence: vi.fn(async (blob: Blob) => ({ trimmed: blob, report: {} })),
}));

const SD_ON = { enabled: true, sensitivity: 0.5, padMs: 200 } as never;
const SD_OFF = { enabled: false, sensitivity: 0.5, padMs: 200 } as never;

function clip(over: Partial<SessionClip>): SessionClip {
  return {
    id: 'c1',
    index: 0,
    durationSec: 10,
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as SessionClip;
}

const loadOk = (id: string) => Promise.resolve(new Blob([id]));

beforeEach(() => vi.clearAllMocks());

describe('runCaptureEnd', () => {
  it('merges exactly once — the pre-trim merge had no reader', async () => {
    const r = await runCaptureEnd({
      clips: [clip({ id: 'a' }), clip({ id: 'b', index: 1 })],
      loadAudio: loadOk,
      silenceDetection: SD_ON,
    });
    expect(mergeAudioBlobs).toHaveBeenCalledTimes(1);
    expect(trimSilence).toHaveBeenCalledTimes(2);
    expect(r.silenced).toBeInstanceOf(Blob);
  });

  it('skips trimming entirely when silence detection is off', async () => {
    await runCaptureEnd({ clips: [clip({})], loadAudio: loadOk, silenceDetection: SD_OFF });
    expect(trimSilence).not.toHaveBeenCalled();
    expect(mergeAudioBlobs).toHaveBeenCalledTimes(1);
  });

  it('excludes pending and failed clips from the merge', async () => {
    const loadAudio = vi.fn(loadOk);
    await runCaptureEnd({
      clips: [
        clip({ id: 'a' }),
        clip({ id: 'b', status: 'pending' }),
        clip({ id: 'c', status: 'failed' }),
      ],
      loadAudio,
      silenceDetection: SD_OFF,
    });
    expect(loadAudio).toHaveBeenCalledTimes(1);
    expect(loadAudio).toHaveBeenCalledWith('a');
  });

  it('counts unreadable clips instead of failing the whole pipeline', async () => {
    const r = await runCaptureEnd({
      clips: [clip({ id: 'a' }), clip({ id: 'b' })],
      loadAudio: (id) => (id === 'b' ? Promise.resolve(null) : loadOk(id)),
      silenceDetection: SD_OFF,
    });
    expect(r.droppedClips).toBe(1);
    expect(r.silenced).toBeInstanceOf(Blob);
  });

  it('counts trim failures and falls back to untrimmed audio', async () => {
    vi.mocked(trimSilence).mockRejectedValueOnce(new Error('vad blew up'));
    const r = await runCaptureEnd({
      clips: [clip({ id: 'a' }), clip({ id: 'b' })],
      loadAudio: loadOk,
      silenceDetection: SD_ON,
    });
    expect(r.trimFailures).toBe(1);
    expect(mergeAudioBlobs).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mergeAudioBlobs).mock.calls[0][0]).toHaveLength(2);
  });

  it('returns no blob when nothing is mergeable', async () => {
    const r = await runCaptureEnd({
      clips: [clip({ status: 'pending' })],
      loadAudio: loadOk,
      silenceDetection: SD_ON,
    });
    expect(r.silenced).toBeNull();
    expect(mergeAudioBlobs).not.toHaveBeenCalled();
  });

  it('compiles the baseline from transcript > t2 > t1, and t1 separately', async () => {
    const r = await runCaptureEnd({
      clips: [
        clip({ id: 'a', transcript: 'edited A', t2Transcript: 't2 A', t1Transcript: 't1 A' }),
        clip({ id: 'b', t2Transcript: 't2 B', t1Transcript: 't1 B' }),
        clip({ id: 'c', t1Transcript: 't1 C' }),
        clip({ id: 'd' }),
      ],
      loadAudio: loadOk,
      silenceDetection: SD_OFF,
    });
    expect(r.baseline).toBe('edited A\n\nt2 B\n\nt1 C');
    expect(r.t1).toBe('t1 A\n\nt1 B\n\nt1 C');
  });

  it('compiles text from clips that are not mergeable', async () => {
    // A failed clip contributes no audio but may still carry live-transcript text.
    const r = await runCaptureEnd({
      clips: [clip({ id: 'a', status: 'failed', t1Transcript: 'said something' })],
      loadAudio: loadOk,
      silenceDetection: SD_OFF,
    });
    expect(r.silenced).toBeNull();
    expect(r.baseline).toBe('said something');
  });
});
