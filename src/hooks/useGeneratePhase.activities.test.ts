import { describe, it, expect } from 'vitest';
import { EMPTY_ACTIVITIES, seedHomeFromPlan } from '@/services/note/activities';
import type { Exercise, NoteActivities, PlanOfCare } from '@/types';

/**
 * `activitiesChange` is a thin ensureNote + updateNote wrapper; the interesting
 * logic is the display-value resolution the Session page performs. These tests
 * pin that resolution rule so a refactor cannot silently start auto-persisting
 * the plan seed.
 */
function resolveDisplayActivities(
  noteActivities: NoteActivities | undefined,
  plan: PlanOfCare | undefined,
  exercises: Exercise[],
): { activities: NoteActivities; seededFromPlan: boolean } {
  if (noteActivities) return { activities: noteActivities, seededFromPlan: false };
  const home = seedHomeFromPlan(plan, exercises);
  return {
    activities: { performed: [], home },
    seededFromPlan: home.length > 0,
  };
}

const EXERCISES: Exercise[] = [
  {
    id: 'e1',
    name: 'Pendulums',
    region: 'shoulder',
    category: 'mobility',
    instructions: '',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
];

const PLAN: PlanOfCare = {
  id: 'pl1',
  patientId: 'p1',
  startDate: 0,
  goals: [],
  prescriptions: [{ id: 'rx1', exerciseId: 'e1', dosage: '3x10' }],
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('activities display resolution', () => {
  it('seeds home from the plan when the note has no activities', () => {
    const { activities, seededFromPlan } = resolveDisplayActivities(undefined, PLAN, EXERCISES);
    expect(activities.home).toHaveLength(1);
    expect(activities.performed).toEqual([]);
    expect(seededFromPlan).toBe(true);
  });

  it('prefers the note value once activities exist, even if empty', () => {
    const stored: NoteActivities = { performed: [], home: [] };
    const { activities, seededFromPlan } = resolveDisplayActivities(stored, PLAN, EXERCISES);
    expect(activities).toBe(stored);
    expect(seededFromPlan).toBe(false);
  });

  it('falls back to empty with no plan and no note value', () => {
    const { activities, seededFromPlan } = resolveDisplayActivities(undefined, undefined, []);
    expect(activities).toEqual(EMPTY_ACTIVITIES);
    expect(seededFromPlan).toBe(false);
  });
});
