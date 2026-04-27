import { describe, expect, it } from 'vitest';
import { wordCount, formatDuration } from './format';

describe('wordCount', () => {
  it('returns 0 for an empty string', () => {
    expect(wordCount('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(wordCount('   ')).toBe(0);
  });

  it('returns 1 for a single word', () => {
    expect(wordCount('hello')).toBe(1);
  });

  it('counts words correctly with normal spacing', () => {
    expect(wordCount('the quick brown fox')).toBe(4);
  });

  it('counts correctly with extra internal whitespace', () => {
    expect(wordCount('  two   words  ')).toBe(2);
  });
});

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
