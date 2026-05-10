import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractRanges, summarizeTrim, trimSilence } from './silenceTrim';

vi.mock('./vadML', () => ({
  findSpeechRangesML: vi.fn(),
}));
vi.mock('./opusEncoder', () => ({
  encodeOpusWebm: vi.fn(),
}));

import { findSpeechRangesML } from './vadML';
import { encodeOpusWebm } from './opusEncoder';

const mockFindSpeechRangesML = vi.mocked(findSpeechRangesML);
const mockEncodeOpusWebm = vi.mocked(encodeOpusWebm);

function makeFakeAudioBuffer(lengthSamples = 16000, sampleRate = 16000): AudioBuffer {
  return {
    sampleRate,
    numberOfChannels: 1,
    length: lengthSamples,
    duration: lengthSamples / sampleRate,
    getChannelData: () => new Float32Array(lengthSamples),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

function makeFakeCtx(
  decodeResult: AudioBuffer | Error,
): { ctx: unknown; factory: () => AudioContext } {
  const ctx = {
    decodeAudioData: vi.fn().mockImplementation(() =>
      decodeResult instanceof Error ? Promise.reject(decodeResult) : Promise.resolve(decodeResult),
    ),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { ctx, factory: () => ctx as unknown as AudioContext };
}

describe('trimSilence', () => {
  const fakeBlob = new Blob([new Uint8Array(32)], { type: 'audio/webm' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the original blob unchanged when audio decoding fails', async () => {
    const { factory } = makeFakeCtx(new Error('decode error'));

    const result = await trimSilence(fakeBlob, { audioContextFactory: factory });

    expect(result.trimmed).toBe(fakeBlob);
    expect(result.report.droppedSec).toBe(0);
    expect(result.report.droppedRanges).toHaveLength(0);
  });

  it('returns the original blob when no speech ranges are detected', async () => {
    const fakeBuffer = makeFakeAudioBuffer(16000, 16000); // 1 second
    const { factory } = makeFakeCtx(fakeBuffer);
    mockFindSpeechRangesML.mockResolvedValueOnce([]);

    const result = await trimSilence(fakeBlob, { audioContextFactory: factory });

    expect(result.trimmed).toBe(fakeBlob);
    expect(result.report.originalSec).toBeCloseTo(1, 5);
    expect(result.report.keptSec).toBeCloseTo(1, 5);
    expect(result.report.droppedSec).toBe(0);
  });

  it('returns the original blob when opus encoding fails', async () => {
    const fakeBuffer = makeFakeAudioBuffer(16000, 16000);
    const { factory } = makeFakeCtx(fakeBuffer);
    mockFindSpeechRangesML.mockResolvedValueOnce([{ startSec: 0, endSec: 1 }]);
    mockEncodeOpusWebm.mockResolvedValueOnce({ ok: false, blob: new Blob() });

    const result = await trimSilence(fakeBlob, { audioContextFactory: factory });

    expect(result.trimmed).toBe(fakeBlob);
    expect(result.report.droppedSec).toBe(0);
  });

  it('returns the trimmed blob and a correct report on the happy path', async () => {
    const fakeBuffer = makeFakeAudioBuffer(32000, 16000); // 2 seconds
    const { factory } = makeFakeCtx(fakeBuffer);
    const trimmedBlob = new Blob([new Uint8Array(8)], { type: 'audio/webm' });
    mockFindSpeechRangesML.mockResolvedValueOnce([{ startSec: 0, endSec: 1 }]);
    mockEncodeOpusWebm.mockResolvedValueOnce({ ok: true, blob: trimmedBlob });

    const result = await trimSilence(fakeBlob, { audioContextFactory: factory });

    expect(result.trimmed).toBe(trimmedBlob);
    expect(result.report.originalSec).toBeCloseTo(2, 5);
    expect(result.report.keptSec).toBeCloseTo(1, 5);
    expect(result.report.droppedSec).toBeCloseTo(1, 5);
    expect(result.report.droppedRanges).toEqual([{ startSec: 1, endSec: 2 }]);
  });

  it('closes the AudioContext on every exit path', async () => {
    const fakeBuffer = makeFakeAudioBuffer(16000, 16000);
    const { ctx, factory } = makeFakeCtx(fakeBuffer);
    const mockCtx = ctx as { close: ReturnType<typeof vi.fn> };
    mockFindSpeechRangesML.mockResolvedValueOnce([]);

    await trimSilence(fakeBlob, { audioContextFactory: factory });

    expect(mockCtx.close).toHaveBeenCalledTimes(1);
  });
});

describe('extractRanges', () => {
  it('concatenates samples for the given ranges', () => {
    const sr = 1000; // 1ms per sample for easy math
    const samples = new Float32Array(4000); // 4 seconds
    for (let i = 0; i < samples.length; i += 1) samples[i] = i / 10000;

    // Keep [0..1s] and [3..4s]
    const out = extractRanges(samples, sr, [
      { startSec: 0, endSec: 1 },
      { startSec: 3, endSec: 4 },
    ]);

    expect(out.length).toBe(2000);
    // First sample of range 2 should be the value at index 3000 of the original
    expect(out[1000]).toBeCloseTo(samples[3000], 6);
  });

  it('returns an empty Float32Array when no ranges are given', () => {
    const out = extractRanges(new Float32Array(100), 1000, []);
    expect(out.length).toBe(0);
  });

  it('clamps ranges that extend past the sample length', () => {
    const sr = 1000;
    const samples = new Float32Array(2000);
    const out = extractRanges(samples, sr, [{ startSec: 0, endSec: 5 }]);
    expect(out.length).toBe(2000);
  });
});

describe('summarizeTrim', () => {
  it('reports original, kept, and dropped seconds', () => {
    const report = summarizeTrim(10, [
      { startSec: 0, endSec: 2 },
      { startSec: 7, endSec: 10 },
    ]);
    expect(report.originalSec).toBe(10);
    expect(report.keptSec).toBe(5);
    expect(report.droppedSec).toBe(5);
    expect(report.droppedRanges).toEqual([{ startSec: 2, endSec: 7 }]);
  });

  it('reports dropped == original when no ranges are kept', () => {
    const report = summarizeTrim(8, []);
    expect(report.keptSec).toBe(0);
    expect(report.droppedSec).toBe(8);
    expect(report.droppedRanges).toEqual([{ startSec: 0, endSec: 8 }]);
  });
});
