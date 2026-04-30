import { createContext, useContext, type ReactNode } from 'react';
import { isDemoMode } from '@/lib/demoMode';
import { DEMO_USER } from '@/lib/auth/demo';
import { authClient, type AuthSession } from '@/lib/auth/client';
import type { AppUser } from '@/lib/auth/types';
import type { PlanTier } from '@/types/plans';

interface AuthContextValue {
  currentUser: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapSession(session: AuthSession): AppUser {
  const u = session.user as AuthSession['user'] & {
    planTier?: string;
    tenantId?: string;
  };
  return {
    id: u.id,
    email: u.email,
    displayName: u.name,
    planTier: ((u.planTier as PlanTier) ?? 'personal-free') as PlanTier,
    tenantId: u.tenantId ?? u.id,
    role: 'owner',
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

function RealAuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const value: AuthContextValue = {
    currentUser: session ? mapSession(session) : null,
    isLoading: isPending,
    isAuthenticated: !!session,
    signOut: async () => { await authClient.signOut(); },
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
