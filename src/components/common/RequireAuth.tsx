import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

function AuthLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
    </div>
  );
}

/**
 * Mandatory-auth gate for non-demo use (BYOK, ADR-0009/0010, issue 06).
 *
 * MUST wrap `AppProviders` ABOVE `ProfileResolver`/`VaultGate`: the session check
 * has to win the race so an anonymous visitor redirects to `/login` BEFORE
 * `ProfileResolver` commits the on-device `local` profile or `VaultGate` mounts
 * its vault (the "fresh / no-claim" decision — ADR-0010). Demo builds never mount
 * this; their route keeps `AppGate` + `DemoAuthProvider` (always authenticated).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
