import { createContext, useContext, type ReactNode } from 'react';
import { isDemoMode } from '@/lib/demoMode';
import { DEMO_USER } from '@/lib/auth/demo';
import { authClient, type AuthSession } from '@/lib/auth/client';
import { vault } from '@/lib/vault/vault';
import type { AppUser, OrgRole } from '@/lib/auth/types';
import type { PlanTier } from '@/types/plans';

const ORG_ROLES: ReadonlySet<string> = new Set([
  'owner',
  'admin',
  'manager',
  'standard',
  'student',
]);

interface AuthContextValue {
  currentUser: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function mapSession(session: AuthSession): AppUser {
  const u = session.user as AuthSession['user'] & {
    planTier?: string;
    tenantId?: string;
    role?: string;
  };
  const orgId = u.tenantId ?? null;
  const role: OrgRole = ORG_ROLES.has(u.role ?? '') ? (u.role as OrgRole) : 'owner';
  return {
    id: u.id,
    email: u.email,
    displayName: u.name,
    planTier: ((u.planTier as PlanTier) ?? 'personal-free') as PlanTier,
    // Namespacing fallback: personal accounts (no org) partition AppData by user id.
    tenantId: orgId ?? u.id,
    orgId,
    role,
    createdAt: new Date(u.createdAt).getTime(),
  };
}

function DemoAuthProvider({ children }: { children: ReactNode }) {
  const value: AuthContextValue = {
    currentUser: DEMO_USER,
    isLoading: false,
    isAuthenticated: true,
    signOut: async () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const TEST_USER_KEY = 'ptscribe-test-user-session';

// Persisted in localStorage (not sessionStorage) so a Test User session behaves
// like a real login: it survives reloads and new tabs until an explicit Log out.
export function activateTestUserSession() {
  localStorage.setItem(TEST_USER_KEY, '1');
}

export function deactivateTestUserSession() {
  localStorage.removeItem(TEST_USER_KEY);
}

export function isTestUserSession(): boolean {
  return localStorage.getItem(TEST_USER_KEY) === '1';
}

function RealAuthProvider({ children }: { children: ReactNode }) {
  const isTestUser = isTestUserSession();
  const { data: session, isPending } = authClient.useSession();
  const value: AuthContextValue = {
    currentUser: isTestUser ? DEMO_USER : session ? mapSession(session) : null,
    isLoading: isTestUser ? false : isPending,
    isAuthenticated: isTestUser || !!session,
    signOut: async () => {
      vault.lock();
      deactivateTestUserSession();
      await authClient.signOut();
      window.location.reload();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (isDemoMode()) {
    return <DemoAuthProvider>{children}</DemoAuthProvider>;
  }
  return <RealAuthProvider>{children}</RealAuthProvider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
