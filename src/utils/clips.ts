import type { SessionClip } from '@/types';
import type { T2Phase } from '@/hooks/useBackgroundTranscription';

export type ClipStatusTone = 'accent' | 'negative' | 'amber';

/** Status pill shown on a clip card — own status wins; 'ready'/'transcribing' fall through to the T2 pipeline phase. */
export function clipStatusTone(
  clip: Pick<SessionClip, 'status'>,
  t2Phase: T2Phase,
  t2Label: string,
): { statusTone: ClipStatusTone; statusLabel: string } {
  if (clip.status === 'transcribed') return { statusTone: 'accent', statusLabel: 'Transcribed' };
  if (clip.status === 'failed') return { statusTone: 'negative', statusLabel: 'Failed' };
  if (clip.status === 'pending') return { statusTone: 'amber', statusLabel: 'Recording…' };
  if (t2Phase === 'transcribing')
    return { statusTone: 'amber', statusLabel: t2Label || 'Transcribing…' };
  if (t2Phase === 'retrying') return { statusTone: 'amber', statusLabel: 'Retrying…' };
  if (t2Phase === 'done') return { statusTone: 'accent', statusLabel: 'Transcribed' };
  if (t2Phase === 'error') return { statusTone: 'negative', statusLabel: 'Failed' };
  return { statusTone: 'amber', statusLabel: 'Queued' };
}

export function getTranscribableClips(clips: SessionClip[]): SessionClip[] {
  return clips.filter(
    (c) =>
      c.status === 'ready' ||
      c.status === 'failed' ||
      (c.status === 'transcribed' && !!c.t2Transcript && c.transcript === c.t2Transcript),
  );
}

export function mergeClipTranscripts(clips: SessionClip[]): string {
  return clips
    .filter((c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => c.transcript!.trim())
    .join('\n\n');
}

/**
 * Like mergeClipTranscripts, but inserts `--- [Clip N] ---` dividers between
 * segments so the PT can see which portion came from which clip.
 * Display-only — never stored.
 */
export function mergeClipTranscriptsWithMarkers(clips: SessionClip[]): string {
  const transcribed = clips
    .filter((c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (transcribed.length <= 1) {
    return transcribed.map((c) => c.transcript!.trim()).join('\n\n');
  }

  return transcribed
    .map((c) => {
      const clipNumber = clips.findIndex((x) => x.id === c.id) + 1;
      return `--- [Clip ${clipNumber}] ---\n${c.transcript!.trim()}`;
    })
    .join('\n\n');
}

const CLIP_MARKER_RE = /^--- \[Clip \d+\] ---\n?/gm;

/** Strip display-only clip markers out of a string before storing it. */
export function stripClipMarkers(text: string): string {
  return text
    .replace(CLIP_MARKER_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
