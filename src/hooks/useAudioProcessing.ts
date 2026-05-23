import { useEffect, useRef, useState } from 'react';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { useSettings } from '@/contexts/SettingsProvider';

export type CompiledAudio = { blob: Blob; forId: string; savedSec: number };
type CompileError = { msg: string; forId: string };

const KEY = 'merged';

/**
 * Manages silence-removal for the combined session audio blob.
 *
 * If `precomputedSilenced` is provided (produced by buildMergedAudioForReview),
 * it is used directly and no additional silence pass is run. When absent the
 * hook auto-runs compileSilence on first blob arrival so the waveform is still
 * populated for sessions loaded from a previous page visit.
 *
 * Speed-up is intentionally absent: it is applied inline inside
 * handleCreateTranscript (the "Improve with AI" flow) immediately before the
 * audio is sent to Nova, so it never needs to be pre-computed here.
 */
export function useAudioProcessing(
  sourceBlob: Blob | null,
  precomputedSilenced: Blob | null = null,
) {
  const { settings } = useSettings();
  const [silenced, setSilenced] = useState<CompiledAudio | null>(null);
  const [compilingSilence, setCompilingSilence] = useState(false);
  const [silenceError, setSilenceError] = useState<CompileError | null>(null);
  const [seededPrecomputed, setSeededPrecomputed] = useState<Blob | null>(null);

  const activeSilenced = silenced?.forId === KEY ? silenced : null;
  const activeSilenceError = silenceError?.forId === KEY ? silenceError.msg : null;

  // When a pre-computed silenced blob arrives (from buildMergedAudioForReview),
  // adopt it directly — no need to re-run trimSilence on the merged blob.
  // Done during render (not in an effect) so it doesn't trigger a cascading
  // re-render; guarded by seededPrecomputed so it runs once per distinct blob
  // and a later compileSilence() result is not clobbered.
  if (precomputedSilenced && precomputedSilenced !== seededPrecomputed) {
    setSeededPrecomputed(precomputedSilenced);
    setSilenced({ blob: precomputedSilenced, forId: KEY, savedSec: 0 });
  }

  async function compileSilence() {
    if (!sourceBlob) return;
    setCompilingSilence(true);
    setSilenceError(null);
    try {
      const sd = settings.audio.silenceDetection;
      const result = await trimSilence(sourceBlob, { sensitivity: sd.sensitivity, padMs: sd.padMs });
      setSilenced({ blob: result.trimmed, forId: KEY, savedSec: result.report.droppedSec });
    } catch (e) {
      setSilenceError({ msg: (e as Error).message, forId: KEY });
    } finally {
      setCompilingSilence(false);
    }
  }

  function resetSilence() {
    setSilenced(null);
  }

  // Auto-run silence trim on first blob arrival only when no pre-computed blob
  // was supplied (e.g. session loaded from storage on a return visit).
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!sourceBlob || autoRanRef.current || precomputedSilenced) return;
    autoRanRef.current = true;
    void compileSilence();
  }, [sourceBlob, precomputedSilenced]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    activeSilenced,
    compilingSilence,
    activeSilenceError,
    compileSilence,
    resetSilence,
  };
}
