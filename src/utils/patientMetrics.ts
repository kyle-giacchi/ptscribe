import { DAY_MS } from '@/utils/dates';
import type { Patient, Session, PlanOfCare, Sex } from '@/types';
import type { StatusTone } from '@/components/design';

export function labelForSex(s?: Sex): string {
  if (s === 'F') return 'F';
  if (s === 'M') return 'M';
  if (s === 'X') return 'X';
  return '';
}

export function derivePatientBadge(
  p: Patient,
  sessionCount: number
): { tone: StatusTone; label: string } {
  if (p.status === 'discharged') return { tone: 'done', label: 'Discharged' };
  if (p.status === 'on_hold') return { tone: 'plateau', label: 'On hold' };
  if (sessionCount === 0) return { tone: 'new', label: 'New' };
  return { tone: 'on-track', label: 'On-track' };
}

export function daysInCare(
  p: Patient,
  sessions: Session[],
  plan: PlanOfCare | undefined
): number {
  const start =
    plan?.startDate ??
    (sessions.length
      ? Math.min(...sessions.map((s) => s.date))
      : p.createdAt);
  return Math.max(0, Math.floor((Date.now() - start) / DAY_MS));
}

export function dischargePct(plan: PlanOfCare | undefined): number | null {
  if (!plan?.expectedDischargeDate) return null;
  const total = plan.expectedDischargeDate - plan.startDate;
  if (total <= 0) return 0;
  const elapsed = Date.now() - plan.startDate;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export function adherencePct(cells: number[]): number {
  if (cells.length === 0) return 0;
  const avg = cells.reduce((a, b) => a + b, 0) / cells.length;
  return Math.round(avg * 100);
}
