import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { makeListMutators } from './listSlice';
import type { PlanOfCare } from '@/types';

export interface PlansContextValue {
  plans: PlanOfCare[];
  addPlan: (plan: PlanOfCare) => void;
  updatePlan: (id: string, patch: Partial<PlanOfCare>) => void;
  removePlan: (id: string) => void;
  getPlan: (id: string) => PlanOfCare | undefined;
  activePlanForPatient: (patientId: string) => PlanOfCare | undefined;
}

const PlansContext = createContext<PlansContextValue | null>(null);

export function PlansProvider({ children }: { children: ReactNode }) {
  const { appData, updatePlansSlice } = useAppData();
  const plans = appData.plans;
  const value = useMemo<PlansContextValue>(() => {
    const m = makeListMutators(plans, updatePlansSlice);
    return {
      plans,
      addPlan: m.add,
      updatePlan: m.update,
      removePlan: m.remove,
      getPlan: m.get,
      activePlanForPatient: (patientId) =>
        plans.find((p) => p.patientId === patientId && p.active),
    };
  }, [plans, updatePlansSlice]);
  return <PlansContext.Provider value={value}>{children}</PlansContext.Provider>;
}

export function usePlans(): PlansContextValue {
  const ctx = useContext(PlansContext);
  if (!ctx) throw new Error('usePlans must be used within PlansProvider');
  return ctx;
}
