import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS, type PlanLimits, type PlanTier } from '@/types/plans';

export interface UsePlanReturn {
  tier: PlanTier;
  limits: PlanLimits;
  isWithinLimit: (resource: keyof PlanLimits, currentCount: number) => boolean;
}

export function usePlan(): UsePlanReturn {
  const { currentUser } = useAuth();
  const tier = currentUser.planTier;
  const limits = PLAN_LIMITS[tier];

  function isWithinLimit(resource: keyof PlanLimits, currentCount: number): boolean {
    const limit = limits[resource];
    return limit === -1 || currentCount < limit;
  }

  return { tier, limits, isWithinLimit };
}
