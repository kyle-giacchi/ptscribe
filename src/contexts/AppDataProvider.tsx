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
import { toast } from 'sonner';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';
import { audioRepository } from '@/services/AudioRepository';
import { vault } from '@/lib/vault/vault';
import { AuthContext } from '@/contexts/AuthContext';
import { isDemoMode } from '@/lib/demoMode';

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
  const [corruptWarning, setCorruptWarning] = useState(false);
  const [twoTabWarning, setTwoTabWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthenticated = useContext(AuthContext)?.isAuthenticated ?? false;

  useEffect(() => {
    if (!isDemoMode() && isAuthenticated && navigator.storage?.persist) {
      void navigator.storage.persist();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await dataRepository.load();
      if (cancelled) return;
      const data = loaded ?? defaultAppData();
      setAppData(data);
      if (dataRepository.hasCorruptData()) setCorruptWarning(true);
      if (vault.isTwoTabConflict()) setTwoTabWarning(true);

      // Purge audio blobs beyond the retention window (fire-and-forget).
      const days = data.settings.retention.autoDeleteAudioAfterDays;
      if (days) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        for (const session of data.sessions) {
          for (const clip of session.clips) {
            if (clip.createdAt < cutoff) void audioRepository.remove(clip.id);
          }
        }
      }

      // Purge orphaned recording chunks — chunks whose clipId no longer
      // exists in any session (tab crash mid-recording or reset-without-stop).
      const activeClipIds = new Set(data.sessions.flatMap((s) => s.clips.map((c) => c.id)));
      void audioRepository
        .listChunkSessionIds()
        .then((chunkIds) => {
          for (const id of chunkIds) {
            if (!activeClipIds.has(id)) {
              void audioRepository.clearChunks(id).catch((err: unknown) => {
                console.warn(`[AppDataProvider] Failed to clear orphaned chunks for clip ${id}:`, err);
              });
            }
          }
        })
        .catch((err: unknown) => {
          console.warn('[AppDataProvider] Failed to list chunk session IDs for orphan purge:', err);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return vault.onConflictChange((conflicted) => {
      setTwoTabWarning(conflicted);
    });
  }, []);

  const scheduleSave = useCallback((next: AppData) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dataRepository.save(next).catch((err: unknown) => {
        console.error('AppData save failed', err);
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('QuotaExceeded') || msg.includes('quota') || msg.includes('storage')) {
          toast.error(
            'Storage quota exceeded — your data could not be saved. Free up space or export a backup.',
          );
        } else if (msg.includes('vault') && msg.includes('another tab')) {
          toast.error(
            'Vault is open in another tab — save blocked. Close the other tab or lock the vault there.',
          );
        } else {
          toast.error('Failed to save data. Check the console for details.');
        }
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
        scheduleSave(fresh);
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

  return (
    <AppDataContext.Provider value={value}>
      {twoTabWarning && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: corruptWarning ? 44 : 0, // 44 ≈ single-line corrupt banner height (10px padding × 2 + 13px font + border)
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#78350f',
            color: '#fffbeb',
            padding: '10px 16px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            Encryption vault is open in another tab. Saving is blocked here to prevent data
            corruption. Close the other tab or lock the vault there first.
          </span>
        </div>
      )}
      {corruptWarning && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#7f1d1d',
            color: '#fef2f2',
            padding: '10px 16px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            Your saved data could not be loaded and has been reset. A backup of the corrupt data has
            been preserved under <code>ptnotes.appData.corrupt</code> in localStorage.
          </span>
          <button
            onClick={() => {
              dataRepository.clearCorruptData();
              setCorruptWarning(false);
            }}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: 'inherit',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
