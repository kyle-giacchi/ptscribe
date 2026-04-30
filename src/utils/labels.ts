import type { SessionType } from '@/types';

export function shortLabelForType(t: SessionType | string): string {
  switch (t) {
    case 'evaluation':
      return 'Initial Eval';
    case 'follow_up':
      return 'Follow-up';
    case 'progress':
      return 'Progress';
    case 'discharge':
      return 'Discharge';
    default:
      return String(t);
  }
}

export function labelForType(t: SessionType | string): string {
  switch (t) {
    case 'evaluation':
      return 'Initial Evaluation';
    case 'progress':
      return 'Progress note';
    case 'discharge':
      return 'Discharge';
    default:
      return 'Follow-up';
  }
}
