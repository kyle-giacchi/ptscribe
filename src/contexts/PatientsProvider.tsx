import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { makeListMutators } from './listSlice';
import type { Patient } from '@/types';

export interface PatientsContextValue {
  patients: Patient[];
  addPatient: (patient: Patient) => void;
  updatePatient: (id: string, patch: Partial<Patient>) => void;
  removePatient: (id: string) => void;
  getPatient: (id: string) => Patient | undefined;
}

const PatientsContext = createContext<PatientsContextValue | null>(null);

export function PatientsProvider({ children }: { children: ReactNode }) {
  const { appData, updatePatientsSlice } = useAppData();
  const patients = appData.patients;
  const value = useMemo<PatientsContextValue>(() => {
    const m = makeListMutators(patients, updatePatientsSlice);
    return {
      patients,
      addPatient: m.add,
      updatePatient: m.update,
      removePatient: m.remove,
      getPatient: m.get,
    };
  }, [patients, updatePatientsSlice]);
  return <PatientsContext.Provider value={value}>{children}</PatientsContext.Provider>;
}

export function usePatients(): PatientsContextValue {
  const ctx = useContext(PatientsContext);
  if (!ctx) throw new Error('usePatients must be used within PatientsProvider');
  return ctx;
}
