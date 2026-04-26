import type { ReactNode } from 'react';

export type StatTrend = 'good' | 'warn' | 'bad' | 'neutral';

const TREND_COLORS: Record<StatTrend, string> = {
  good: '#0a6d70',
  warn: '#7a4c04',
  bad: '#9b1d2e',
  neutral: '#5a6577',
};

export interface StatCardProps {
  eyebrow: string;
  value: ReactNode;
  trend?: ReactNode;
  trendKind?: StatTrend;
}

export function StatCard({ eyebrow, value, trend, trendKind = 'neutral' }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--color-pt-surface)',
        border: '1px solid var(--color-pt-border)',
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          color: 'var(--color-pt-text-3)',
        }}
      >
        {eyebrow}
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: '-0.4px',
          color: 'var(--color-pt-text)',
          marginTop: 4,
          fontFamily: 'var(--font-sans)',
        }}
      >
        {value}
      </div>
      {trend && (
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: TREND_COLORS[trendKind],
            marginTop: 4,
          }}
        >
          {trend}
        </div>
      )}
    </div>
  );
}
