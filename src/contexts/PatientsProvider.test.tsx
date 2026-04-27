import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from './AppDataProvider';
import { PatientsProvider, usePatients } from './PatientsProvider';
import { newId } from '@/utils/ids';
import type { Patient } from '@/types';

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

function Probe({ ref }: { ref: { current: Api | null } }) {
  ref.current = usePatients();
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
  it('initializes with an empty patient list', async () => {
    const ref = await renderAndWait();
    expect(ref.current.patients).toEqual([]);
  });

  it('addPatient: new patient appears in the list', async () => {
    const ref = await renderAndWait();
    const patient = makePatient({ firstName: 'Jordan', lastName: 'Smith' });
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(ref.current.patients).toHaveLength(1));
    expect(ref.current.patients[0].firstName).toBe('Jordan');
    expect(ref.current.patients[0].lastName).toBe('Smith');
  });

  it('updatePatient: changed field persists', async () => {
    const ref = await renderAndWait();
    const patient = makePatient();
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(ref.current.patients).toHaveLength(1));
    await act(async () => ref.current.updatePatient(patient.id, { firstName: 'Updated' }));
    await waitFor(() => expect(ref.current.patients[0].firstName).toBe('Updated'));
  });

  it('removePatient: patient no longer in list', async () => {
    const ref = await renderAndWait();
    const patient = makePatient();
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(ref.current.patients).toHaveLength(1));
    await act(async () => ref.current.removePatient(patient.id));
    await waitFor(() => expect(ref.current.patients).toHaveLength(0));
  });

  it('getPatient: returns the patient by id', async () => {
    const ref = await renderAndWait();
    const patient = makePatient();
    await act(async () => ref.current.addPatient(patient));
    await waitFor(() => expect(ref.current.patients).toHaveLength(1));
    expect(ref.current.getPatient(patient.id)?.id).toBe(patient.id);
  });

  it('getPatient: returns undefined for unknown id', async () => {
    const ref = await renderAndWait();
    expect(ref.current.getPatient('does-not-exist')).toBeUndefined();
  });
});
