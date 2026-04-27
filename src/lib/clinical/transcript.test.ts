import { describe, expect, it } from 'vitest';
import { normalizeTranscript, wordCount } from './transcript';

describe('normalizeTranscript', () => {
  it('collapses multiple spaces to one', () => {
    expect(normalizeTranscript('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace from each line', () => {
    expect(normalizeTranscript('  hello  \n  world  ')).toBe('hello\nworld');
  });

  it('strips blank lines', () => {
    expect(normalizeTranscript('line one\n\nline two\n\n\nline three')).toBe(
      'line one\nline two\nline three',
    );
  });

  it('strips whitespace-only lines', () => {
    expect(normalizeTranscript('line one\n   \nline two')).toBe('line one\nline two');
  });

  it('normalizes CRLF to LF', () => {
    expect(normalizeTranscript('line one\r\nline two')).toBe('line one\nline two');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeTranscript('')).toBe('');
    expect(normalizeTranscript('   \n   ')).toBe('');
  });

  it('preserves content in non-empty lines', () => {
    const raw = '  Patient reports   left knee pain.  \n  ROM within normal limits.  ';
    expect(normalizeTranscript(raw)).toBe(
      'Patient reports left knee pain.\nROM within normal limits.',
    );
  });
});

describe('wordCount', () => {
  it('returns 0 for empty string', () => {
    expect(wordCount('')).toBe(0);
  });

  it('returns 0 for falsy input', () => {
    expect(wordCount(null as unknown as string)).toBe(0);
    expect(wordCount(undefined as unknown as string)).toBe(0);
  });

  it('returns 1 for a single word', () => {
    expect(wordCount('hello')).toBe(1);
  });

  it('counts words correctly', () => {
    expect(wordCount('Patient reports left knee pain')).toBe(5);
  });
});
