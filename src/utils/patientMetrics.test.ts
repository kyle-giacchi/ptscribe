import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  labelForSex,
  derivePatientBadge,
  daysInCare,
  dischargePct,
  adherencePct,
} from './patientMetrics';
import type { Patient, Session, PlanOfCare } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Fixed "now" for deterministic date math
const NOW = new Date('2026-06-26T00:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    firstName: 'Jane',
    lastName: 'Doe',
    status: 'active',
    createdAt: NOW - 10 * DAY_MS,
    updatedAt: NOW,
    ...overrides,
  };
}

function session(date: number): Session {
  return {
    id: 's1',
    patientId: 'p1',
    type: 'follow_up',
    date,
    status: 'draft',
    clips: [],
    createdAt: date,
    updatedAt: date,
  };
}

function plan(overrides: Partial<PlanOfCare> = {}): PlanOfCare {
  return {
    id: 'pl1',
    patientId: 'p1',
    startDate: NOW - 30 * DAY_MS,
    goals: [],
    prescriptions: [],
    active: true,
    createdAt: NOW - 30 * DAY_MS,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('labelForSex', () => {
  it('returns F, M, X for known values', () => {
    expect(labelForSex('F')).toBe('F');
    expect(labelForSex('M')).toBe('M');
    expect(labelForSex('X')).toBe('X');
  });

  it('returns empty string for undefined', () => {
    expect(labelForSex(undefined)).toBe('');
  });
});

describe('derivePatientBadge', () => {
  it('returns done/Discharged for discharged patients', () => {
    expect(derivePatientBadge(patient({ status: 'discharged' }), 5)).toEqual({
      tone: 'done',
      label: 'Discharged',
    });
  });

  it('returns plateau/On hold for on_hold patients', () => {
    expect(derivePatientBadge(patient({ status: 'on_hold' }), 5)).toEqual({
      tone: 'plateau',
      label: 'On hold',
    });
  });

  it('returns new/New when session count is 0', () => {
    expect(derivePatientBadge(patient({ status: 'active' }), 0)).toEqual({
      tone: 'new',
      label: 'New',
    });
  });

  it('returns on-track/On-track when active with sessions', () => {
    expect(derivePatientBadge(patient({ status: 'active' }), 3)).toEqual({
      tone: 'on-track',
      label: 'On-track',
    });
  });
});

describe('daysInCare', () => {
  it('uses plan startDate when plan is provided', () => {
    const p = patient();
    const days = daysInCare(p, [], plan({ startDate: NOW - 10 * DAY_MS }));
    expect(days).toBe(10);
  });

  it('falls back to earliest session date when no plan', () => {
    const p = patient();
    const sessions = [session(NOW - 7 * DAY_MS), session(NOW - 14 * DAY_MS)];
    expect(daysInCare(p, sessions, undefined)).toBe(14);
  });

  it('falls back to patient createdAt when no plan and no sessions', () => {
    const p = patient({ createdAt: NOW - 5 * DAY_MS });
    expect(daysInCare(p, [], undefined)).toBe(5);
  });

  it('returns 0 when start is in the future', () => {
    const p = patient();
    expect(daysInCare(p, [], plan({ startDate: NOW + DAY_MS }))).toBe(0);
  });
});

describe('dischargePct', () => {
  it('returns null when no plan', () => {
    expect(dischargePct(undefined)).toBeNull();
  });

  it('returns null when plan has no expectedDischargeDate', () => {
    expect(dischargePct(plan({ expectedDischargeDate: undefined }))).toBeNull();
  });

  it('calculates percentage of elapsed time toward discharge', () => {
    // start 30 days ago, discharge 30 days from now → 50% elapsed
    const p = plan({ startDate: NOW - 30 * DAY_MS, expectedDischargeDate: NOW + 30 * DAY_MS });
    expect(dischargePct(p)).toBe(50);
  });

  it('clamps to 100 when past discharge date', () => {
    const p = plan({ startDate: NOW - 60 * DAY_MS, expectedDischargeDate: NOW - 10 * DAY_MS });
    expect(dischargePct(p)).toBe(100);
  });

  it('clamps to 0 when start equals discharge', () => {
    const p = plan({ startDate: NOW, expectedDischargeDate: NOW });
    expect(dischargePct(p)).toBe(0);
  });
});

describe('adherencePct', () => {
  it('returns 0 for empty cells', () => {
    expect(adherencePct([])).toBe(0);
  });

  it('returns 100 for all-1 cells', () => {
    expect(adherencePct([1, 1, 1])).toBe(100);
  });

  it('returns 0 for all-0 cells', () => {
    expect(adherencePct([0, 0, 0])).toBe(0);
  });

  it('rounds to the nearest integer', () => {
    // avg of [1, 0, 1] = 0.666... → 67%
    expect(adherencePct([1, 0, 1])).toBe(67);
  });

  it('handles partial adherence', () => {
    expect(adherencePct([0.5, 0.5])).toBe(50);
  });
});
