import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { audioRepository } from '@/services/AudioRepository';
import type { ClipStatus, Session, SessionClip } from '@/types';

export function useAudioRecovery(
  sessionId: string,
  session: Session | undefined,
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void,
) {
  const recoveryRanRef = useRef(false);
  useEffect(() => {
    if (recoveryRanRef.current || !session) return;
    recoveryRanRef.current = true;
    const pending = session.clips.filter((c) => c.status === 'pending');
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const outcomes: Array<{ clipId: string; ok: boolean }> = [];
      for (const clip of pending) {
        try {
          const chunks = await audioRepository.loadChunks(clip.id);
          if (chunks.length === 0) {
            outcomes.push({ clipId: clip.id, ok: false });
            continue;
          }
          const mimeType = chunks[0]?.type || 'audio/webm';
          const blob = new Blob(chunks, { type: mimeType });
          await audioRepository.save(clip.id, blob);
          await audioRepository.clearChunks(clip.id);
          outcomes.push({ clipId: clip.id, ok: true });
        } catch (err) {
          console.error(`Audio recovery failed for clip ${clip.id}:`, err);
          outcomes.push({ clipId: clip.id, ok: false });
        }
      }
      if (cancelled || outcomes.length === 0) return;

      patchClips((clips) =>
        clips.map((c) => {
          const o = outcomes.find((x) => x.clipId === c.id);
          if (!o) return c;
          return o.ok
            ? { ...c, status: 'ready' as ClipStatus, updatedAt: Date.now() }
            : {
                ...c,
                status: 'failed' as ClipStatus,
                errorMessage: 'Recording was interrupted before any audio could be saved.',
                updatedAt: Date.now(),
              };
        }),
      );
      const recovered = outcomes.filter((o) => o.ok).length;
      const abandoned = outcomes.length - recovered;
      if (recovered > 0)
        toast.success(`Recovered ${recovered} interrupted clip${recovered === 1 ? '' : 's'}.`);
      if (abandoned > 0)
        toast.error(`${abandoned} clip${abandoned === 1 ? '' : 's'} could not be recovered.`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
