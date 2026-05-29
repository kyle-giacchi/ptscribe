import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Loader2, Pause, Play } from 'lucide-react';
import { audioRepository } from '@/services/AudioRepository';
import { formatDuration } from '@/utils/format';

interface PlaybackWaveformProps {
  /** Key into AudioRepository — usually a SessionClip.id. */
  audioKey: string;
}

export function PlaybackWaveform({ audioKey }: PlaybackWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Auto-load and render waveform on mount (no autoplay).
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!containerRef.current) {
        setLoading(false);
        return;
      }
      try {
        const blob = await audioRepository.load(audioKey);
        if (cancelled) return;
        if (!blob || !containerRef.current) {
          setLoading(false);
          return;
        }

        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;

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
            setLoading(false);
            setDuration(ws.getDuration());
          }
        });
        ws.on('audioprocess', () => {
          if (!cancelled) setCurrent(ws.getCurrentTime());
        });
        ws.on('seeking', () => {
          if (!cancelled) setCurrent(ws.getCurrentTime());
        });
        ws.on('play', () => {
          if (!cancelled) setPlaying(true);
        });
        ws.on('pause', () => {
          if (!cancelled) setPlaying(false);
        });
        ws.on('finish', () => {
          if (!cancelled) setPlaying(false);
        });

        ws.load(blobUrl).catch((e: Error) => {
          if (!cancelled) {
            setLoading(false);
            setError(e.message || 'Failed to load audio');
          }
        });
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          setError((e as Error).message || 'Failed to load audio');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      wsRef.current?.destroy();
      wsRef.current = null;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [audioKey]);

  function handlePlay() {
    wsRef.current?.playPause();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={handlePlay}
          disabled={loading || !ready}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : playing ? (
            <Pause size={14} strokeWidth={2} />
          ) : (
            <Play size={14} strokeWidth={2} />
          )}
          {loading ? 'Loading…' : playing ? 'Pause' : 'Play'}
        </button>
        <div
          ref={containerRef}
          className="min-h-[56px] flex-1 overflow-hidden rounded-md sm:min-h-20"
        />
        {ready && (
          <span
            className="font-mono text-xs tabular-nums"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            {formatDuration(current)} / {formatDuration(duration)}
          </span>
        )}
      </div>
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-negative)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
