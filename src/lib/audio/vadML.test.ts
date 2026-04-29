import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NonRealTimeVAD } from '@ricky0123/vad-web';
import { findSpeechRanges } from './vad';
import { findSpeechRangesML, __resetVadCacheForTests } from './vadML';
import type { VadOptions } from './vad';

vi.mock('@ricky0123/vad-web', () => ({
  NonRealTimeVAD: { new: vi.fn() },
}));

vi.mock('./vad', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vad')>();
  return {
    ...actual,
    findSpeechRanges: vi.fn().mockReturnValue([{ startSec: 0, endSec: 10 }]),
  };
});

const SAMPLE_RATE = 44100;
const SAMPLES = new Float32Array(SAMPLE_RATE * 10); // 10 s of audio

async function* makeSegments(segs: Array<{ start: number; end: number }>) {
  for (const s of segs) yield { audio: new Float32Array(0), ...s };
}

function makeOpts(overrides: Partial<VadOptions> = {}): VadOptions {
  return {
    frameMs: 30,
    hangoverMs: 250,
    padMs: 400,
    minSilenceSec: 1.5,
    noiseFloorPercentile: 0.1,
    sensitivity: 'medium',
    ...overrides,
  };
}

beforeEach(() => {
  __resetVadCacheForTests();
  vi.mocked(NonRealTimeVAD.new).mockReset();
  vi.mocked(NonRealTimeVAD.new).mockResolvedValue({
    run: () => makeSegments([]),
  } as unknown as NonRealTimeVAD);
});

describe('findSpeechRangesML', () => {
  it('converts ms start/end to seconds and applies padMs', async () => {
    vi.mocked(NonRealTimeVAD.new).mockResolvedValue({
      run: () => makeSegments([{ start: 2000, end: 5000 }]),
    } as unknown as NonRealTimeVAD);

    const result = await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ padMs: 400 }));

    expect(result).toHaveLength(1);
    expect(result[0].startSec).toBeCloseTo(2 - 0.4, 5); // 2s - 400ms pad
    expect(result[0].endSec).toBeCloseTo(5 + 0.4, 5);   // 5s + 400ms pad
  });

  it('passes low sensitivity thresholds to NonRealTimeVAD.new', async () => {
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ sensitivity: 'low' }));
    expect(vi.mocked(NonRealTimeVAD.new)).toHaveBeenCalledWith(
      expect.objectContaining({
        positiveSpeechThreshold: 0.7,
        negativeSpeechThreshold: 0.5,
      }),
    );
  });

  it('passes high sensitivity thresholds to NonRealTimeVAD.new', async () => {
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ sensitivity: 'high' }));
    expect(vi.mocked(NonRealTimeVAD.new)).toHaveBeenCalledWith(
      expect.objectContaining({
        positiveSpeechThreshold: 0.35,
        negativeSpeechThreshold: 0.2,
      }),
    );
  });

  it('converts minSilenceSec 1.5 s to redemptionMs 1500', async () => {
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ minSilenceSec: 1.5 }));
    expect(vi.mocked(NonRealTimeVAD.new)).toHaveBeenCalledWith(
      expect.objectContaining({ redemptionMs: 1500 }),
    );
  });

  it('falls back to energy VAD and returns its result when NonRealTimeVAD.new throws', async () => {
    vi.mocked(NonRealTimeVAD.new).mockRejectedValue(new Error('WASM unavailable'));

    const result = await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts());

    expect(vi.mocked(findSpeechRanges)).toHaveBeenCalledWith(SAMPLES, SAMPLE_RATE, makeOpts());
    expect(result).toEqual([{ startSec: 0, endSec: 10 }]);
  });

  it('reuses a cached VAD instance for repeated calls with the same options', async () => {
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts());
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts());
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts());
    expect(vi.mocked(NonRealTimeVAD.new)).toHaveBeenCalledTimes(1);
  });

  it('builds a separate VAD per (sensitivity, redemptionMs) tuple', async () => {
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ sensitivity: 'low' }));
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ sensitivity: 'high' }));
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ sensitivity: 'low' }));
    expect(vi.mocked(NonRealTimeVAD.new)).toHaveBeenCalledTimes(2);
  });

  it('evicts a failed init from the cache so the next call retries', async () => {
    vi.mocked(NonRealTimeVAD.new).mockRejectedValueOnce(new Error('WASM unavailable'));
    await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts());

    vi.mocked(NonRealTimeVAD.new).mockResolvedValueOnce({
      run: () => makeSegments([{ start: 1000, end: 2000 }]),
    } as unknown as NonRealTimeVAD);
    const result = await findSpeechRangesML(SAMPLES, SAMPLE_RATE, makeOpts({ padMs: 0 }));

    expect(vi.mocked(NonRealTimeVAD.new)).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ startSec: 1, endSec: 2 }]);
  });
});
