// src/contexts/OrgConfigProvider.tsx
//
// Loads an org's NON-CLINICAL config from D1 (policy + a shared template/exercise
// library) and exposes it read-only to the app. Managers can update it via
// updateOrgConfig (PUT /api/config/org, enforced server-side by requireManager).
//
// Org config is intentionally kept in THIS context, NOT written into AppData:
// it's org-owned and read-only to members (like built-ins, but sourced from the
// org), so it never enters the user's local persistence path.
//
// DEMO ISOLATION (hard invariant): demo / test-user / unauthenticated / no-org
// sessions make ZERO /api/config/org requests. The gate is the single guard.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isDemoMode } from '@/lib/demoMode';
import { DEMO_USER } from '@/lib/auth/demo';
import type { NoteTemplate, Exercise } from '@/types';

/** Extensible org-wide policy blob. All fields optional; unknown fields ignored. */
export interface OrgPolicy {
  /** Template the org recommends as the default for new sessions. */
  defaultTemplateId?: string;
  /** Audio retention ceiling (days) the org sets for members. */
  retentionDays?: number;
  /** Allowlist of note-generation model ids; empty/absent = no restriction. */
  allowedModels?: string[];
}

export interface OrgConfigValue {
  /** True while the org session has an orgId and we've not yet resolved a load. */
  loading: boolean;
  policy: OrgPolicy;
  sharedTemplates: NoteTemplate[];
  sharedExercises: Exercise[];
  /** Whether the current user may edit org config (owner/admin). */
  canManage: boolean;
  /** Manager-only. Resolves true on success; no-ops for non-managers/isolated. */
  updateOrgConfig: (next: {
    policy: OrgPolicy;
    templates: NoteTemplate[];
    exercises: Exercise[];
  }) => Promise<boolean>;
  /** Re-fetch from the server. */
  reload: () => Promise<void>;
}

const EMPTY: OrgConfigValue = {
  loading: false,
  policy: {},
  sharedTemplates: [],
  sharedExercises: [],
  canManage: false,
  updateOrgConfig: async () => false,
  reload: async () => {},
};

const OrgConfigContext = createContext<OrgConfigValue>(EMPTY);

interface ServerOrgConfig {
  policy: OrgPolicy;
  templates: NoteTemplate[];
  exercises: Exercise[];
  updatedAt: number;
}

export function OrgConfigProvider({ children }: { children: ReactNode }) {
  const { currentUser, isAuthenticated } = useAuth();

  const isolated =
    isDemoMode() ||
    !isAuthenticated ||
    !currentUser ||
    currentUser.id === DEMO_USER.id ||
    !currentUser.orgId;

  const [loading, setLoading] = useState(!isolated);
  const [policy, setPolicy] = useState<OrgPolicy>({});
  const [sharedTemplates, setSharedTemplates] = useState<NoteTemplate[]>([]);
  const [sharedExercises, setSharedExercises] = useState<Exercise[]>([]);
  const [canManage, setCanManage] = useState(false);
  // Last server config version we know about — sent back on PUT for LWW.
  const updatedAtRef = useRef(0);

  const reload = useCallback(async () => {
    if (isolated) return;
    try {
      const res = await fetch('/api/config/org', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const body = (await res.json()) as { config: ServerOrgConfig | null; canManage?: boolean };
      setCanManage(!!body.canManage);
      if (body.config) {
        setPolicy(body.config.policy ?? {});
        setSharedTemplates(body.config.templates ?? []);
        setSharedExercises(body.config.exercises ?? []);
        updatedAtRef.current = body.config.updatedAt;
      } else {
        setPolicy({});
        setSharedTemplates([]);
        setSharedExercises([]);
        updatedAtRef.current = 0;
      }
    } catch {
      // Network error — keep whatever we have; reload can be retried.
    } finally {
      setLoading(false);
    }
  }, [isolated]);

  useEffect(() => {
    // `loading` starts true only when the first render is non-isolated (see the
    // useState initializer); reload() clears it in its finally. We avoid a
    // synchronous setState here so the effect never triggers cascading renders.
    if (isolated) return;
    // Inline async IIFE so reload's setState lands after the await — never
    // synchronously in the effect body (avoids cascading-render lint/warning).
    void (async () => {
      await reload();
    })();
  }, [isolated, reload]);

  const updateOrgConfig = useCallback<OrgConfigValue['updateOrgConfig']>(
    async (next) => {
      if (isolated || !canManage) return false;
      const updatedAt = Date.now();
      try {
        const res = await fetch('/api/config/org', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...next, updatedAt }),
        });
        if (!res.ok) return false;
        // Reflect optimistically and adopt the new version.
        setPolicy(next.policy);
        setSharedTemplates(next.templates.filter((t) => !t.builtin));
        setSharedExercises(next.exercises.filter((e) => !e.builtin));
        updatedAtRef.current = updatedAt;
        return true;
      } catch {
        return false;
      }
    },
    [isolated, canManage],
  );

  const value: OrgConfigValue = {
    loading,
    policy,
    sharedTemplates,
    sharedExercises,
    canManage,
    updateOrgConfig,
    reload,
  };

  return <OrgConfigContext.Provider value={value}>{children}</OrgConfigContext.Provider>;
}

export function useOrgConfig(): OrgConfigValue {
  return useContext(OrgConfigContext);
}
