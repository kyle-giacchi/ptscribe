// src/contexts/ConfigSyncProvider.tsx
//
// Mirrors a registered user's NON-CLINICAL config (settings + clinician profile
// + custom templates/exercises) to D1 so it follows them across devices. Pulls
// on login, pushes (debounced) on change, reconciling last-write-wins.
//
// DEMO ISOLATION (hard invariant): the demo user, the test-user bypass, and any
// unauthenticated session perform ZERO /api/config/* requests. The gate below is
// the single guard — keep it first in both effects.
//
// Writes into AppData go ONLY through the slice mutators (single write path);
// this provider never touches localStorage AppData or IndexedDB directly. It
// keeps its own small per-user sync record in localStorage (configSync.ts).

import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataProvider';
import { isDemoMode } from '@/lib/demoMode';
import { DEMO_USER } from '@/lib/auth/demo';
import {
  projectUserConfig,
  hashUserConfig,
  reconcile,
  readSyncRecord,
  writeSyncRecord,
  type ServerUserConfig,
  type UserConfigProjection,
} from '@/services/configSync';

const PUSH_DEBOUNCE_MS = 1500;

/** GET the user's config row. Returns the server config, null (no row), or 'error'. */
async function fetchUserConfig(): Promise<ServerUserConfig | null | 'error'> {
  try {
    const res = await fetch('/api/config/user', { headers: { Accept: 'application/json' } });
    if (!res.ok) return 'error';
    const body = (await res.json()) as { config: ServerUserConfig | null };
    return body.config ?? null;
  } catch {
    return 'error';
  }
}

/** PUT the projection at a given config version. Resolves true on success. */
async function putUserConfig(
  projection: UserConfigProjection,
  updatedAt: number,
): Promise<boolean> {
  try {
    const res = await fetch('/api/config/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...projection, updatedAt }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function ConfigSyncProvider({ children }: { children: ReactNode }) {
  const { currentUser, isAuthenticated } = useAuth();
  const { appData, updateSettingsSlice, updateClinicianSlice, updateTemplatesSlice, updateExercisesSlice } =
    useAppData();

  // Demo / test-user / unauthenticated ⇒ fully isolated, no network at all.
  const isolated =
    isDemoMode() || !isAuthenticated || !currentUser || currentUser.id === DEMO_USER.id;
  const userId = currentUser?.id ?? '';

  // Keep the latest appData reachable from the pull effect without making it a
  // dependency (we don't want to re-pull on every clinical edit). Updated in an
  // effect — never written during render.
  const appDataRef = useRef(appData);
  useEffect(() => {
    appDataRef.current = appData;
  }, [appData]);

  const pulledRef = useRef(false);
  const lastHashRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pull on login + reconcile (LWW) ────────────────────────────────────────
  useEffect(() => {
    if (isolated || !userId) return;
    let cancelled = false;

    void (async () => {
      const server = await fetchUserConfig();
      if (cancelled || server === 'error') return; // leave pulledRef false; retry next mount

      const rec = readSyncRecord(userId);
      const localUpdatedAt = rec?.localUpdatedAt ?? 0;
      const decision = reconcile(localUpdatedAt, server);

      if (decision.action === 'apply') {
        const s = decision.server;
        // Apply each slice exactly once with a full replacement. For templates/
        // exercises, keep built-ins and replace the custom subset (never chain
        // add→update on one slice — the double-write footgun).
        updateSettingsSlice(s.settings);
        updateClinicianSlice(s.clinician);
        updateTemplatesSlice((prev) => [...prev.filter((t) => t.builtin), ...s.templates]);
        updateExercisesSlice((prev) => [...prev.filter((e) => e.builtin), ...s.exercises]);

        const hash = hashUserConfig({
          settings: s.settings,
          clinician: s.clinician,
          templates: s.templates,
          exercises: s.exercises,
        });
        lastHashRef.current = hash;
        writeSyncRecord(userId, {
          hash,
          localUpdatedAt: s.updatedAt,
          serverUpdatedAt: s.updatedAt,
        });
      } else if (decision.action === 'push') {
        const projection = projectUserConfig(appDataRef.current);
        const updatedAt = Date.now();
        const ok = await putUserConfig(projection, updatedAt);
        const hash = hashUserConfig(projection);
        lastHashRef.current = hash;
        if (ok) writeSyncRecord(userId, { hash, localUpdatedAt: updatedAt, serverUpdatedAt: updatedAt });
      } else {
        // noop — record the current hash so the change effect has a baseline.
        lastHashRef.current = rec?.hash ?? hashUserConfig(projectUserConfig(appDataRef.current));
      }

      if (!cancelled) pulledRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isolated, userId]);

  // ── Push on change (debounced) ─────────────────────────────────────────────
  useEffect(() => {
    if (isolated || !userId || !pulledRef.current) return;

    const projection = projectUserConfig(appData);
    const hash = hashUserConfig(projection);
    if (hash === lastHashRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const updatedAt = Date.now();
      void (async () => {
        const ok = await putUserConfig(projection, updatedAt);
        if (ok) {
          lastHashRef.current = hash;
          writeSyncRecord(userId, { hash, localUpdatedAt: updatedAt, serverUpdatedAt: updatedAt });
        }
      })();
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [appData, isolated, userId]);

  return <>{children}</>;
}
