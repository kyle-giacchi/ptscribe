import { describe, it, expect } from 'vitest';
import {
  applyTempoSoundTouch,
  buildSpeedUpReport,
  computeOutputDuration,
  DEFAULT_SPEED,
  speedUpAudio,
  SUPPORTED_SPEEDS,
  type SpeedFactor,
} from './timeStretch';

describe('SUPPORTED_SPEEDS / DEFAULT_SPEED', () => {
  it('exposes the locked-in speed factor list', () => {
    expect(SUPPORTED_SPEEDS).toEqual([1.25, 1.5, 1.75]);
    expect(DEFAULT_SPEED).toBe(1.5);
  });
});

describe('computeOutputDuration', () => {
  it('divides original by speed', () => {
    expect(computeOutputDuration(60, 1.5)).toBeCloseTo(40, 6);
    expect(computeOutputDuration(60, 1.25)).toBeCloseTo(48, 6);
    expect(computeOutputDuration(60, 1.75)).toBeCloseTo(60 / 1.75, 6);
  });

  it('returns 0 for zero original duration', () => {
    expect(computeOutputDuration(0, 1.5)).toBe(0);
  });

  it('returns the input when speed is 1', () => {
    expect(computeOutputDuration(42, 1)).toBe(42);
  });
});

describe('buildSpeedUpReport', () => {
  it('packages original, output, speed, and savedSec', () => {
    const r = buildSpeedUpReport(60, 1.5);
    expect(r.originalSec).toBe(60);
    expect(r.outputSec).toBeCloseTo(40, 6);
    expect(r.speed).toBe(1.5);
    expect(r.savedSec).toBeCloseTo(20, 6);
  });

  it('reports zero savings for speed 1', () => {
    const r = buildSpeedUpReport(30, 1);
    expect(r.savedSec).toBe(0);
  });
});

describe('applyTempoSoundTouch', () => {
  it('returns a Float32Array roughly (1/tempo) the input length at 1.5×', () => {
    const sr = 16000;
    const samples = new Float32Array(sr);
    for (let i = 0; i < sr; i += 1) samples[i] = Math.sin((2 * Math.PI * 440 * i) / sr);

    const out = applyTempoSoundTouch(samples, sr, 1.5);
    expect(out).toBeInstanceOf(Float32Array);
    const expected = sr / 1.5;
    expect(out.length).toBeGreaterThan(expected * 0.85);
    expect(out.length).toBeLessThan(expected * 1.15);
  });

  it('returns approximately the original length at tempo 1.0', () => {
    const sr = 8000;
    const samples = new Float32Array(sr).fill(0.1);
    const out = applyTempoSoundTouch(samples, sr, 1);
    expect(out.length).toBeGreaterThan(sr * 0.9);
    expect(out.length).toBeLessThan(sr * 1.1);
  });

  it('returns an empty array for empty input', () => {
    const out = applyTempoSoundTouch(new Float32Array(0), 16000, 1.5);
    expect(out.length).toBe(0);
  });
});

// ── Orchestrator tests ────────────────────────────────────────────────────────

function fakeCtxFactory(
  audioBuffer: {
    sampleRate: number;
    numberOfChannels: number;
    length: number;
    getChannelData: (i: number) => Float32Array;
  },
  onClose?: () => void,
) {
  return () =>
    ({
      decodeAudioData: async (_buf: ArrayBuffer) => audioBuffer,
      close: async () => {
        onClose?.();
      },
    }) as unknown as AudioContext;
}

function makeBuffer(samples: Float32Array, sampleRate: number) {
  return {
    sampleRate,
    numberOfChannels: 1,
    length: samples.length,
    getChannelData: (_i: number) => samples,
  };
}

describe('speedUpAudio orchestrator', () => {
  it('encodes via WAV fallback and reports savings when WebCodecs unavailable (jsdom)', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
    const sr = 16000;
    const samples = new Float32Array(sr).fill(0.1);
    const result = await speedUpAudio(blob, 1.25 as SpeedFactor, {
      audioContextFactory: fakeCtxFactory(makeBuffer(samples, sr)),
    });
    // WAV fallback succeeds → savedSec > 0, result is a new WAV blob (not the original)
    expect(result.report.savedSec).toBeGreaterThan(0);
    expect(result.result).not.toBe(blob);
    expect(result.result.type).toBe('audio/wav');
  });

  it('falls through to original blob when decodeAudioData throws', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/webm' });
    const ctx = {
      decodeAudioData: async () => {
        throw new Error('decode failed');
      },
      close: async () => {},
    };
    const result = await speedUpAudio(blob, 1.5, {
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    expect(result.result).toBe(blob);
    expect(result.report.savedSec).toBe(0);
  });

  it('returns a WAV blob (not original) when WebCodecs is unavailable (jsdom)', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const sr = 16000;
    const samples = new Float32Array(sr).fill(0.1);
    const result = await speedUpAudio(blob, 1.5, {
      audioContextFactory: fakeCtxFactory(makeBuffer(samples, sr)),
    });
    expect(result.result).not.toBe(blob);
    expect(result.result.type).toBe('audio/wav');
    expect(result.report.savedSec).toBeGreaterThan(0);
  });

  it('reports originalSec from the decoded buffer length / sample rate', async () => {
    const blob = new Blob([new Uint8Array([0])], { type: 'audio/webm' });
    const sr = 16000;
    const samples = new Float32Array(sr * 2); // 2 seconds
    const result = await speedUpAudio(blob, 1.5, {
      audioContextFactory: fakeCtxFactory(makeBuffer(samples, sr)),
    });
    expect(result.report.originalSec).toBeCloseTo(2, 3);
  });

  it('closes the AudioContext after use', async () => {
    let closed = false;
    const blob = new Blob([new Uint8Array([0])], { type: 'audio/webm' });
    const sr = 16000;
    const samples = new Float32Array(sr).fill(0.1);
    await speedUpAudio(blob, 1.5, {
      audioContextFactory: fakeCtxFactory(makeBuffer(samples, sr), () => {
        closed = true;
      }),
    });
    expect(closed).toBe(true);
  });
});
