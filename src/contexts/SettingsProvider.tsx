import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import type {
  AISettings,
  AnalysisMode,
  AudioSettings,
  FirstRunState,
  OrgPolicySettings,
  PageKey,
  RecordingLimitsSettings,
  SessionWorkflowSettings,
  Settings,
} from '@/types';

export interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  updateAi: (patch: Partial<AISettings>) => void;
  updateAudio: (patch: Partial<AudioSettings>) => void;
  updateUi: (patch: Partial<Settings['ui']>) => void;
  updateSession: (patch: Partial<SessionWorkflowSettings>) => void;
  updateRecordingLimits: (patch: Partial<RecordingLimitsSettings>) => void;
  updateOrgPolicy: (patch: Partial<OrgPolicySettings>) => void;
  updateFirstRun: (patch: Partial<FirstRunState>) => void;
  setAutoDeleteAudioAfterDays: (days: number | undefined) => void;
  // Per-page detail-level toggle (kept from prior app for the dashboard etc.).
  // We persist this in localStorage directly because it isn't part of the
  // schema-validated AppData; keep it transient + ephemeral.
  getPageMode: (key: PageKey) => AnalysisMode;
  setPageMode: (key: PageKey, mode: AnalysisMode) => void;
}

function readPageModes(): Partial<Record<PageKey, AnalysisMode>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pageModes);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePageModes(modes: Partial<Record<PageKey, AnalysisMode>>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.pageModes, JSON.stringify(modes));
  } catch {
    /* swallow — page mode is a UI nicety */
  }
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { appData, updateSettingsSlice } = useAppData();
  const settings = appData.settings;

  // Apply data-theme to <html> so CSS [data-theme="dark"] overrides take effect.
  // 'system' resolves via matchMedia; 'light'/'dark' are explicit overrides.
  useEffect(() => {
    const theme = settings.ui.theme ?? 'system';

    function applyTheme(dark: boolean) {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }

    if (theme === 'light') {
      applyTheme(false);
      return;
    }
    if (theme === 'dark') {
      applyTheme(true);
      return;
    }

    // 'system' — mirror OS preference and watch for changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches);
    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.ui.theme]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      updateSettings: (patch) => updateSettingsSlice({ ...settings, ...patch }),
      updateAi: (patch) => updateSettingsSlice({ ...settings, ai: { ...settings.ai, ...patch } }),
      updateAudio: (patch) =>
        updateSettingsSlice({ ...settings, audio: { ...settings.audio, ...patch } }),
      updateUi: (patch) => updateSettingsSlice({ ...settings, ui: { ...settings.ui, ...patch } }),
      updateSession: (patch) =>
        updateSettingsSlice({ ...settings, session: { ...settings.session, ...patch } }),
      updateRecordingLimits: (patch) =>
        updateSettingsSlice({
          ...settings,
          recordingLimits: { ...settings.recordingLimits, ...patch },
        }),
      updateOrgPolicy: (patch) =>
        updateSettingsSlice({ ...settings, orgPolicy: { ...settings.orgPolicy, ...patch } }),
      updateFirstRun: (patch) =>
        updateSettingsSlice({ ...settings, firstRun: { ...settings.firstRun, ...patch } }),
      setAutoDeleteAudioAfterDays: (days: number | undefined) =>
        updateSettingsSlice({
          ...settings,
          retention: { ...settings.retention, autoDeleteAudioAfterDays: days },
        }),
      getPageMode: (key) => readPageModes()[key] ?? 'simple',
      setPageMode: (key, mode) => {
        const modes = readPageModes();
        writePageModes({ ...modes, [key]: mode });
      },
    }),
    [settings, updateSettingsSlice],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
