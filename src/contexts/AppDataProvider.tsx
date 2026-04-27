import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppData,
  Clinician,
  Patient,
  Session,
  Note,
  NoteTemplate,
  Exercise,
  PlanOfCare,
  Settings,
} from '@/types';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';

const SAVE_DEBOUNCE_MS = 300;

type SliceUpdater<T> = T | ((prev: T) => T);

export interface AppDataContextValue {
  appData: AppData;
  updateClinicianSlice: (next: SliceUpdater<Clinician>) => void;
  updatePatientsSlice: (next: SliceUpdater<Patient[]>) => void;
  updateSessionsSlice: (next: SliceUpdater<Session[]>) => void;
  updateNotesSlice: (next: SliceUpdater<Note[]>) => void;
  updateTemplatesSlice: (next: SliceUpdater<NoteTemplate[]>) => void;
  updateExercisesSlice: (next: SliceUpdater<Exercise[]>) => void;
  updatePlansSlice: (next: SliceUpdater<PlanOfCare[]>) => void;
  updateSettingsSlice: (next: SliceUpdater<Settings>) => void;
  bulkUpdate: (patch: Partial<Omit<AppData, 'version' | 'lastModified'>>) => void;
  resetAll: () => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [appData, setAppData] = useState<AppData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await dataRepository.load();
      if (cancelled) return;
      setAppData(loaded ?? defaultAppData());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleSave = useCallback((next: AppData) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dataRepository.save(next).catch((err) => {
        console.error('AppData save failed', err);
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const merge = useCallback(
    <K extends keyof AppData>(key: K, value: SliceUpdater<AppData[K]>) => {
      setAppData((prev) => {
        if (!prev) return prev;
        const resolved =
          typeof value === 'function' ? (value as (p: AppData[K]) => AppData[K])(prev[key]) : value;
        if (Object.is(resolved, prev[key])) return prev;
        const next = { ...prev, [key]: resolved, lastModified: Date.now() };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const bulkUpdate = useCallback(
    (patch: Partial<Omit<AppData, 'version' | 'lastModified'>>) => {
      setAppData((prev) => {
        if (!prev) return prev;
        const filtered: Partial<AppData> = {};
        let changed = false;
        for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
          const value = patch[key];
          if (value === undefined) continue;
          if (Object.is(value, prev[key])) continue;
          Object.assign(filtered, { [key]: value });
          changed = true;
        }
        if (!changed) return prev;
        const next: AppData = { ...prev, ...filtered, lastModified: Date.now() };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo<AppDataContextValue | null>(() => {
    if (!appData) return null;
    return {
      appData,
      updateClinicianSlice: (next) => merge('clinician', next),
      updatePatientsSlice: (next) => merge('patients', next),
      updateSessionsSlice: (next) => merge('sessions', next),
      updateNotesSlice: (next) => merge('notes', next),
      updateTemplatesSlice: (next) => merge('templates', next),
      updateExercisesSlice: (next) => merge('exercises', next),
      updatePlansSlice: (next) => merge('plans', next),
      updateSettingsSlice: (next) => merge('settings', next),
      bulkUpdate,
      resetAll: () => {
        const fresh = defaultAppData();
        setAppData(fresh);
        dataRepository.clear();
      },
    };
  }, [appData, merge, bulkUpdate]);

  if (!value) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-pt-bg, #fafafa)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-pt-text-2, #666)',
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
