import { useAuth } from '@/contexts/AuthContext';
import { isDemoMode } from '@/lib/demoMode';
import { isTestUserSession } from '@/lib/profile/profileId';

// ponytail: DEV builds skip the sign-in gate so the local/in-network segments
// are reachable from the dev quick-login session. Prod keeps the ADR-0011 gate.

/**
 * Whether local / in-network model routing is available (ADR-0011).
 *
 * Signed-in accounts only. The demo user and the test-user session both report
 * `isAuthenticated`, so they are excluded explicitly — demo mode keeps every
 * cloud-adjacent route off, and the test session is not a real account.
 */
export function useSelfHostedAllowed(): boolean {
  const { isAuthenticated } = useAuth();
  if (import.meta.env.DEV) return !isDemoMode();
  return isAuthenticated && !isDemoMode() && !isTestUserSession();
}
