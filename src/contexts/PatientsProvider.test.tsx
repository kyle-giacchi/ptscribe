import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from './AppDataProvider';
import { PatientsProvider, usePatients } from './PatientsProvider';
import { newId } from '@/utils/ids';
import { UNASSIGNED_PATIENT_ID, type Patient } from '@/types';

type Api = ReturnType<typeof usePatients>;

function makePatient(overrides: Partial<Patient> = {}): Patient {
  const now = Date.now();
  return {
    id: newId(),
    firstName: 'Test',
    lastName: 'Patient',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function realPatients(api: Api): Patient[] {
  return api.patients.filter((p) => p.id !== UNASSIGNED_PATIENT_ID);
}

function Probe({ ref }: { ref: { current: Api | null } }) {
  const api = usePatients();
  useEffect(() => {
    ref.current = api;
  });
  return null;
}

async function renderAndWait() {
  const ref: { current: Api | null } = { current: null };
  render(
    <AppDataProvider>
      <PatientsProvider>
        <Probe ref={ref} />
      </PatientsProvider>
    </AppDataProvider>,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  return ref as { current: Api };
}

describe('PatientsProvider', () => {
  it('initializes with only the sentinel Unassigned patient', async () => {
    const ref = await renderAndWait();
    expect(realPatients(ref.current)).toEqual([]);
    expect(ref.current.getPatient(UNASSIGNED_PATIENT_ID)?.firstName).toBe('Unassigned');
  });

  it('addPatient: new patient appears in the list', async () => {
    const ref = await renderAndWait();
    const patient = makePatient({ firstName: 'Jordan', lastName: 'Smith' });
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(realPatients(ref.current)).toHaveLength(1));
    const [added] = realPatients(ref.current);
    expect(added.firstName).toBe('Jordan');
    expect(added.lastName).toBe('Smith');
  });

  it('updatePatient: changed field persists', async () => {
    const ref = await renderAndWait();
    const patient = makePatient();
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(realPatients(ref.current)).toHaveLength(1));
    await act(async () => ref.current.updatePatient(patient.id, { firstName: 'Updated' }));
    await waitFor(() => expect(ref.current.getPatient(patient.id)?.firstName).toBe('Updated'));
  });

  it('removePatient: patient no longer in list', async () => {
    const ref = await renderAndWait();
    const patient = makePatient();
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(realPatients(ref.current)).toHaveLength(1));
    await act(async () => ref.current.removePatient(patient.id));
    await waitFor(() => expect(realPatients(ref.current)).toHaveLength(0));
  });

  it('getPatient: returns the patient by id', async () => {
    const ref = await renderAndWait();
    const patient = makePatient();
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(realPatients(ref.current)).toHaveLength(1));
    expect(ref.current.getPatient(patient.id)?.id).toBe(patient.id);
  });

  it('getPatient: returns undefined for unknown id', async () => {
    const ref = await renderAndWait();
    expect(ref.current.getPatient('does-not-exist')).toBeUndefined();
  });

  it('updatePatient: no-op for the sentinel Unassigned patient', async () => {
    const ref = await renderAndWait();
    await act(async () =>
      ref.current.updatePatient(UNASSIGNED_PATIENT_ID, { firstName: 'Hacked' }),
    );
    expect(ref.current.getPatient(UNASSIGNED_PATIENT_ID)?.firstName).toBe('Unassigned');
  });

  it('removePatient: no-op for the sentinel Unassigned patient', async () => {
    const ref = await renderAndWait();
    await act(async () => ref.current.removePatient(UNASSIGNED_PATIENT_ID));
    expect(ref.current.getPatient(UNASSIGNED_PATIENT_ID)).toBeDefined();
  });
});
