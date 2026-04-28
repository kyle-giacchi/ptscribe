import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { MAX_CLIP_DURATION_SEC } from '@/lib/audioLimits';

export function useAutoRotateClip(
  recorderStatus: string,
  recorderDurationSec: number,
  onStop: () => Promise<void>,
  onStart: () => Promise<void>,
) {
  const rotatingRef = useRef(false);

  useEffect(() => {
    if (recorderStatus !== 'recording') return;
    if (recorderDurationSec < MAX_CLIP_DURATION_SEC) return;
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    (async () => {
      try {
        await onStop();
        await onStart();
        toast.info('Started a new clip — long sessions are split automatically for transcription.');
      } finally {
        rotatingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderStatus, recorderDurationSec]);
}
