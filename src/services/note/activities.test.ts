import { describe, it, expect } from 'vitest';
import { seedHomeFromPlan, toPrescriptions, homeDiffersFromPlan } from './activities';
import type { ActivityEntry, Exercise, PlanOfCare } from '@/types';

function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Pendulums',
    region: 'shoulder',
    category: 'mobility',
    instructions: '',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function plan(over: Partial<PlanOfCare> = {}): PlanOfCare {
  return {
    id: 'pl1',
    patientId: 'p1',
    startDate: 0,
    goals: [],
    prescriptions: [],
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'a1',
    exerciseId: 'e1',
    dosage: '2x10',
    exerciseName: 'Pendulums',
    ...over,
  };
}

describe('seedHomeFromPlan', () => {
  it('returns [] when there is no active plan', () => {
    expect(seedHomeFromPlan(undefined, [exercise()])).toEqual([]);
  });

  it('resolves the exercise name for each prescription', () => {
    const p = plan({
      prescriptions: [{ id: 'rx1', exerciseId: 'e1', dosage: '3x10', notes: 'slow' }],
    });
    const result = seedHomeFromPlan(p, [exercise()]);
    expect(result).toEqual([
      { id: 'rx1', exerciseId: 'e1', dosage: '3x10', notes: 'slow', exerciseName: 'Pendulums' },
    ]);
  });

  it('drops prescriptions whose exercise no longer exists in the library', () => {
    const p = plan({
      prescriptions: [
        { id: 'rx1', exerciseId: 'e1', dosage: '3x10' },
        { id: 'rx2', exerciseId: 'deleted', dosage: '2x15' },
      ],
    });
    expect(seedHomeFromPlan(p, [exercise()])).toHaveLength(1);
  });
});

describe('toPrescriptions', () => {
  it('drops exerciseName and preserves the prescription fields', () => {
    const result = toPrescriptions([entry({ notes: 'careful' })]);
    expect(result).toEqual([{ id: 'a1', exerciseId: 'e1', dosage: '2x10', notes: 'careful' }]);
    expect(result[0]).not.toHaveProperty('exerciseName');
  });

  it('omits notes when absent rather than writing undefined', () => {
    expect(Object.keys(toPrescriptions([entry()])[0])).toEqual(['id', 'exerciseId', 'dosage']);
  });
});

describe('homeDiffersFromPlan', () => {
  it('treats an empty home list and an absent plan as equal', () => {
    expect(homeDiffersFromPlan([], undefined)).toBe(false);
  });

  it('reports a difference when home has entries and there is no plan', () => {
    expect(homeDiffersFromPlan([entry()], undefined)).toBe(true);
  });

  it('is order-independent', () => {
    const p = plan({
      prescriptions: [
        { id: 'rx1', exerciseId: 'e1', dosage: '2x10' },
        { id: 'rx2', exerciseId: 'e2', dosage: '3x10' },
      ],
    });
    const home = [
      entry({ id: 'zzz', exerciseId: 'e2', dosage: '3x10', exerciseName: 'B' }),
      entry({ id: 'aaa', exerciseId: 'e1', dosage: '2x10', exerciseName: 'A' }),
    ];
    expect(homeDiffersFromPlan(home, p)).toBe(false);
  });

  it('ignores entry id — a re-added exercise is not a clinical change', () => {
    const p = plan({ prescriptions: [{ id: 'rx1', exerciseId: 'e1', dosage: '2x10' }] });
    expect(homeDiffersFromPlan([entry({ id: 'totally-different' })], p)).toBe(false);
  });

  it('ignores exerciseName — it is a display snapshot, not a prescription field', () => {
    const p = plan({ prescriptions: [{ id: 'rx1', exerciseId: 'e1', dosage: '2x10' }] });
    expect(homeDiffersFromPlan([entry({ exerciseName: 'Renamed' })], p)).toBe(false);
  });

  it('detects a dosage change', () => {
    const p = plan({ prescriptions: [{ id: 'rx1', exerciseId: 'e1', dosage: '2x10' }] });
    expect(homeDiffersFromPlan([entry({ dosage: '4x20' })], p)).toBe(true);
  });

  it('treats absent notes and empty-string notes as equal', () => {
    const p = plan({ prescriptions: [{ id: 'rx1', exerciseId: 'e1', dosage: '2x10', notes: '' }] });
    expect(homeDiffersFromPlan([entry()], p)).toBe(false);
  });

  it('detects a removed exercise', () => {
    const p = plan({
      prescriptions: [
        { id: 'rx1', exerciseId: 'e1', dosage: '2x10' },
        { id: 'rx2', exerciseId: 'e2', dosage: '3x10' },
      ],
    });
    expect(homeDiffersFromPlan([entry()], p)).toBe(true);
  });
});
