import type { SessionClip } from '@/types';

export interface TranscriptSegment {
  text: string;
  speaker: string | null; // 'Dr' | 'Pt' | 'SPEAKER_0' etc., or null for plain text
  estimatedSec: number; // seconds from session start
  showMinuteDivider: boolean; // true when minute boundary crossed vs prior segment
  minuteLabel: string; // e.g. "02:08" — shown on divider
}

// Matches "Dr.: text" or "Pt.: text" or "SPEAKER_0: text" or "Dr: text" or "Pt: text"
const SPEAKER_RE = /^(Dr|Pt|SPEAKER_\d+)\.?:\s*(.*)/i;

export function parseTranscriptSegments(
  transcript: string,
  totalDurationSec: number,
): TranscriptSegment[] {
  if (!transcript.trim()) return [];

  // First, detect if we have speaker labels
  const hasSpeakers = SPEAKER_RE.test(transcript);

  let paragraphs: string[];
  if (hasSpeakers) {
    // Split by double newlines OR single newline followed by speaker pattern
    paragraphs = transcript
      .split(/\n{2,}|\n(?=[A-Z][a-z]*[.:]|SPEAKER_\d+:)/g)
      .map((l) => l.trim())
      .filter(Boolean);
  } else {
    // Fallback: split by double newlines for paragraph mode
    paragraphs = transcript
      .split(/\n{2,}/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  const totalWords = paragraphs.reduce((sum, p) => sum + wordCount(p), 0) || 1;
  let cumulativeWords = 0;
  let prevMinute = -1;

  return paragraphs.map((para): TranscriptSegment => {
    const match = SPEAKER_RE.exec(para);
    const speaker = match ? normalise(match[1]) : null;
    const text = match ? match[2].trim() : para;

    const estimatedSec = (cumulativeWords / totalWords) * totalDurationSec;
    const textForCount = match ? text : para;
    cumulativeWords += wordCount(textForCount);

    const minute = Math.floor(estimatedSec / 60);
    const showMinuteDivider = minute !== prevMinute;
    if (showMinuteDivider) prevMinute = minute;

    const mm = String(Math.floor(estimatedSec / 60)).padStart(2, '0');
    const ss = String(Math.floor(estimatedSec % 60)).padStart(2, '0');

    return {
      text,
      speaker,
      estimatedSec,
      showMinuteDivider,
      minuteLabel: `${mm}:${ss}`,
    };
  });
}

/**
 * Build transcript segments from real 2-min chunk timestamps stored on clips.
 * Returns null if no clip has chunk data (caller falls back to word estimation).
 * Multi-clip sessions accumulate clip durations as offsets so timestamps are
 * absolute from session start.
 */
export function parseChunkedTranscript(clips: SessionClip[]): TranscriptSegment[] | null {
  const sorted = [...clips]
    .filter((c) => c.transcriptChunks && c.transcriptChunks.length > 0)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (sorted.length === 0) return null;

  let clipOffset = 0;
  const segments: TranscriptSegment[] = [];

  for (const clip of sorted) {
    for (const chunk of clip.transcriptChunks!) {
      const absoluteSec = clipOffset + chunk.startSec;
      const mm = String(Math.floor(absoluteSec / 60)).padStart(2, '0');
      const ss = String(Math.floor(absoluteSec % 60)).padStart(2, '0');
      segments.push({
        text: chunk.text,
        speaker: null,
        estimatedSec: absoluteSec,
        showMinuteDivider: true, // every real chunk always gets a timestamp header
        minuteLabel: `${mm}:${ss}`,
      });
    }
    clipOffset += clip.durationSec;
  }

  return segments.length > 0 ? segments : null;
}

function wordCount(s: string): number {
  return s.trim() === '' ? 0 : s.trim().split(/\s+/).length;
}

function normalise(raw: string): string {
  const up = raw.toUpperCase();
  if (up === 'DR') return 'Dr';
  if (up === 'PT') return 'Pt';
  return raw;
}
