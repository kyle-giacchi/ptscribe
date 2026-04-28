import { describe, it, expect } from 'vitest';
import { framePcm, encodeOpusWebm, FRAME_MS } from './opusEncoder';

describe('framePcm', () => {
  it('splits samples into FRAME_MS-sized frames', () => {
    // 1s @ 48kHz = 48000 samples; FRAME_MS=20 → 50 frames of 960 samples
    const samples = new Float32Array(48000);
    const frames = framePcm(samples, 48000);
    expect(frames.length).toBe(50);
    expect(frames[0].length).toBe(960);
    expect(frames[0].timestampUs).toBe(0);
    expect(frames[1].timestampUs).toBe(20_000);
    expect(frames[49].offset).toBe(48000 - 960);
  });

  it('emits a final short frame when samples do not divide evenly', () => {
    const samples = new Float32Array(48000 + 100); // one extra short frame
    const frames = framePcm(samples, 48000);
    expect(frames.length).toBe(51);
    expect(frames[50].length).toBe(100);
  });

  it('returns no frames for an empty input', () => {
    expect(framePcm(new Float32Array(0), 48000)).toEqual([]);
  });

  it('uses the configured FRAME_MS', () => {
    expect(FRAME_MS).toBe(20);
  });
});

describe('encodeOpusWebm', () => {
  it('falls back to WAV (ok=true) when WebCodecs is unavailable (jsdom)', async () => {
    // jsdom has no AudioEncoder global — exercises the WAV fallback path.
    const samples = new Float32Array(4800);
    const result = await encodeOpusWebm(samples, 48000);
    expect(result.ok).toBe(true);
    expect(result.blob.type).toBe('audio/wav');
    expect(result.blob.size).toBe(44 + samples.length * 2); // header + 16-bit PCM
  });
});
