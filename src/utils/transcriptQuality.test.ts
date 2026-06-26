import { describe, it, expect } from 'vitest';
import { assessTranscriptQuality } from './transcriptQuality';

describe('assessTranscriptQuality', () => {
  it('returns unknown for empty text', () => {
    expect(assessTranscriptQuality('', 180)).toBe('unknown');
    expect(assessTranscriptQuality('   ', 180)).toBe('unknown');
  });

  it('returns ok for a normal transcript under 120s', () => {
    // Under 120s: rule 1 doesn't apply even with few words
    expect(assessTranscriptQuality('short note.', 60)).toBe('ok');
  });

  it('rule 1: returns low when >120s and fewer than 30 words', () => {
    const sparse = 'patient came in for knee pain today okay.'; // ~8 words
    expect(assessTranscriptQuality(sparse, 121)).toBe('low');
  });

  it('rule 1: returns ok when >120s and 30+ words', () => {
    // 32 diverse words, 4 sentence ends — no other rule triggered
    const text =
      'Patient presents with right shoulder pain rated four out of ten. ' +
      'Range of motion limited in flexion to one hundred twenty degrees. ' +
      'Performed manual therapy and therapeutic exercises. Patient tolerated treatment well.';
    expect(assessTranscriptQuality(text, 180)).toBe('ok');
  });

  it('rule 2: returns low when >20% of unique tokens appear 5+ times (Whisper hallucination)', () => {
    // 10 words needed for rule 2 to engage; 'the' x7 → 1 of 4 unique tokens (25%) ≥5 times
    const repeated = 'the the the the the the the dog cat ran';
    expect(assessTranscriptQuality(repeated, 60)).toBe('low');
  });

  it('rule 2: does not flag normal repetition below the 20% threshold', () => {
    // All tokens appear ≤2 times; 4 sentence ends so rule 3 passes too
    const text =
      'Patient reports improved knee pain. Physical therapy is progressing well. ' +
      'Range of motion has increased significantly today. Patient tolerated all exercises.';
    expect(assessTranscriptQuality(text, 60)).toBe('ok');
  });

  it('rule 3: returns low when >15 words but fewer than 3 sentence-ending marks', () => {
    const fragmented = Array(16).fill('word').join(' '); // no punctuation
    expect(assessTranscriptQuality(fragmented, 60)).toBe('low');
  });

  it('rule 3: returns ok when >15 words with 3+ sentence-ending marks', () => {
    const prose =
      'Patient reports improvement in knee pain. ROM has increased. Patient tolerated treatment well. Plan to progress.';
    expect(assessTranscriptQuality(prose, 60)).toBe('ok');
  });

  it('rule 3: does not flag short transcripts (<=15 words) for missing punctuation', () => {
    // 10 distinct words, no punctuation — rule 3 guard (>15 words) prevents flagging
    const short = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
    expect(assessTranscriptQuality(short, 60)).toBe('ok');
  });

  it('returns ok for a realistic clinical transcript', () => {
    const clinical =
      'Patient presents with right shoulder pain rated 4/10. AROM limited in flexion to 120 degrees. ' +
      'Performed manual therapy and therapeutic exercise. Patient tolerated treatment well. ' +
      'Will continue current plan of care next visit.';
    expect(assessTranscriptQuality(clinical, 90)).toBe('ok');
  });
});
