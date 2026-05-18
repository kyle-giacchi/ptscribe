import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Loader2, Pause, Play } from 'lucide-react';
import { audioRepository } from '@/services/AudioRepository';

interface PlaybackWaveformProps {
  /** Key into AudioRepository — usually a SessionClip.id (for legacy single-clip sessions, equals the sessionId). */
  audioKey: string;
}

export function PlaybackWaveform({ audioKey }: PlaybackWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Destroy WaveSurfer and revoke blob URL when the clip changes or on unmount.
  useEffect(() => {
    return () => {
      wsRef.current?.destroy();
      wsRef.current = null;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setReady(false);
      setPlaying(false);
      setDuration(0);
      setCurrent(0);
      setError(null);
    };
  }, [audioKey]);

  async function handlePlay() {
    // Already loaded — just toggle playback.
    if (wsRef.current) {
      wsRef.current.playPause();
      return;
    }
    if (!containerRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await audioRepository.load(audioKey);
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
        setReady(true);
        setLoading(false);
        setDuration(ws.getDuration());
        ws.play();
      });
      ws.on('audioprocess', () => setCurrent(ws.getCurrentTime()));
      ws.on('seeking', () => setCurrent(ws.getCurrentTime()));
      ws.on('play', () => setPlaying(true));
      ws.on('pause', () => setPlaying(false));
      ws.on('finish', () => setPlaying(false));

      await ws.load(blobUrl);
    } catch (e) {
      setLoading(false);
      setError((e as Error).message || 'Failed to load audio');
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={handlePlay}
          disabled={loading}
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
          className="min-h-[56px] sm:min-h-20 flex-1 overflow-hidden rounded-md"
        />
        {ready && (
          <span
            className="font-mono text-xs tabular-nums"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            {formatTime(current)} / {formatTime(duration)}
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
