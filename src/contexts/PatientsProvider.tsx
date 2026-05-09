import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { makeListMutators } from './listSlice';
import { audioRepository } from '@/services/AudioRepository';
import { UNASSIGNED_PATIENT_ID, type Patient } from '@/types';

export interface PatientsContextValue {
  patients: Patient[];
  addPatient: (patient: Patient) => void;
  updatePatient: (id: string, patch: Partial<Patient>) => void;
  removePatient: (id: string) => void;
  getPatient: (id: string) => Patient | undefined;
}

const PatientsContext = createContext<PatientsContextValue | null>(null);

export function PatientsProvider({ children }: { children: ReactNode }) {
  const { appData, updatePatientsSlice, updateSessionsSlice, updateNotesSlice, updatePlansSlice } =
    useAppData();
  const patients = appData.patients;

  const removePatient = useCallback(
    (id: string) => {
      if (id === UNASSIGNED_PATIENT_ID) return;
      const patientSessions = appData.sessions.filter((s) => s.patientId === id);
      const sessionIds = new Set(patientSessions.map((s) => s.id));

      // Crypto-shred: fire-and-forget deletion of encrypted audio blobs from IndexedDB.
      for (const session of patientSessions) {
        for (const clip of session.clips) {
          void audioRepository.remove(clip.id);
        }
      }

      updateNotesSlice((notes) => notes.filter((n) => !sessionIds.has(n.sessionId)));
      updatePlansSlice((plans) => plans.filter((p) => p.patientId !== id));
      updateSessionsSlice((sessions) => sessions.filter((s) => s.patientId !== id));
      updatePatientsSlice((p) => p.filter((patient) => patient.id !== id));
    },
    [
      appData.sessions,
      updatePatientsSlice,
      updateSessionsSlice,
      updateNotesSlice,
      updatePlansSlice,
    ],
  );

  const value = useMemo<PatientsContextValue>(() => {
    const m = makeListMutators(patients, updatePatientsSlice);
    return {
      patients,
      addPatient: m.add,
      // The "Unassigned" sentinel patient is read-only — UI should never edit it.
      updatePatient: (id, patch) => {
        if (id === UNASSIGNED_PATIENT_ID) return;
        m.update(id, patch);
      },
      removePatient,
      getPatient: m.get,
    };
  }, [patients, updatePatientsSlice, removePatient]);
  return <PatientsContext.Provider value={value}>{children}</PatientsContext.Provider>;
}

export function usePatients(): PatientsContextValue {
  const ctx = useContext(PatientsContext);
  if (!ctx) throw new Error('usePatients must be used within PatientsProvider');
  return ctx;
}
