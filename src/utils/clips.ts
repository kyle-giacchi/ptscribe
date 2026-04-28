import type { SessionClip } from '@/types';

export function mergeClipTranscripts(clips: SessionClip[]): string {
  return clips
    .filter((c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => c.transcript!.trim())
    .join('\n\n');
}
