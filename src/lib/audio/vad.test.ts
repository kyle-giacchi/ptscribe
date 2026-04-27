import { describe, it, expect } from 'vitest';
import { findSpeechRanges, DEFAULT_VAD_OPTIONS } from './vad';

const SR = 16000;

/** Build a Float32Array with 440Hz sine at amplitude 0.5 in the given tones ranges. */
function buildSignal(totalSec: number, tones: Array<[number, number]>): Float32Array {
  const total = Math.round(totalSec * SR);
  const out = new Float32Array(total);
  for (const [startSec, endSec] of tones) {
    const start = Math.round(startSec * SR);
    const end = Math.round(endSec * SR);
    for (let i = start; i < end; i += 1) {
      out[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR);
    }
  }
  return out;
}

describe('findSpeechRanges (energy VAD)', () => {
  it('returns a single range covering the full clip when the entire clip is speech', () => {
    const samples = buildSignal(2, [[0, 2]]);
    const ranges = findSpeechRanges(samples, SR, { ...DEFAULT_VAD_OPTIONS, padMs: 0 });
    expect(ranges.length).toBe(1);
    expect(ranges[0].startSec).toBeLessThanOrEqual(0.05);
    expect(ranges[0].endSec).toBeGreaterThanOrEqual(1.95);
  });

  it('returns empty when the entire clip is silence', () => {
    const samples = buildSignal(2, []);
    const ranges = findSpeechRanges(samples, SR, DEFAULT_VAD_OPTIONS);
    expect(ranges).toEqual([]);
  });

  it('drops a long silent gap between two tones', () => {
    // 0.0–1.0s tone, 1.0–4.0s silence (3s gap > minSilenceSec), 4.0–5.0s tone.
    const samples = buildSignal(5, [
      [0, 1],
      [4, 5],
    ]);
    const ranges = findSpeechRanges(samples, SR, {
      ...DEFAULT_VAD_OPTIONS,
      padMs: 0,
      hangoverMs: 0,
    });
    expect(ranges.length).toBe(2);
    expect(ranges[0].endSec).toBeLessThan(ranges[1].startSec);
    expect(ranges[1].startSec).toBeGreaterThan(3.5);
  });

  it('keeps a short pause between two tones (gap below minSilenceSec)', () => {
    // 0.5s tone + 0.5s silence + 0.5s tone — silence shorter than 1.5s minSilenceSec
    const samples = buildSignal(1.5, [
      [0, 0.5],
      [1.0, 1.5],
    ]);
    const ranges = findSpeechRanges(samples, SR, DEFAULT_VAD_OPTIONS);
    expect(ranges.length).toBe(1);
    expect(ranges[0].endSec - ranges[0].startSec).toBeGreaterThan(1.0);
  });

  it('applies padding around speech runs without exceeding clip boundaries', () => {
    const samples = buildSignal(3, [[1, 2]]);
    const ranges = findSpeechRanges(samples, SR, {
      ...DEFAULT_VAD_OPTIONS,
      padMs: 500,
      hangoverMs: 0,
    });
    expect(ranges.length).toBe(1);
    expect(ranges[0].startSec).toBeGreaterThanOrEqual(0);
    expect(ranges[0].startSec).toBeLessThan(1.0);
    expect(ranges[0].endSec).toBeLessThanOrEqual(3);
    expect(ranges[0].endSec).toBeGreaterThan(2.0);
  });

  it('higher sensitivity drops more (returns shorter total kept duration)', () => {
    const samples = buildSignal(2, [[0, 2]]);
    for (let i = 0; i < samples.length; i += 1) samples[i] += 0.02 * (Math.random() - 0.5);

    const high = findSpeechRanges(samples, SR, {
      ...DEFAULT_VAD_OPTIONS,
      sensitivity: 'high',
      padMs: 0,
    });
    const low = findSpeechRanges(samples, SR, {
      ...DEFAULT_VAD_OPTIONS,
      sensitivity: 'low',
      padMs: 0,
    });
    const total = (rs: { startSec: number; endSec: number }[]) =>
      rs.reduce((acc, r) => acc + (r.endSec - r.startSec), 0);
    expect(total(low)).toBeGreaterThanOrEqual(total(high));
  });
});
