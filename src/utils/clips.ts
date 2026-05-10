import type { SessionClip } from '@/types';

export function getTranscribableClips(clips: SessionClip[]): SessionClip[] {
  return clips.filter(
    (c) =>
      c.status === 'ready' ||
      c.status === 'failed' ||
      (c.status === 'transcribed' && !!c.localTranscript && c.transcript === c.localTranscript),
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
export function mergeClipTranscriptsWithMarkers(
  clips: SessionClip[],
  allClips: SessionClip[],
): string {
  const transcribed = clips
    .filter((c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (transcribed.length <= 1) {
    return transcribed.map((c) => c.transcript!.trim()).join('\n\n');
  }

  return transcribed
    .map((c) => {
      const clipNumber = allClips.findIndex((x) => x.id === c.id) + 1;
      return `--- [Clip ${clipNumber}] ---\n${c.transcript!.trim()}`;
    })
    .join('\n\n');
}

const CLIP_MARKER_RE = /^--- \[Clip \d+\] ---\n?/gm;

/** Strip display-only clip markers out of a string before storing it. */
export function stripClipMarkers(text: string): string {
  return text.replace(CLIP_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}
