import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { AISettings, AnalysisMode, AudioSettings, PageKey, Settings } from '@/types';

export interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  updateAi: (patch: Partial<AISettings>) => void;
  updateAudio: (patch: Partial<AudioSettings>) => void;
  updateUi: (patch: Partial<Settings['ui']>) => void;
  setIdleLockMinutes: (minutes: number) => void;
  setAutoDeleteAudioAfterDays: (days: number | undefined) => void;
  // Per-page detail-level toggle (kept from prior app for the dashboard etc.).
  // We persist this in localStorage directly because it isn't part of the
  // schema-validated AppData; keep it transient + ephemeral.
  getPageMode: (key: PageKey) => AnalysisMode;
  setPageMode: (key: PageKey, mode: AnalysisMode) => void;
}

const PAGE_MODE_KEY = 'ptnotes.pageModes';

function readPageModes(): Partial<Record<PageKey, AnalysisMode>> {
  try {
    const raw = localStorage.getItem(PAGE_MODE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePageModes(modes: Partial<Record<PageKey, AnalysisMode>>): void {
  try {
    localStorage.setItem(PAGE_MODE_KEY, JSON.stringify(modes));
  } catch {
    /* swallow — page mode is a UI nicety */
  }
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { appData, updateSettingsSlice } = useAppData();
  const settings = appData.settings;

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      updateSettings: (patch) => updateSettingsSlice({ ...settings, ...patch }),
      updateAi: (patch) => updateSettingsSlice({ ...settings, ai: { ...settings.ai, ...patch } }),
      updateAudio: (patch) =>
        updateSettingsSlice({ ...settings, audio: { ...settings.audio, ...patch } }),
      updateUi: (patch) => updateSettingsSlice({ ...settings, ui: { ...settings.ui, ...patch } }),
      setIdleLockMinutes: (minutes: number) =>
        updateSettingsSlice({
          ...settings,
          security: { ...settings.security, idleLockMinutes: minutes },
        }),
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
