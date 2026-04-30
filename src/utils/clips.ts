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
