import { describe, it, expect } from 'vitest';
import { visitReadings } from './SessionMeasures';
import { buildTrends } from '@/utils/measureTrend';
import type { Measurement } from '@/types';

function reading(id: string, value: number, day: number, sessionId?: string): Measurement {
  const takenAt = Date.UTC(2026, 0, day);
  return {
    id,
    patientId: 'p1',
    sessionId,
    measureId: 'nprs',
    value,
    takenAt,
    createdAt: takenAt,
    updatedAt: takenAt,
  };
}

const trendOf = (rows: Measurement[]) => buildTrends(rows)[0];

describe('visitReadings', () => {
  it('pairs this visit’s reading with the one before it, not itself', () => {
    const trend = trendOf([reading('a', 7, 1), reading('b', 5, 8), reading('c', 3, 15, 's3')]);
    const { recorded, previous } = visitReadings(trend, 's3');
    expect(recorded?.id).toBe('c');
    expect(previous?.id).toBe('b');
  });

  it('reports the latest reading as previous when this visit has none yet', () => {
    const trend = trendOf([reading('a', 7, 1), reading('b', 5, 8)]);
    const { recorded, previous } = visitReadings(trend, 's3');
    expect(recorded).toBeUndefined();
    expect(previous?.id).toBe('b');
  });

  it('has no previous when this visit’s reading is the first one', () => {
    const trend = trendOf([reading('a', 7, 1, 's1')]);
    const { recorded, previous } = visitReadings(trend, 's1');
    expect(recorded?.id).toBe('a');
    expect(previous).toBeUndefined();
  });
});
