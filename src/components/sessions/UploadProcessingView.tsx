import { useEffect, useRef, useState } from 'react';
import type { T2Phase } from '@/hooks/useBackgroundTranscription';

const PROCESSING_STEPS = [
  { label: 'Reading audio file',               threshold: 0.00 },
  { label: 'Sending to transcription service', threshold: 0.10 },
  { label: 'Transcribing audio',               threshold: 0.25 },
  { label: 'Finalizing transcript',            threshold: 0.88 },
] as const;

interface Props {
  durationSec?: number;
  t2Phase?: T2Phase;
  t2Label?: string;
  onRetry?: () => void;
  onGoToNotes?: () => void;
}

export function UploadProcessingView({ durationSec, t2Phase, t2Label, onRetry, onGoToNotes }: Props) {
  // ~150ms per second of audio; realtime transcription is typically 5–10× faster than playback
  const estimatedMs = Math.max(3000, (durationSec ?? 30) * 150);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = Date.now();
    const cap = 0.95;

    function tick() {
      const t = Math.min(1, (Date.now() - start) / estimatedMs);
      const eased = Math.min(cap, 1 - Math.pow(1 - t, 3)); // ease-out cubic
      setProgress(eased);
      if (eased < cap) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [estimatedMs]);

  const autoStepLabel =
    [...PROCESSING_STEPS].reverse().find((s) => progress >= s.threshold)?.label ??
    PROCESSING_STEPS[0].label;

  const stepLabel =
    (t2Phase === 'transcribing' || t2Phase === 'retrying') && t2Label
      ? t2Label
      : autoStepLabel;

  if (t2Phase === 'error') {
    return (
      <div className="flex flex-col items-center gap-6 py-16 px-8">
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-pt-text)' }}>
          Transcription failed
        </span>
        <span className="text-sm text-center" style={{ color: 'var(--color-pt-text-3)', maxWidth: 300 }}>
          Automatic transcription could not complete. You can retry or continue to your notes.
        </span>
        <div className="flex gap-3">
          {onRetry && (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Retry
            </button>
          )}
          {onGoToNotes && (
            <button type="button" className="btn btn-ghost" onClick={onGoToNotes}>
              Go to Notes
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-16 px-8">
      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-pt-text)' }}>
        Processing audio
      </span>
      <div className="flex w-full flex-col items-center gap-2" style={{ maxWidth: 320 }}>
        <div
          className="w-full overflow-hidden rounded-full"
          style={{ height: 6, background: 'var(--color-pt-border)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(progress * 100)}%`,
              background: 'var(--color-pt-accent)',
              transition: 'width 120ms linear',
            }}
          />
        </div>
        <span className="text-xs" style={{ color: 'var(--color-pt-text-3)' }}>
          {stepLabel}
        </span>
      </div>
    </div>
  );
}
