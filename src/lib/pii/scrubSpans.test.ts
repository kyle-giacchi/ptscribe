import { describe, it, expect } from 'vitest';
import { applySpans, mergeSpans } from './scrubSpans';
import type { PIISpan } from './scrubSpans';

function span(entity_group: string, start: number, end: number): PIISpan {
  return { entity_group, start, end };
}

describe('applySpans', () => {
  it('returns original text when spans is empty', () => {
    expect(applySpans('hello world', [])).toEqual({ scrubbed: 'hello world', entityCount: 0 });
  });

  it('replaces a single span', () => {
    const result = applySpans('call 415-555-0100 now', [span('PHONE', 5, 17)]);
    expect(result.scrubbed).toBe('call [PHONE] now');
    expect(result.entityCount).toBe(1);
  });

  it('replaces multiple non-overlapping spans', () => {
    const text = 'jane@x.com called 415-555-0100';
    const result = applySpans(text, [span('EMAIL', 0, 10), span('PHONE', 18, 30)]);
    expect(result.scrubbed).toBe('[EMAIL] called [PHONE]');
    expect(result.entityCount).toBe(2);
  });

  it('handles span at the very start of the string', () => {
    const result = applySpans('jane@x.com is here', [span('EMAIL', 0, 10)]);
    expect(result.scrubbed).toBe('[EMAIL] is here');
  });

  it('handles span at the very end of the string', () => {
    const result = applySpans('email: jane@x.com', [span('EMAIL', 7, 17)]);
    expect(result.scrubbed).toBe('email: [EMAIL]');
  });

  it('drops an overlapping span that starts inside an earlier span', () => {
    // span A: 0-10, span B: 5-15 — B overlaps A, B should be dropped
    const result = applySpans('0123456789abcdef', [span('A', 0, 10), span('B', 5, 15)]);
    expect(result.scrubbed).toBe('[A]abcdef');
    expect(result.entityCount).toBe(1);
  });

  it('on a tie (same start), keeps the longer span', () => {
    // B is longer and should win
    const result = applySpans('0123456789', [span('A', 0, 5), span('B', 0, 8)]);
    expect(result.scrubbed).toBe('[B]89');
    expect(result.entityCount).toBe(1);
  });

  it('handles adjacent non-overlapping spans without gap', () => {
    const result = applySpans('ABCD', [span('X', 0, 2), span('Y', 2, 4)]);
    expect(result.scrubbed).toBe('[X][Y]');
    expect(result.entityCount).toBe(2);
  });

  it('sorts spans by start position regardless of input order', () => {
    const text = 'jane@x.com called 415-555-0100';
    const result = applySpans(text, [span('PHONE', 18, 30), span('EMAIL', 0, 10)]);
    expect(result.scrubbed).toBe('[EMAIL] called [PHONE]');
  });
});

describe('mergeSpans', () => {
  it('flattens multiple span lists', () => {
    const a = [span('EMAIL', 0, 5)];
    const b = [span('PHONE', 10, 20)];
    expect(mergeSpans(a, b)).toEqual([...a, ...b]);
  });

  it('returns empty array when all inputs are empty', () => {
    expect(mergeSpans([], [])).toEqual([]);
  });

  it('handles a single list', () => {
    const a = [span('EMAIL', 0, 5)];
    expect(mergeSpans(a)).toEqual(a);
  });
});
