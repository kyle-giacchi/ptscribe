/**
 * Lightly clean a raw transcript: collapse whitespace, normalize newlines,
 * trim per-line. Heavy NLP is deferred to the LLM.
 */
export function normalizeTranscript(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Word count — used for UI hints ("transcript looks short").
 */
export function wordCount(s: string): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}
