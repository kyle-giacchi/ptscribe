import type { PlanTier } from '@/types/plans';

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  planTier: PlanTier;
  tenantId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: number;
}
