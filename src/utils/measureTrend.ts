import { measureDef } from '@/lib/clinical/measures';
import type { Measurement, Side } from '@/types';

/** One measure+side, with its full history and the baseline→latest delta. */
export interface MeasureTrend {
  measureId: string;
  side?: Side;
  label: string;
  /** Ascending by `takenAt`. Always at least one entry. */
  series: Measurement[];
  baseline: Measurement;
  latest: Measurement;
  /** `latest.value - baseline.value`. Zero when only one reading exists. */
  change: number;
  /**
   * `true` when the change moved in the clinically good direction, `false` when
   * it moved the wrong way, `null` when there is no change or no second reading.
   * Direction comes from the catalog — a drop in NPRS is improvement, a drop in
   * knee flexion is not.
   */
  direction: boolean | null;
  /** Change met or exceeded the published MCID. False when the measure has none. */
  meetsMcid: boolean;
}

function keyOf(m: Measurement): string {
  return m.side ? `${m.measureId}::${m.side}` : m.measureId;
}

/**
 * Group a patient's measurements into per-measure (and per-side) trends,
 * newest-activity first.
 *
 * Left and right are separate trends on purpose: averaging an involved limb with
 * an uninvolved one hides exactly the asymmetry the measurement was taken to find.
 */
export function buildTrends(measurements: Measurement[]): MeasureTrend[] {
  const groups = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const key = keyOf(m);
    const existing = groups.get(key);
    if (existing) existing.push(m);
    else groups.set(key, [m]);
  }

  const trends: MeasureTrend[] = [];
  for (const series of groups.values()) {
    series.sort((a, b) => a.takenAt - b.takenAt);
    const baseline = series[0];
    const latest = series[series.length - 1];
    const def = measureDef(baseline.measureId);
    const change = latest.value - baseline.value;
    const sideLabel = baseline.side === 'left' ? ' (L)' : baseline.side === 'right' ? ' (R)' : '';

    trends.push({
      measureId: baseline.measureId,
      side: baseline.side,
      label: `${def.label}${sideLabel}`,
      series,
      baseline,
      latest,
      change,
      direction: change === 0 ? null : change > 0 === def.higherIsBetter,
      meetsMcid: def.mcid !== undefined && Math.abs(change) >= def.mcid,
    });
  }

  return trends.sort((a, b) => b.latest.takenAt - a.latest.takenAt);
}

/** Trim trailing zeros so 4.0 renders as "4" but 3.4 stays "3.4". */
export function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** Signed delta for display, e.g. `+15`, `−2.5`. Empty string when unchanged. */
export function formatChange(change: number): string {
  if (change === 0) return '';
  // U+2212 minus, not a hyphen — lines up with tabular figures.
  return change > 0 ? `+${formatValue(change)}` : `−${formatValue(Math.abs(change))}`;
}
