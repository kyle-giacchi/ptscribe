import { useCallback, useEffect, useState } from 'react';
import {
  isWhisperPreloadComplete,
  getWhisperPreloadPromise,
} from '@/services/ai/client/localWhisper';

export interface WhisperLoadingState {
  loading: boolean;
  failed: boolean;
  /**
   * Kicks off a fresh preload attempt and returns a Promise that resolves on
   * success / rejects on failure. Callers can chain on this promise to wire
   * post-recovery work (e.g. auto-resume a deferred recording start) without
   * needing an effect that watches `loading` / `failed`.
   */
  retry: () => Promise<void>;
}

/**
 * Tracks the local Whisper preload state.
 *
 * - `loading` is true while the model is downloading / initializing.
 * - `failed` is true once a preload attempt rejects, and stays true until the
 *   user explicitly invokes `retry()`. This lets the UI gate Start Recording
 *   behind a recovery dialog rather than silently proceeding when local
 *   transcription is unavailable.
 * - `retry()` triggers a fresh preload attempt; the underlying client resets
 *   its internal state so the next `getWhisperPreloadPromise()` call kicks
 *   off a new download.
 */
type Status = 'loading' | 'idle' | 'failed';

export function useWhisperLoading(): WhisperLoadingState {
  // status is the single source of truth; the lazy init handles "already
  // preloaded" without needing a sync setState in the effect.
  const [status, setStatus] = useState<Status>(() =>
    isWhisperPreloadComplete() ? 'idle' : 'loading',
  );
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    // Skip the initial mount if preload is already complete — the lazy init
    // above settled status to 'idle' and there's nothing to attach to.
    if (reloadTick === 0 && isWhisperPreloadComplete()) return;
    let active = true;
    getWhisperPreloadPromise()
      .then(() => {
        if (active) setStatus('idle');
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [reloadTick]);

  const retry = useCallback((): Promise<void> => {
    // Flip back to loading at the event boundary (event handler, not effect)
    // and bump the tick to re-run the preload effect. The promise we return
    // tracks the same in-flight preload that the effect chains on — once the
    // failed promise rejected, localWhisper resets `_preloadDonePromise`, so
    // calling getWhisperPreloadPromise() here kicks off the new attempt and
    // returns its fresh promise.
    setStatus('loading');
    setReloadTick((t) => t + 1);
    return getWhisperPreloadPromise();
  }, []);

  return { loading: status === 'loading', failed: status === 'failed', retry };
}
