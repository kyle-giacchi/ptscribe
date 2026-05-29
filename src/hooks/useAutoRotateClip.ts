import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { MAX_CLIP_DURATION_SEC } from '@/lib/audioLimits';

/**
 * Auto-rotates the recording clip when the live elapsed time crosses
 * `MAX_CLIP_DURATION_SEC`, so long sessions are split for transcription.
 *
 * Reads the elapsed seconds from the recorder's duration external store via a
 * lightweight poll (1 Hz) rather than a per-second `durationSec` state value, so
 * rotation no longer forces the host (SessionRoute) to re-render every second.
 * See plan 11.
 */
export function useAutoRotateClip(
  recorderStatus: string,
  getDurationSec: () => number,
  onStop: () => Promise<void>,
  onStart: () => Promise<void>,
) {
  const rotatingRef = useRef(false);

  useEffect(() => {
    if (recorderStatus !== 'recording') return;

    let unmounted = false;

    const maybeRotate = () => {
      if (getDurationSec() < MAX_CLIP_DURATION_SEC) return;
      if (rotatingRef.current) return;
      rotatingRef.current = true;
      (async () => {
        try {
          await onStop();
          // Guard before starting a new recording: if the component unmounted
          // while onStop() was running, skip onStart() to avoid opening a mic
          // and creating orphaned state on an unmounted component.
          if (unmounted) return;
          await onStart();
          toast.info(
            'Started a new clip — long sessions are split automatically for transcription.',
          );
        } finally {
          rotatingRef.current = false;
        }
      })();
    };

    // Poll the duration store rather than subscribing to per-second state.
    maybeRotate();
    const interval = setInterval(maybeRotate, 1000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderStatus]);
}
