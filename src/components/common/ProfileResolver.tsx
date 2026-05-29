import { Fragment, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isDemoMode } from '@/lib/demoMode';
import { resolveProfileId, commitActiveProfile } from '@/lib/profile/profileId';

/**
 * Selects the active on-device Profile (ADR-0007) before any storage layer
 * mounts. Each Profile is a cryptographically-isolated namespace; this component
 * is the single point that decides which one the storage keys resolve to.
 *
 * - **Demo build:** the profile is synchronously resolvable (`demo` vs `test-user`
 *   from the marker) — no auth wait.
 * - **Non-demo build:** we wait for the BetterAuth session to resolve so an
 *   authenticated user is never briefly routed into the `local` profile, then use
 *   their user id (or `local` when anonymous).
 *
 * If the resolved profile *changes* during a page's life (login, logout, switch),
 * a full `window.location.reload()` is the bulletproof teardown — it resets the
 * in-memory vault DEK and the cached IndexedDB handle along with all React state.
 */
function ProfileLoading() {
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

export function ProfileResolver({ children }: { children: ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const ready = isDemoMode() || !isLoading;
  const target = ready ? resolveProfileId(currentUser?.id ?? null) : null;
  const status: 'ok' | 'changed' | 'pending' = target ? commitActiveProfile(target) : 'pending';

  useEffect(() => {
    if (status === 'changed') window.location.reload();
  }, [status]);

  if (!target || status !== 'ok') return <ProfileLoading />;
  return <Fragment key={target}>{children}</Fragment>;
}
