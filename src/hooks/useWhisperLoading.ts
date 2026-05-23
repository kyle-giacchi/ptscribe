import { useEffect, useState } from 'react';
import { whisperLoader } from '@/services/ai/client/localWhisper';

export interface WhisperLoadingState {
  loading: boolean;
  exhausted: boolean;
}

// How long to wait before showing the "loading" UI — prevents a flash when the
// model loads from IDB cache in under this threshold (common for returning users).
const LOADING_UI_DEBOUNCE_MS = 200;

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

  // Debounce the loading indicator so a fast IDB cache hit doesn't flash the
  // button between disabled→enabled states. Only show the spinner/gate after
  // LOADING_UI_DEBOUNCE_MS ms of sustained loading.
  const [showLoadingUI, setShowLoadingUI] = useState(false);

  useEffect(() => {
    if (status !== 'loading') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLoadingUI(false);
      return;
    }
    const t = setTimeout(() => setShowLoadingUI(true), LOADING_UI_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const s = whisperLoader.status;
    if (s === 'ready' || s === 'exhausted') return;
    void whisperLoader
      .ensureReady()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('exhausted'));
  }, []);

  return { loading: status === 'loading' && showLoadingUI, exhausted: status === 'exhausted' };
}
