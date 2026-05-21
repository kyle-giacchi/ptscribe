import { useEffect, useState } from 'react';
import { whisperLoader } from '@/services/ai/client/localWhisper';

export interface WhisperLoadingState {
  loading: boolean;
  exhausted: boolean;
}

/**
 * Tracks the local Whisper preload state.
 *
 * - `loading` is true while the model is downloading / initializing.
 * - `exhausted` is true after both auto-retry attempts have failed. The loader
 *   does not surface a retry to the user — the dialog offers alternative paths
 *   (web speech or record-without-transcription) instead.
 */
export function useWhisperLoading(): WhisperLoadingState {
  const [status, setStatus] = useState<'loading' | 'ready' | 'exhausted'>(() => {
    const s = whisperLoader.status;
    if (s === 'ready') return 'ready';
    if (s === 'exhausted') return 'exhausted';
    return 'loading';
  });

  useEffect(() => {
    const s = whisperLoader.status;
    if (s === 'ready' || s === 'exhausted') return;
    void whisperLoader
      .ensureReady()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('exhausted'));
  }, []);

  return { loading: status === 'loading', exhausted: status === 'exhausted' };
}
