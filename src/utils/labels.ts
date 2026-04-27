import type { SessionType } from '@/types';

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
