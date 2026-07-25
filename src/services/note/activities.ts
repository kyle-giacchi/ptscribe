import type { ActivityEntry, Exercise, NoteActivities, PlanOfCare, Prescription } from '@/types';

/**
 * Per-visit activity log helpers (see the Patient Activities spec).
 *
 * Activities are a documentation artifact: they are never sent to the AI and are
 * deliberately absent from note staleness (`./staleness.ts`), so logging an
 * exercise can never mark a note stale or gate Regenerate.
 *
 * `ActivityEntry` extends `Prescription`, so syncing the home program to the
 * patient's Plan of Care is a field-for-field map rather than a translation layer.
 */

export const EMPTY_ACTIVITIES: NoteActivities = { performed: [], home: [] };

/**
 * Build the initial home-program list from the patient's active Plan of Care.
 * Prescriptions whose exercise has been deleted from the library are dropped —
 * they cannot be given an `exerciseName` snapshot and would render as unknown.
 *
 * The result is a computed default only. It is never auto-persisted: writing it
 * on mount would create a phantom Note for every session whose Review tab was
 * merely opened.
 */
export function seedHomeFromPlan(
  plan: PlanOfCare | undefined,
  exercises: Exercise[],
): ActivityEntry[] {
  if (!plan) return [];
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return plan.prescriptions.flatMap((rx) => {
    const ex = byId.get(rx.exerciseId);
    if (!ex) return [];
    return [{ ...rx, exerciseName: ex.name }];
  });
}

/** Strip the display-only `exerciseName` so entries can be stored as prescriptions. */
export function toPrescriptions(home: ActivityEntry[]): Prescription[] {
  return home.map(({ id, exerciseId, dosage, notes }) => ({
    id,
    exerciseId,
    dosage,
    ...(notes === undefined ? {} : { notes }),
  }));
}

/**
 * Canonical, order-independent key for one prescription. Compares on the fields
 * that are clinically meaningful only: entry `id` is excluded (a re-added exercise
 * gets a fresh id but is not a change) and `exerciseName` is excluded (display
 * snapshot). Absent and empty-string notes compare equal.
 */
function rxKey(rx: Pick<Prescription, 'exerciseId' | 'dosage' | 'notes'>): string {
  return JSON.stringify([rx.exerciseId, rx.dosage, rx.notes ?? '']);
}

function canonical(list: Pick<Prescription, 'exerciseId' | 'dosage' | 'notes'>[]): string {
  return JSON.stringify(list.map(rxKey).sort());
}

/**
 * True when the session's home program has diverged from the patient's active
 * Plan of Care. Drives both the "Update plan of care" button's enabled state and
 * the plan-sync gate on finalize. An absent plan with an empty home list is not a
 * difference — there is nothing to sync.
 */
export function homeDiffersFromPlan(home: ActivityEntry[], plan: PlanOfCare | undefined): boolean {
  return canonical(home) !== canonical(plan?.prescriptions ?? []);
}
