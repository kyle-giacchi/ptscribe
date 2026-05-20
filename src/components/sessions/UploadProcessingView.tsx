import { useEffect, useRef, useState } from 'react';

const PROCESSING_STEPS = [
  { label: 'Reading audio file',               threshold: 0.00 },
  { label: 'Sending to transcription service', threshold: 0.10 },
  { label: 'Transcribing audio',               threshold: 0.25 },
  { label: 'Finalizing transcript',            threshold: 0.88 },
] as const;

export function UploadProcessingView({ durationSec }: { durationSec?: number }) {
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

  const stepLabel =
    [...PROCESSING_STEPS].reverse().find((s) => progress >= s.threshold)?.label ??
    PROCESSING_STEPS[0].label;

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
