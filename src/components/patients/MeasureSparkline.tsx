import type { MeasureTrend } from '@/utils/measureTrend';

/**
 * Inline trend line for one measure. Deliberately axis-less and label-less — it
 * sits beside the numbers that carry the actual values, so its only job is to
 * show the *shape* of the change at a glance.
 *
 * Scaled to the series' own min/max rather than the catalog range: a 4°
 * improvement in ankle dorsiflexion is invisible on a 0–30 axis but legible here.
 */
export function MeasureSparkline({
  trend,
  width = 96,
  height = 28,
}: {
  trend: MeasureTrend;
  width?: number;
  height?: number;
}) {
  const values = trend.series.map((s) => s.value);
  const stroke =
    trend.direction === true
      ? 'var(--color-pt-accent)'
      : trend.direction === false
        ? 'var(--color-pt-red)'
        : 'var(--color-pt-slate)';

  // A single reading has no shape to draw — render the one point so the row
  // still reads as "measured once" rather than "chart failed".
  if (values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
        <circle cx={width / 2} cy={height / 2} r={2.5} fill={stroke} />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const innerH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`${trend.label} trend across ${values.length} readings`}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}
