import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { Clinician } from '@/types';

export interface ClinicianContextValue {
  clinician: Clinician;
  setClinician: (patch: Partial<Clinician>) => void;
}

const ClinicianContext = createContext<ClinicianContextValue | null>(null);

export function ClinicianProvider({ children }: { children: ReactNode }) {
  const { appData, updateClinicianSlice } = useAppData();
  const clinician = appData.clinician;
  const value = useMemo<ClinicianContextValue>(
    () => ({
      clinician,
      setClinician: (patch) => updateClinicianSlice({ ...clinician, ...patch }),
    }),
    [clinician, updateClinicianSlice],
  );
  return <ClinicianContext.Provider value={value}>{children}</ClinicianContext.Provider>;
}

export function useClinician(): ClinicianContextValue {
  const ctx = useContext(ClinicianContext);
  if (!ctx) throw new Error('useClinician must be used within ClinicianProvider');
  return ctx;
}
