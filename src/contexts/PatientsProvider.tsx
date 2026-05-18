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
  const { appData, updatePatientsSlice, bulkUpdate } = useAppData();
  const patients = appData.patients;

  const removePatient = useCallback(
    (id: string) => {
      if (id === UNASSIGNED_PATIENT_ID) return;
      const patientSessions = appData.sessions.filter((s) => s.patientId === id);
      const sessionIds = new Set(patientSessions.map((s) => s.id));

      // Crypto-shred: delete encrypted audio blobs from IndexedDB.
      // Use allSettled so a single IndexedDB failure doesn't block the record deletion below.
      const removePromises = patientSessions.flatMap((session) =>
        session.clips.map((clip) =>
          audioRepository.remove(clip.id).catch((err: unknown) => {
            if (import.meta.env.DEV) {
              console.warn(`[PatientsProvider] Failed to delete audio for clip ${clip.id}:`, err);
            }
          }),
        ),
      );
      void Promise.allSettled(removePromises);

      bulkUpdate({
        notes: appData.notes.filter((n) => !sessionIds.has(n.sessionId)),
        plans: appData.plans.filter((p) => p.patientId !== id),
        sessions: appData.sessions.filter((s) => s.patientId !== id),
        patients: appData.patients.filter((p) => p.id !== id),
      });
    },
    [appData, bulkUpdate],
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
