import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause } from 'lucide-react';

export function BlobWaveform({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const blobUrl = URL.createObjectURL(blob);

    async function load() {
      try {
        if (!containerRef.current) return;
        const ws = WaveSurfer.create({
          container: containerRef.current,
          height: 56,
          waveColor: getCssVar('--color-fg-subtle') || '#94a3b8',
          progressColor: getCssVar('--color-accent') || '#5b6cff',
          cursorColor: getCssVar('--color-fg') || '#0f172a',
          cursorWidth: 1,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          normalize: true,
          interact: true,
        });
        wsRef.current = ws;
        ws.on('ready', () => {
          if (!cancelled) {
            setReady(true);
            setDuration(ws.getDuration());
          }
        });
        ws.on('audioprocess', () => setCurrent(ws.getCurrentTime()));
        ws.on('seeking', () => setCurrent(ws.getCurrentTime()));
        ws.on('play', () => setPlaying(true));
        ws.on('pause', () => setPlaying(false));
        ws.on('finish', () => setPlaying(false));
        await ws.load(blobUrl);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load audio');
      }
    }

    void load();

    return () => {
      cancelled = true;
      wsRef.current?.destroy();
      wsRef.current = null;
      URL.revokeObjectURL(blobUrl);
    };
  }, [blob]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={() => wsRef.current?.playPause()}
          disabled={!ready}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <div ref={containerRef} className="min-h-[56px] sm:min-h-20 flex-1 overflow-hidden rounded-md" />
        <span
          className="font-mono text-xs tabular-nums"
          style={{ color: 'var(--color-fg-subtle)' }}
        >
          {formatTime(current)} / {formatTime(duration)}
        </span>
      </div>
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-negative)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
