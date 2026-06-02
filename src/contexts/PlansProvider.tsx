import { createListSliceContext } from './createListSliceContext';
import type { PlanOfCare } from '@/types';

export interface PlansContextValue {
  plans: PlanOfCare[];
  addPlan: (plan: PlanOfCare) => void;
  updatePlan: (id: string, patch: Partial<PlanOfCare>) => void;
  removePlan: (id: string) => void;
  getPlan: (id: string) => PlanOfCare | undefined;
  activePlanForPatient: (patientId: string) => PlanOfCare | undefined;
}

const { Provider, useSlice } = createListSliceContext<PlanOfCare, PlansContextValue>({
  label: 'Plans',
  select: (appData) => appData.plans,
  selectUpdater: (app) => app.updatePlansSlice,
  build: (m, plans) => ({
    plans,
    addPlan: m.add,
    updatePlan: m.update,
    removePlan: m.remove,
    getPlan: m.get,
    activePlanForPatient: (patientId) => plans.find((p) => p.patientId === patientId && p.active),
  }),
});

export const PlansProvider = Provider;
export const usePlans = useSlice;
