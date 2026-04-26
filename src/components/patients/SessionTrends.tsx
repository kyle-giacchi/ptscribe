import { useMemo } from 'react';
import { Group } from '@visx/group';
import { Bar, LinePath, Circle } from '@visx/shape';
import { scaleTime, scaleLinear, scaleBand } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { ParentSize } from '@visx/responsive';
import { curveMonotoneX } from '@visx/curve';
import type { Session } from '@/types';

interface SessionTrendsProps {
  sessions: Session[];
}

export function SessionTrends({ sessions }: SessionTrendsProps) {
  const sorted = useMemo(() => [...sessions].sort((a, b) => a.date - b.date), [sessions]);
  if (sorted.length < 2) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
        Trends appear after the second visit.
      </p>
    );
  }
  const totalMin = sorted.reduce((acc, s) => acc + (s.durationMin ?? 0), 0);
  const measured = sorted.filter((s) => s.durationMin).length;
  const avgMin = measured > 0 ? Math.round(totalMin / measured) : 0;
  const span = sorted[sorted.length - 1].date - sorted[0].date;
  const days = Math.max(1, Math.round(span / (1000 * 60 * 60 * 24)));
  const cadence = (sorted.length / (days / 7)).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Visits" value={String(sorted.length)} />
        <Stat label="Avg / week" value={cadence} />
        <Stat label="Avg duration" value={avgMin ? `${avgMin} min` : '—'} />
      </div>
      <div className="space-y-1.5">
        <ChartCaption>Session duration (min) by visit</ChartCaption>
        <div className="h-40">
          <ParentSize>
            {({ width, height }) => (
              <DurationLineChart sessions={sorted} width={width} height={height} />
            )}
          </ParentSize>
        </div>
      </div>
      <div className="space-y-1.5">
        <ChartCaption>Visits per week</ChartCaption>
        <div className="h-32">
          <ParentSize>
            {({ width, height }) => (
              <VisitsPerWeekChart sessions={sorted} width={width} height={height} />
            )}
          </ParentSize>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border px-2 py-1.5"
      style={{ borderColor: 'var(--color-border-soft)', background: 'var(--color-surface-2)' }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-fg-subtle)' }}>
        {label}
      </div>
      <div className="font-mono text-base tabular-nums" style={{ color: 'var(--color-fg)' }}>
        {value}
      </div>
    </div>
  );
}

function ChartCaption({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-fg-subtle)' }}>
      {children}
    </div>
  );
}

const MARGIN = { top: 8, right: 8, bottom: 22, left: 32 };

function DurationLineChart({
  sessions,
  width,
  height,
}: {
  sessions: Session[];
  width: number;
  height: number;
}) {
  if (width < 80 || height < 60) return null;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const points = sessions.map((s) => ({ x: new Date(s.date), y: s.durationMin ?? 0 }));
  const xScale = scaleTime({
    domain: [points[0].x, points[points.length - 1].x],
    range: [0, innerW],
  });
  const maxY = Math.max(60, ...points.map((p) => p.y));
  const yScale = scaleLinear({ domain: [0, maxY], range: [innerH, 0], nice: true });
  const stroke = 'var(--color-accent-deep)';

  return (
    <svg width={width} height={height}>
      <Group left={MARGIN.left} top={MARGIN.top}>
        <LinePath
          data={points}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          stroke={stroke}
          strokeWidth={2}
          curve={curveMonotoneX}
        />
        {points.map((p, i) => (
          <Circle
            key={`pt-${i}`}
            cx={xScale(p.x)}
            cy={yScale(p.y)}
            r={3}
            fill="var(--color-accent)"
            stroke={stroke}
            strokeWidth={1}
          />
        ))}
        <AxisLeft
          scale={yScale}
          numTicks={3}
          tickStroke="transparent"
          stroke="var(--color-border-soft)"
          tickLabelProps={() => ({
            fill: 'var(--color-fg-subtle)',
            fontSize: 10,
            textAnchor: 'end',
            dy: '0.33em',
            dx: -4,
          })}
        />
        <AxisBottom
          top={innerH}
          scale={xScale}
          numTicks={Math.min(5, points.length)}
          tickStroke="transparent"
          stroke="var(--color-border-soft)"
          tickFormat={(d) => formatShortDate(d as Date)}
          tickLabelProps={() => ({
            fill: 'var(--color-fg-subtle)',
            fontSize: 10,
            textAnchor: 'middle',
          })}
        />
      </Group>
    </svg>
  );
}

function VisitsPerWeekChart({
  sessions,
  width,
  height,
}: {
  sessions: Session[];
  width: number;
  height: number;
}) {
  if (width < 80 || height < 50) return null;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const buckets = bucketByWeek(sessions);
  const xScale = scaleBand<string>({
    domain: buckets.map((b) => b.label),
    range: [0, innerW],
    padding: 0.25,
  });
  const maxY = Math.max(1, ...buckets.map((b) => b.count));
  const yScale = scaleLinear({ domain: [0, maxY], range: [innerH, 0], nice: true });

  return (
    <svg width={width} height={height}>
      <Group left={MARGIN.left} top={MARGIN.top}>
        {buckets.map((b) => {
          const x = xScale(b.label) ?? 0;
          const barH = innerH - yScale(b.count);
          return (
            <Bar
              key={b.label}
              x={x}
              y={yScale(b.count)}
              width={xScale.bandwidth()}
              height={barH}
              fill="var(--color-accent)"
              rx={2}
            />
          );
        })}
        <AxisLeft
          scale={yScale}
          numTicks={Math.min(4, maxY)}
          tickStroke="transparent"
          stroke="var(--color-border-soft)"
          tickFormat={(v) => String(Math.round(Number(v)))}
          tickLabelProps={() => ({
            fill: 'var(--color-fg-subtle)',
            fontSize: 10,
            textAnchor: 'end',
            dy: '0.33em',
            dx: -4,
          })}
        />
        <AxisBottom
          top={innerH}
          scale={xScale}
          tickStroke="transparent"
          stroke="var(--color-border-soft)"
          tickLabelProps={() => ({
            fill: 'var(--color-fg-subtle)',
            fontSize: 9,
            textAnchor: 'middle',
          })}
        />
      </Group>
    </svg>
  );
}

interface WeekBucket {
  label: string;
  count: number;
}

function bucketByWeek(sessions: Session[]): WeekBucket[] {
  if (sessions.length === 0) return [];
  const start = startOfWeek(new Date(sessions[0].date));
  const end = startOfWeek(new Date(sessions[sessions.length - 1].date));
  const buckets = new Map<string, WeekBucket>();
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 7)) {
    const key = isoDate(cursor);
    buckets.set(key, { label: formatShortDate(new Date(cursor)), count: 0 });
  }
  for (const s of sessions) {
    const key = isoDate(startOfWeek(new Date(s.date)));
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
  }
  return Array.from(buckets.values());
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
