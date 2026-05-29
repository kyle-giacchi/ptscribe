import { getActiveProfileId } from '@/lib/profile/profileId';

/**
 * Base (un-suffixed) storage key strings. Real keys are profile-scoped — see
 * `STORAGE_KEYS` below and ADR-0007. Never read/write a base string directly;
 * always go through `STORAGE_KEYS` so the active profile's namespace is applied.
 */
const BASE_KEYS = {
  appData: 'ptnotes.appData',
  appDataCorrupt: 'ptnotes.appData.corrupt',
  vault: 'ptnotes.vault',
  auditLog: 'ptnotes.auditLog',
  pageModes: 'ptnotes.pageModes',
} as const;

/** Suffix a base key with the active profile id (`ptnotes.appData:local`, …). */
export function scopedKey(base: string): string {
  return `${base}:${getActiveProfileId()}`;
}

/**
 * Profile-scoped localStorage keys. Each property resolves the active profile id
 * at access time, so the same call site reads/writes the right namespace after a
 * profile transition (transitions full-reload, so the id is stable per page life).
 */
export const STORAGE_KEYS = {
  get appData() {
    return scopedKey(BASE_KEYS.appData);
  },
  get appDataCorrupt() {
    return scopedKey(BASE_KEYS.appDataCorrupt);
  },
  get vault() {
    return scopedKey(BASE_KEYS.vault);
  },
  get auditLog() {
    return scopedKey(BASE_KEYS.auditLog);
  },
  get pageModes() {
    return scopedKey(BASE_KEYS.pageModes);
  },
} as const;

/** The base key strings, for one-time legacy cleanup of pre-profile (un-suffixed) data. */
export const LEGACY_UNSCOPED_KEYS = [
  BASE_KEYS.appData,
  BASE_KEYS.appDataCorrupt,
  BASE_KEYS.vault,
  BASE_KEYS.auditLog,
  BASE_KEYS.pageModes,
] as const;

export type StorageKey = string;

const AUDIO_DB_BASE = 'ptnotes-audio';

export const AUDIO_DB = {
  /** Base name; the live database is profile-scoped via `audioDbName()`. */
  name: AUDIO_DB_BASE,
  version: 2,
  store: 'recordings',
  chunkStore: 'recording_chunks',
} as const;

/** Profile-scoped IndexedDB database name for audio (`ptnotes-audio:local`, …). */
export function audioDbName(): string {
  return `${AUDIO_DB_BASE}:${getActiveProfileId()}`;
}

/** The legacy (pre-profile) un-suffixed audio DB name, for one-time cleanup. */
export const LEGACY_AUDIO_DB_NAME = AUDIO_DB_BASE;
