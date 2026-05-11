import { useEffect, useRef, useState } from 'react';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { useSettings } from '@/contexts/SettingsProvider';

export type CompiledAudio = { blob: Blob; forId: string; savedSec: number };
type CompileError = { msg: string; forId: string };

const KEY = 'merged';

export function useAudioProcessing(sourceBlob: Blob | null) {
  const { settings } = useSettings();
  const [silenced, setSilenced] = useState<CompiledAudio | null>(null);
  const [spedup, setSpedup] = useState<CompiledAudio | null>(null);
  const [compilingSilence, setCompilingSilence] = useState(false);
  const [compilingSpeed, setCompilingSpeed] = useState(false);
  const [silenceError, setSilenceError] = useState<CompileError | null>(null);
  const [speedError, setSpeedError] = useState<CompileError | null>(null);

  const activeSilenced = silenced?.forId === KEY ? silenced : null;
  const activeSpedup = spedup?.forId === KEY ? spedup : null;
  const activeSilenceError = silenceError?.forId === KEY ? silenceError.msg : null;
  const activeSpeedError = speedError?.forId === KEY ? speedError.msg : null;

  // Runs the full pipeline: silence trim → speed-up on the trimmed result.
  async function runChain() {
    if (!sourceBlob) return;

    setCompilingSilence(true);
    setSilenceError(null);
    let trimmedBlob: Blob;
    let silenceSavedSec: number;
    try {
      const sd = settings.audio.silenceDetection;
      const result = await trimSilence(sourceBlob, { sensitivity: sd.sensitivity, padMs: sd.padMs });
      trimmedBlob = result.trimmed;
      silenceSavedSec = result.report.droppedSec;
      setSilenced({ blob: trimmedBlob, forId: KEY, savedSec: silenceSavedSec });
      setSpedup(null);
      setSpeedError(null);
    } catch (e) {
      setSilenceError({ msg: (e as Error).message, forId: KEY });
      return;
    } finally {
      setCompilingSilence(false);
    }

    setCompilingSpeed(true);
    setSpeedError(null);
    try {
      const su = settings.audio.speedUp;
      const result = await speedUpAudio(trimmedBlob, su.speed as SpeedFactor);
      setSpedup({ blob: result.result, forId: KEY, savedSec: result.report.savedSec });
    } catch (e) {
      setSpeedError({ msg: (e as Error).message, forId: KEY });
    } finally {
      setCompilingSpeed(false);
    }
  }

  async function compileSilence() {
    if (!sourceBlob) return;
    setCompilingSilence(true);
    setSilenceError(null);
    try {
      const sd = settings.audio.silenceDetection;
      const result = await trimSilence(sourceBlob, { sensitivity: sd.sensitivity, padMs: sd.padMs });
      setSilenced({ blob: result.trimmed, forId: KEY, savedSec: result.report.droppedSec });
      setSpedup(null);
      setSpeedError(null);
    } catch (e) {
      setSilenceError({ msg: (e as Error).message, forId: KEY });
    } finally {
      setCompilingSilence(false);
    }
  }

  async function compileSpeed() {
    if (!sourceBlob) return;
    setCompilingSpeed(true);
    setSpeedError(null);
    try {
      const su = settings.audio.speedUp;
      // Always use silenced audio if available; fall back to source.
      const source = activeSilenced?.blob ?? sourceBlob;
      const result = await speedUpAudio(source, su.speed as SpeedFactor);
      setSpedup({ blob: result.result, forId: KEY, savedSec: result.report.savedSec });
    } catch (e) {
      setSpeedError({ msg: (e as Error).message, forId: KEY });
    } finally {
      setCompilingSpeed(false);
    }
  }

  function resetSilence() {
    setSilenced(null);
    setSpedup(null);
    setSpeedError(null);
  }

  function resetSpeed() {
    setSpedup(null);
    setSpeedError(null);
  }

  // Auto-run the full chain the first time a source blob arrives.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!sourceBlob || autoRanRef.current) return;
    autoRanRef.current = true;
    void runChain();
  }, [sourceBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    activeSilenced,
    activeSpedup,
    compilingSilence,
    compilingSpeed,
    activeSilenceError,
    activeSpeedError,
    compileSilence,
    compileSpeed,
    resetSilence,
    resetSpeed,
  };
}
