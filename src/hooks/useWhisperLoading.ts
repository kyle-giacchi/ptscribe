import { useEffect, useState } from 'react';
import { isWhisperPreloadComplete, getWhisperPreloadPromise } from '@/services/ai/client/localWhisper';

/** Returns true while the Whisper model is downloading / initializing. */
export function useWhisperLoading(): boolean {
  const [loading, setLoading] = useState(() => !isWhisperPreloadComplete());

  useEffect(() => {
    if (isWhisperPreloadComplete()) { setLoading(false); return; }
    let active = true;
    getWhisperPreloadPromise().then(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return loading;
}
