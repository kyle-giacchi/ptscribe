// src/services/configSync.ts
//
// Pure helpers for syncing a registered user's NON-CLINICAL config to D1. The
// projection here is the SINGLE source of the clinical exclusion: only settings,
// the clinician profile, and custom (non-builtin) templates/exercises are ever
// built into a sync payload. Patient data, sessions, notes, plans, and audio are
// never referenced, so the privacy boundary is auditable in one function.
//
// Reconciliation is last-write-wins at the blob level, keyed off a per-user
// config version (`updatedAt`) tracked separately from AppData.lastModified —
// AppData.lastModified bumps on patient edits that must NOT trigger a sync, so a
// dedicated version avoids pushing clinical-edit churn to the server.

import type { AppData, Clinician, Settings, NoteTemplate, Exercise } from '@/types';

export interface UserConfigProjection {
  settings: Settings;
  clinician: Clinician;
  templates: NoteTemplate[];
  exercises: Exercise[];
}

/** Server row shape returned by GET /api/config/user (`config` field). */
export interface ServerUserConfig extends UserConfigProjection {
  updatedAt: number;
}

/**
 * Build the sync payload from AppData. ONLY non-clinical config is included;
 * built-in templates/exercises are dropped (they're regenerated locally and the
 * server rejects them anyway). This is the authoritative clinical-exclusion point.
 */
export function projectUserConfig(appData: AppData): UserConfigProjection {
  return {
    settings: appData.settings,
    clinician: appData.clinician,
    templates: appData.templates.filter((t) => !t.builtin),
    exercises: appData.exercises.filter((e) => !e.builtin),
  };
}

/** Deterministic, key-sorted JSON so hashes are stable regardless of key order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
  );
  return `{${entries.join(',')}}`;
}

/** Stable content hash of a projection, used for change detection. */
export function hashUserConfig(projection: UserConfigProjection): string {
  return stableStringify(projection);
}

export type ReconcileAction =
  | { action: 'apply'; server: ServerUserConfig }
  | { action: 'push' }
  | { action: 'noop' };

/**
 * Last-write-wins decision on login:
 *  - no server row            → push (seed D1 from local).
 *  - server newer than local  → apply (pull server config into AppData).
 *  - local newer than server  → push.
 *  - equal versions           → noop.
 *
 * `localUpdatedAt` comes from the per-user sync record; a fresh device has no
 * record ⇒ 0 ⇒ the server always wins on first pull.
 */
export function reconcile(
  localUpdatedAt: number,
  server: ServerUserConfig | null,
): ReconcileAction {
  if (!server) return { action: 'push' };
  if (server.updatedAt > localUpdatedAt) return { action: 'apply', server };
  if (server.updatedAt < localUpdatedAt) return { action: 'push' };
  return { action: 'noop' };
}

// ── Per-user sync record (localStorage) ──────────────────────────────────────

export interface ConfigSyncRecord {
  /** Hash of the last projection we pushed or applied. */
  hash: string;
  /** Config version we believe is current locally. */
  localUpdatedAt: number;
  /** Config version we last saw on the server. */
  serverUpdatedAt: number;
}

export function configSyncKey(userId: string): string {
  return `ptscribe-config-sync:${userId}`;
}

export function readSyncRecord(userId: string): ConfigSyncRecord | null {
  try {
    const raw = localStorage.getItem(configSyncKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConfigSyncRecord;
    if (typeof parsed?.localUpdatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSyncRecord(userId: string, rec: ConfigSyncRecord): void {
  try {
    localStorage.setItem(configSyncKey(userId), JSON.stringify(rec));
  } catch {
    // Best-effort; a quota failure here only costs us change-detection memo.
  }
}
