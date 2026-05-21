import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from './AppDataProvider';
import { PlansProvider, usePlans } from './PlansProvider';
import { newId } from '@/utils/ids';
import type { PlanOfCare } from '@/types';

type Api = ReturnType<typeof usePlans>;

function makePlan(overrides: Partial<PlanOfCare> = {}): PlanOfCare {
  const now = Date.now();
  return {
    id: newId(),
    patientId: newId(),
    startDate: now,
    goals: [],
    prescriptions: [],
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function Probe({ ref }: { ref: { current: Api | null } }) {
  const api = usePlans();
  useEffect(() => {
    ref.current = api;
  });
  return null;
}

async function renderAndWait() {
  const ref: { current: Api | null } = { current: null };
  render(
    <AppDataProvider>
      <PlansProvider>
        <Probe ref={ref} />
      </PlansProvider>
    </AppDataProvider>,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  return ref as { current: Api };
}

describe('PlansProvider', () => {
  it('initializes with an empty plans list', async () => {
    const ref = await renderAndWait();
    expect(ref.current.plans).toEqual([]);
  });

  it('addPlan: plan appears in the list', async () => {
    const ref = await renderAndWait();
    const plan = makePlan();
    await act(async () => ref.current.addPlan(plan));
    await waitFor(() => expect(ref.current.plans).toHaveLength(1));
    expect(ref.current.plans[0].id).toBe(plan.id);
  });

  it('updatePlan: patch persists', async () => {
    const ref = await renderAndWait();
    const plan = makePlan({ active: true });
    await act(async () => ref.current.addPlan(plan));
    await waitFor(() => expect(ref.current.plans).toHaveLength(1));
    await act(async () => ref.current.updatePlan(plan.id, { active: false }));
    await waitFor(() => expect(ref.current.plans[0].active).toBe(false));
  });

  it('removePlan: plan no longer in list', async () => {
    const ref = await renderAndWait();
    const plan = makePlan();
    await act(async () => ref.current.addPlan(plan));
    await waitFor(() => expect(ref.current.plans).toHaveLength(1));
    await act(async () => ref.current.removePlan(plan.id));
    await waitFor(() => expect(ref.current.plans).toHaveLength(0));
  });

  it('getPlan: returns plan by id', async () => {
    const ref = await renderAndWait();
    const plan = makePlan();
    await act(async () => ref.current.addPlan(plan));
    await waitFor(() => expect(ref.current.plans).toHaveLength(1));
    expect(ref.current.getPlan(plan.id)?.id).toBe(plan.id);
  });

  it('getPlan: returns undefined for unknown id', async () => {
    const ref = await renderAndWait();
    expect(ref.current.getPlan('unknown')).toBeUndefined();
  });

  it('activePlanForPatient: returns active plan for patient', async () => {
    const ref = await renderAndWait();
    const patientId = newId();
    const plan = makePlan({ patientId, active: true });
    await act(async () => ref.current.addPlan(plan));
    await waitFor(() => expect(ref.current.plans).toHaveLength(1));
    expect(ref.current.activePlanForPatient(patientId)?.id).toBe(plan.id);
  });

  it('activePlanForPatient: returns undefined when no active plan exists', async () => {
    const ref = await renderAndWait();
    expect(ref.current.activePlanForPatient(newId())).toBeUndefined();
  });

  it('activePlanForPatient: returns undefined for inactive plan', async () => {
    const ref = await renderAndWait();
    const patientId = newId();
    const plan = makePlan({ patientId, active: false });
    await act(async () => ref.current.addPlan(plan));
    await waitFor(() => expect(ref.current.plans).toHaveLength(1));
    expect(ref.current.activePlanForPatient(patientId)).toBeUndefined();
  });
});
