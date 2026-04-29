import { describe, it, expect } from 'vitest';
import { extractJson } from './generate';

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    const result = extractJson('{"soap": "text here", "plan": "do x"}');
    expect(result).toEqual({ soap: 'text here', plan: 'do x' });
  });

  it('extracts JSON wrapped in a markdown code fence', () => {
    const result = extractJson('Here is the note:\n```json\n{"soap": "value"}\n```');
    expect(result).toEqual({ soap: 'value' });
  });

  it('extracts JSON wrapped in a plain code fence (no language tag)', () => {
    const result = extractJson('```\n{"key": "val"}\n```');
    expect(result).toEqual({ key: 'val' });
  });

  it('strips leading prose before the opening brace', () => {
    const result = extractJson('Sure, here is the output: {"a": 1}');
    expect(result).toEqual({ a: 1 });
  });

  it('strips trailing prose after the closing brace', () => {
    const result = extractJson('{"a": 1} Let me know if you need changes.');
    expect(result).toEqual({ a: 1 });
  });

  it('handles nested objects correctly', () => {
    const result = extractJson('{"outer": {"inner": "val"}}');
    expect(result).toEqual({ outer: { inner: 'val' } });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('No JSON here at all.')).toThrow(
      'AI response did not contain a JSON object',
    );
  });

  it('throws when the JSON is malformed', () => {
    expect(() => extractJson('{bad json}')).toThrow('Failed to parse AI JSON');
  });

  it('throws on an empty string', () => {
    expect(() => extractJson('')).toThrow('AI response did not contain a JSON object');
  });
});
