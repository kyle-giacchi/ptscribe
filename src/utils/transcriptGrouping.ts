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
    paragraphs = transcript.split(/\n{2,}/).map((l) => l.trim()).filter(Boolean);
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

function wordCount(s: string): number {
  return s.trim() === '' ? 0 : s.trim().split(/\s+/).length;
}

function normalise(raw: string): string {
  const up = raw.toUpperCase();
  if (up === 'DR') return 'Dr';
  if (up === 'PT') return 'Pt';
  return raw;
}
