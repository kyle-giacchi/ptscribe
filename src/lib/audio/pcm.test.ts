import { describe, it, expect } from 'vitest';
import { mixToMono } from './pcm';

function fakeBuffer(channels: Float32Array[]): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (i: number) => channels[i],
  } as unknown as AudioBuffer;
}

describe('mixToMono', () => {
  it('returns a copy of the channel for mono input', () => {
    const ch = new Float32Array([0.1, -0.2, 0.3]);
    const out = mixToMono(fakeBuffer([ch]));
    expect(Array.from(out)).toEqual(Array.from(ch));
    out[0] = 99;
    expect(ch[0]).toBeCloseTo(0.1, 6);
  });

  it('averages two channels', () => {
    const l = new Float32Array([1.0, 0.5, -0.5, -1.0]);
    const r = new Float32Array([0.0, 0.5, 0.5, 1.0]);
    const out = mixToMono(fakeBuffer([l, r]));
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[2]).toBeCloseTo(0.0, 6);
    expect(out[3]).toBeCloseTo(0.0, 6);
  });

  it('averages four channels', () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 1, 0, 0]);
    const c = new Float32Array([0, 0, 1, 0]);
    const d = new Float32Array([0, 0, 0, 1]);
    const out = mixToMono(fakeBuffer([a, b, c, d]));
    expect(out[0]).toBeCloseTo(0.25, 6);
    expect(out[1]).toBeCloseTo(0.25, 6);
    expect(out[2]).toBeCloseTo(0.25, 6);
    expect(out[3]).toBeCloseTo(0.25, 6);
  });
});
