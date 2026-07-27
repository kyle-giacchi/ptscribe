import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it('returns "00:00" for zero seconds', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('returns "00:00" for negative values', () => {
    expect(formatDuration(-5)).toBe('00:00');
  });

  it('returns "00:00" for non-finite values', () => {
    expect(formatDuration(Infinity)).toBe('00:00');
    expect(formatDuration(NaN)).toBe('00:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('00:45');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatDuration(65)).toBe('01:05');
  });

  it('zero-pads single-digit minutes and seconds', () => {
    expect(formatDuration(61)).toBe('01:01');
  });

  it('handles exactly one hour', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });
});
