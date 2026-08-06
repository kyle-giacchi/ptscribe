import { describe, it, expect } from 'vitest';
import { buildTrends, formatChange, formatValue } from './measureTrend';
import type { Measurement } from '@/types';

let seq = 0;
function m(patch: Partial<Measurement> & { measureId: string; value: number }): Measurement {
  seq += 1;
  return {
    id: `m${seq}`,
    patientId: 'p1',
    takenAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe('buildTrends', () => {
  it('orders each series oldest-first regardless of input order', () => {
    const [t] = buildTrends([
      m({ measureId: 'nprs', value: 3, takenAt: 300 }),
      m({ measureId: 'nprs', value: 7, takenAt: 100 }),
      m({ measureId: 'nprs', value: 5, takenAt: 200 }),
    ]);
    expect(t.series.map((s) => s.value)).toEqual([7, 5, 3]);
    expect(t.baseline.value).toBe(7);
    expect(t.latest.value).toBe(3);
  });

  it('reads a drop in pain as improvement (lower is better)', () => {
    const [t] = buildTrends([
      m({ measureId: 'nprs', value: 8, takenAt: 100 }),
      m({ measureId: 'nprs', value: 3, takenAt: 200 }),
    ]);
    expect(t.change).toBe(-5);
    expect(t.direction).toBe(true);
    expect(t.meetsMcid).toBe(true); // NPRS MCID is 2
  });

  it('reads a drop in range of motion as regression (higher is better)', () => {
    const [t] = buildTrends([
      m({ measureId: 'rom_knee_flexion', value: 120, side: 'right', takenAt: 100 }),
      m({ measureId: 'rom_knee_flexion', value: 95, side: 'right', takenAt: 200 }),
    ]);
    expect(t.change).toBe(-25);
    expect(t.direction).toBe(false);
  });

  it('keeps left and right as separate trends', () => {
    const trends = buildTrends([
      m({ measureId: 'grip_strength', value: 20, side: 'left', takenAt: 100 }),
      m({ measureId: 'grip_strength', value: 40, side: 'right', takenAt: 100 }),
    ]);
    expect(trends).toHaveLength(2);
    expect(trends.map((t) => t.label).sort()).toEqual(['Grip strength (L)', 'Grip strength (R)']);
  });

  it('reports no direction for a single reading', () => {
    const [t] = buildTrends([m({ measureId: 'lefs', value: 40, takenAt: 100 })]);
    expect(t.change).toBe(0);
    expect(t.direction).toBeNull();
    expect(t.meetsMcid).toBe(false);
  });

  it('withholds meetsMcid when the change is below threshold', () => {
    const [t] = buildTrends([
      m({ measureId: 'lefs', value: 40, takenAt: 100 }), // MCID 9
      m({ measureId: 'lefs', value: 45, takenAt: 200 }),
    ]);
    expect(t.direction).toBe(true);
    expect(t.meetsMcid).toBe(false);
  });

  it('falls back to the raw id for a measure missing from the catalog', () => {
    const [t] = buildTrends([m({ measureId: 'retired_scale', value: 1, takenAt: 100 })]);
    expect(t.label).toBe('retired_scale');
  });

  it('sorts trends by most recent reading', () => {
    const trends = buildTrends([
      m({ measureId: 'nprs', value: 4, takenAt: 100 }),
      m({ measureId: 'lefs', value: 50, takenAt: 900 }),
    ]);
    expect(trends[0].measureId).toBe('lefs');
  });

  it('returns nothing for no measurements', () => {
    expect(buildTrends([])).toEqual([]);
  });
});

describe('formatValue / formatChange', () => {
  it('drops trailing zeros but keeps real decimals', () => {
    expect(formatValue(4)).toBe('4');
    expect(formatValue(3.4)).toBe('3.4');
    expect(formatValue(4.0)).toBe('4');
  });

  it('signs changes and blanks out zero', () => {
    expect(formatChange(15)).toBe('+15');
    expect(formatChange(-2.5)).toBe('−2.5');
    expect(formatChange(0)).toBe('');
  });
});
