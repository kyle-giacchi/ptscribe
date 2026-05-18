import { memo } from 'react';

export type StatusTone =
  | 'on-track'
  | 'plateau'
  | 'flagged'
  | 'new'
  | 'done'
  | 'live'
  | 'next'
  | 'upcoming';

const TONES: Record<
  StatusTone,
  { bg: string; border: string; dot: string; fg: string; defaultLabel: string; pulse?: boolean }
> = {
  'on-track': {
    bg: '#e6f7f6',
    border: '#9fdcdc',
    dot: '#0ea5a8',
    fg: '#0a6d70',
    defaultLabel: 'On track',
  },
  plateau: {
    bg: '#fdf3df',
    border: '#f0d495',
    dot: '#c47a09',
    fg: '#7a4c04',
    defaultLabel: 'Plateau',
  },
  flagged: {
    bg: '#fdecee',
    border: '#f5b8bf',
    dot: '#dc2942',
    fg: '#9b1d2e',
    defaultLabel: 'Flagged',
  },
  new: {
    bg: '#eeebfa',
    border: '#cfc6ee',
    dot: '#6f5acc',
    fg: '#4a3aa3',
    defaultLabel: 'New',
  },
  done: {
    bg: 'transparent',
    border: 'transparent',
    dot: '#a4adbd',
    fg: '#5a6577',
    defaultLabel: 'Signed',
  },
  live: {
    bg: '#e6f7f6',
    border: '#9fdcdc',
    dot: '#0ea5a8',
    fg: '#0a6d70',
    defaultLabel: 'Recording',
    pulse: true,
  },
  next: {
    bg: '#fdf3df',
    border: '#f0d495',
    dot: '#c47a09',
    fg: '#7a4c04',
    defaultLabel: 'Next up',
  },
  upcoming: {
    bg: 'transparent',
    border: 'transparent',
    dot: '#a4adbd',
    fg: '#5a6577',
    defaultLabel: 'Upcoming',
  },
};

export interface StatusBadgeProps {
  tone: StatusTone;
  label?: string;
}

export const StatusBadge = memo(function StatusBadge({ tone, label }: StatusBadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        background: t.bg,
        border: `1px solid ${t.border === 'transparent' ? 'transparent' : t.border}`,
        color: t.fg,
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      <StatusDot color={t.dot} pulse={t.pulse} size={8} />
      <span>{label ?? t.defaultLabel}</span>
    </span>
  );
});

export const StatusDot = memo(function StatusDot({
  color,
  pulse,
  heartbeat,
  size = 8,
}: {
  color: string;
  pulse?: boolean;
  heartbeat?: boolean;
  size?: number;
}) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <span
        className="absolute inset-0"
        style={{
          borderRadius: '50%',
          background: color,
          animation: heartbeat ? 'pts-heartbeat 1.4s ease-in-out infinite' : undefined,
          transformOrigin: 'center',
        }}
      />
      {pulse && (
        <span
          className="absolute"
          style={{
            inset: -3,
            borderRadius: '50%',
            border: `1px solid ${color}`,
            animation: 'pts-pulse 1.6s ease-out infinite',
          }}
        />
      )}
    </span>
  );
});
