/**
 * Heuristic transcript quality signal.
 *
 * Returns 'ok' | 'low' | 'unknown' — never blocks generation.
 *
 * Rules (any one failure → 'low'):
 *   1. Too short: <30 words in the transcript when total audio is >120 s.
 *   2. High repetition: >20% of unique tokens appear 5+ times
 *      (Whisper hallucination fingerprint — it loops the same phrase).
 *   3. Very fragmented: fewer than 3 sentence-ending punctuation marks
 *      when the transcript has >15 words (avoids flagging short-but-real notes).
 *
 * Returns 'unknown' when there is no transcript text or no duration info.
 */
export function assessTranscriptQuality(
  transcriptText: string,
  totalDurationSec: number,
): 'ok' | 'low' | 'unknown' {
  const text = transcriptText.trim();
  if (!text) return 'unknown';

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Not enough signal yet
  if (wordCount === 0) return 'unknown';

  // Rule 1: Too short relative to recording length
  if (totalDurationSec > 120 && wordCount < 30) return 'low';

  // Rule 2: High repetition (Whisper hallucination)
  if (wordCount >= 10) {
    const freq = new Map<string, number>();
    for (const w of words) {
      const token = w.toLowerCase().replace(/[^a-z']/g, '');
      if (token.length > 2) {
        freq.set(token, (freq.get(token) ?? 0) + 1);
      }
    }
    const uniqueCount = freq.size;
    if (uniqueCount > 0) {
      const highFreqCount = [...freq.values()].filter((n) => n >= 5).length;
      if (highFreqCount / uniqueCount > 0.2) return 'low';
    }
  }

  // Rule 3: Very fragmented — fewer than 3 sentence-ending punctuation marks
  if (wordCount > 15) {
    const sentenceEnds = (text.match(/[.?!]/g) ?? []).length;
    if (sentenceEnds < 3) return 'low';
  }

  return 'ok';
}
