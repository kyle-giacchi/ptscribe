import { StatusDot } from './StatusBadge';

export type MicState = 'connected' | 'paused' | 'weak' | 'disconnected' | 'idle';

const CFG: Record<
  MicState,
  { dot: string; label: string; pulse: boolean; bg: string; border: string; fg: string }
> = {
  connected: {
    dot: '#0ea5a8',
    label: 'Recording',
    pulse: true,
    bg: '#e6f7f6',
    border: '#9fdcdc',
    fg: '#0a6d70',
  },
  paused: {
    dot: '#7c8699',
    label: 'Paused',
    pulse: false,
    bg: '#eef0f4',
    border: '#dde2ea',
    fg: '#374055',
  },
  weak: {
    dot: '#c47a09',
    label: 'Weak signal',
    pulse: true,
    bg: '#fdf3df',
    border: '#f0d495',
    fg: '#7a4c04',
  },
  disconnected: {
    dot: '#dc2942',
    label: 'Disconnected',
    pulse: true,
    bg: '#fdecee',
    border: '#f5b8bf',
    fg: '#9b1d2e',
  },
  idle: {
    dot: '#a4adbd',
    label: 'Idle',
    pulse: false,
    bg: '#f1f3f7',
    border: '#e4e8ee',
    fg: '#5a6577',
  },
};

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export interface MicStatusPillProps {
  state: MicState;
  elapsedSec?: number;
  onClick?: () => void;
}

export function MicStatusPill({ state, elapsedSec, onClick }: MicStatusPillProps) {
  const cfg = CFG[state];
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center"
      style={{
        gap: 10,
        padding: '8px 14px 8px 12px',
        borderRadius: 999,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.fg,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.1px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <StatusDot color={cfg.dot} pulse={cfg.pulse} heartbeat={state === 'connected'} size={10} />
      <span>{cfg.label}</span>
      {elapsedSec !== undefined && (
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            opacity: 0.75,
            paddingLeft: 8,
            borderLeft: `1px solid ${cfg.border}`,
          }}
        >
          {formatElapsed(elapsedSec)}
        </span>
      )}
    </button>
  );
}
