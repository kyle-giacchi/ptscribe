import { useEffect, useState } from 'react';
import { getLiveWhisperStats } from '@/lib/debug/liveWhisperStats';

/**
 * T1 live-preview health: how long each Whisper pass takes and how many chunks
 * the leaky bucket threw away because a pass was still running. A non-zero drop
 * rate is the signal that the device can't keep up with live transcription.
 *
 * Polls module-level counters rather than subscribing to React state — the
 * counters are written on a hot path and must not trigger renders there.
 */
export function LiveWhisperPanel() {
  const [stats, setStats] = useState(getLiveWhisperStats);

  useEffect(() => {
    const id = setInterval(() => setStats(getLiveWhisperStats()), 500);
    return () => clearInterval(id);
  }, []);

  const rowStyle = { fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-2)' } as const;
  const valStyle = {
    fontWeight: 600,
    color: 'var(--color-fg)',
    fontVariantNumeric: 'tabular-nums',
  } as const;

  if (stats.chunks === 0 && stats.dropped === 0) {
    return (
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-fg-subtle)' }}>
        Record with live preview on to see chunk timings.
      </div>
    );
  }

  return (
    <>
      <div style={rowStyle}>
        Median <span style={valStyle}>{Math.round(stats.medianMs)} ms</span> / chunk (last{' '}
        {Math.round(stats.lastMs)} ms)
      </div>
      <div style={rowStyle}>
        <span style={valStyle}>{stats.chunks}</span> transcribed,{' '}
        <span
          style={{
            ...valStyle,
            color: stats.dropped ? 'var(--color-pt-warn, #b7791f)' : 'var(--color-fg)',
          }}
        >
          {stats.dropped}
        </span>{' '}
        dropped ({Math.round(stats.dropRate * 100)}%)
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
        Mean chunk {Math.round(stats.meanBytes / 1024)} KB · crossOriginIsolated:{' '}
        {String(globalThis.crossOriginIsolated)}
      </div>
    </>
  );
}
