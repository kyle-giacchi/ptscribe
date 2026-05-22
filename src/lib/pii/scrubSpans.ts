// Shared PII span → scrubbed-string logic.
// Used by both the regex pre-pass (main thread) and the NER worker so their
// detected spans flow through one dedupe + replace code path.

export type PIISpan = {
  entity_group: string;
  start: number;
  end: number;
};

/**
 * Replace each span with `[ENTITY_GROUP]`. Overlapping spans are dropped,
 * keeping whichever starts first (then whichever is longer on a tie).
 */
export function applySpans(
  text: string,
  spans: PIISpan[],
): { scrubbed: string; entityCount: number } {
  // Sort by start, then by longer span first so the wider match wins a tie.
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);

  const deduped: PIISpan[] = [];
  let lastEnd = 0;
  for (const span of sorted) {
    if (span.start >= lastEnd) {
      deduped.push(span);
      lastEnd = span.end;
    }
  }

  let result = '';
  let cursor = 0;
  for (const span of deduped) {
    result += text.slice(cursor, span.start);
    result += `[${span.entity_group}]`;
    cursor = span.end;
  }
  result += text.slice(cursor);

  return { scrubbed: result, entityCount: deduped.length };
}

/** Merge regex + model spans into one list for a combined scrub. */
export function mergeSpans(...lists: PIISpan[][]): PIISpan[] {
  return lists.flat();
}
