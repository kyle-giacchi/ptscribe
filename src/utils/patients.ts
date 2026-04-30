import { DAY_MS } from '@/utils/dates';

export function ageFromDob(dob?: number): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - dob) / (365.25 * DAY_MS));
}
