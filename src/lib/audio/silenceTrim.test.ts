import { describe, it, expect } from 'vitest';
import { extractRanges, summarizeTrim } from './silenceTrim';

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
