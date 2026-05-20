import { useCallback, useEffect, useState } from 'react';
import {
  isWhisperPreloadComplete,
  getWhisperPreloadPromise,
} from '@/services/ai/client/localWhisper';

export interface WhisperLoadingState {
  loading: boolean;
  failed: boolean;
  retry: () => void;
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
export function useWhisperLoading(): WhisperLoadingState {
  const [loading, setLoading] = useState(() => !isWhisperPreloadComplete());
  const [failed, setFailed] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (isWhisperPreloadComplete() && reloadTick === 0) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    getWhisperPreloadPromise()
      .then(() => {
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [reloadTick]);

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  return { loading, failed, retry };
}
