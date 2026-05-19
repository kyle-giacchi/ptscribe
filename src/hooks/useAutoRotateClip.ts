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
    let unmounted = false;
    (async () => {
      try {
        await onStop();
        // Guard before starting a new recording: if the component unmounted
        // while onStop() was running, skip onStart() to avoid opening a mic
        // and creating orphaned state on an unmounted component.
        if (unmounted) return;
        await onStart();
        toast.info('Started a new clip — long sessions are split automatically for transcription.');
      } finally {
        rotatingRef.current = false;
      }
    })();
    return () => { unmounted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderStatus, recorderDurationSec]);
}
