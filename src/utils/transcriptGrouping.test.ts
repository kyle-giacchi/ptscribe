import { describe, it, expect } from 'vitest';
import { parseTranscriptSegments } from './transcriptGrouping';

describe('parseTranscriptSegments', () => {
  it('returns empty array for empty transcript', () => {
    expect(parseTranscriptSegments('', 60)).toEqual([]);
  });

  it('parses diarized format into segments with speaker labels', () => {
    const t = 'Dr.: Good to see you.\nPt.: Thanks, doing well.';
    const segs = parseTranscriptSegments(t, 120);
    expect(segs).toHaveLength(2);
    expect(segs[0].speaker).toBe('Dr');
    expect(segs[0].text).toBe('Good to see you.');
    expect(segs[1].speaker).toBe('Pt');
  });

  it('first segment always has showMinuteDivider=true', () => {
    const segs = parseTranscriptSegments('Hello world.', 60);
    expect(segs[0].showMinuteDivider).toBe(true);
  });

  it('estimates minute boundaries across long transcripts', () => {
    // 120-word transcript at 180s total → ~1 word/sec → minute boundary at word 60
    const words60 = Array(60).fill('word').join(' ');
    const words60b = Array(60).fill('other').join(' ');
    const segs = parseTranscriptSegments(`${words60}\n\n${words60b}`, 180);
    expect(segs[1].showMinuteDivider).toBe(true);
  });

  it('falls back to paragraph splitting when no speaker labels', () => {
    const t = 'First paragraph.\n\nSecond paragraph.';
    const segs = parseTranscriptSegments(t, 60);
    expect(segs).toHaveLength(2);
    expect(segs[0].speaker).toBeNull();
  });
});
