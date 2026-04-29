import { useState } from 'react';
import { audioRepository } from '@/services/AudioRepository';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { useSettings } from '@/contexts/SettingsProvider';

export type CompiledAudio = { blob: Blob; forId: string; savedSec: number };
type CompileError = { msg: string; forId: string };

export function useAudioProcessing(activeId: string) {
  const { settings } = useSettings();
  const [silenced, setSilenced] = useState<CompiledAudio | null>(null);
  const [spedup, setSpedup] = useState<CompiledAudio | null>(null);
  const [compilingSilence, setCompilingSilence] = useState(false);
  const [compilingSpeed, setCompilingSpeed] = useState(false);
  const [silenceError, setSilenceError] = useState<CompileError | null>(null);
  const [speedError, setSpeedError] = useState<CompileError | null>(null);

  // Derived — automatically invalidated when activeId changes, no effects needed
  const activeSilenced = silenced?.forId === activeId ? silenced : null;
  const activeSpedup = spedup?.forId === activeId ? spedup : null;
  const activeSilenceError = silenceError?.forId === activeId ? silenceError.msg : null;
  const activeSpeedError = speedError?.forId === activeId ? speedError.msg : null;

  async function compileSilence() {
    if (!activeId) return;
    setCompilingSilence(true);
    setSilenceError(null);
    try {
      const original = await audioRepository.load(activeId);
      if (!original) throw new Error('Audio not found');
      const sd = settings.audio.silenceDetection;
      const result = await trimSilence(original, { sensitivity: sd.sensitivity, padMs: sd.padMs });
      setSilenced({ blob: result.trimmed, forId: activeId, savedSec: result.report.droppedSec });
      setSpedup(null);
      setSpeedError(null);
    } catch (e) {
      setSilenceError({ msg: (e as Error).message, forId: activeId });
    } finally {
      setCompilingSilence(false);
    }
  }

  async function compileSpeed() {
    if (!activeId) return;
    setCompilingSpeed(true);
    setSpeedError(null);
    try {
      const su = settings.audio.speedUp;
      const source = activeSilenced?.blob ?? (await audioRepository.load(activeId));
      if (!source) throw new Error('Audio not found');
      const result = await speedUpAudio(source, su.speed as SpeedFactor);
      setSpedup({ blob: result.result, forId: activeId, savedSec: result.report.savedSec });
    } catch (e) {
      setSpeedError({ msg: (e as Error).message, forId: activeId });
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
