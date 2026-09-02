import { DAY_MS } from '@/utils/dates';
import type { Patient } from '@/types';

export function ageFromDob(dob?: number): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - dob) / (365.25 * DAY_MS));
}

/**
 * Display name for list/worklist screens — "Marcus L." rather than the full
 * legal name. List views (dashboard, review queue, schedule) are the ones most
 * likely to be left open on an unattended or shared workstation, and a first
 * name plus last initial is enough to pick the right row out of one clinician's
 * caseload. Callers pair this with a `title` attribute holding the full name so
 * confirming identity stays one hover away.
 *
 * Chart screens (PatientDetail, SessionTopBar) deliberately keep the full name —
 * wrong-chart safety outweighs shoulder-surfing there.
 */
export function shortName(p: Pick<Patient, 'firstName' | 'lastName'> | undefined): string {
  if (!p) return 'Unknown patient';
  const first = p.firstName?.trim() ?? '';
  const initial = p.lastName?.trim().charAt(0);
  if (!first) return initial ? `${initial}.` : 'Unnamed patient';
  return initial ? `${first} ${initial}.` : first;
}
