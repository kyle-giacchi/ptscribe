import type { SessionClip } from '@/types';
import type { T2Phase } from '@/hooks/useBackgroundTranscription';

export type ClipStatusTone = 'accent' | 'negative' | 'amber';

// ── "Is this clip usable?" — four different questions ──────────────────────
// These are deliberately not one predicate. Each answers a different question
// about a clip (CONTEXT.md §Clips); two of them will always disagree. Naming
// them here makes the difference visible and turns a new SessionClip['status']
// value into a one-file audit.

/**
 * Audio is persisted and readable — safe to load and merge.
 * `failed` and `pending` clips have no bytes in the repository.
 */
export function isMergeable(clip: Pick<SessionClip, 'status'>): boolean {
  return clip.status === 'ready' || clip.status === 'transcribed';
}

/**
 * The audio-save attempt has finished, success or failure — an upload wait can
 * stop waiting. Deliberately includes `failed`: a failed save still settles.
 */
export function isSettled(clip: Pick<SessionClip, 'status'>): boolean {
  return isMergeable(clip) || clip.status === 'failed';
}

/** Carries non-blank transcript text worth showing or merging. */
export function hasTranscriptText(clip: Pick<SessionClip, 'status' | 'transcript'>): boolean {
  return clip.status === 'transcribed' && !!clip.transcript && clip.transcript.trim().length > 0;
}

/**
 * No clinician edit would be lost by re-transcribing: either the clip has no
 * transcript yet, or its transcript is still exactly the T2 output.
 */
export function isPristineT2(
  clip: Pick<SessionClip, 'status' | 'transcript' | 't2Transcript'>,
): boolean {
  return (
    clip.status === 'ready' ||
    clip.status === 'failed' ||
    (clip.status === 'transcribed' && !!clip.t2Transcript && clip.transcript === clip.t2Transcript)
  );
}

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
  return clips.filter(isPristineT2);
}

export function mergeClipTranscripts(clips: SessionClip[]): string {
  return clips
    .filter(hasTranscriptText)
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
  const transcribed = clips.filter(hasTranscriptText).sort((a, b) => a.createdAt - b.createdAt);

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
