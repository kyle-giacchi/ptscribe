import { createContext, useContext } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface GateContextValue {
  logout: () => void;
}

export const GateContext = createContext<GateContextValue | null>(null);

/**
 * Log-out handle for the top nav / sidebar.
 *
 * AppGate (and this context) only mounts on the demo route; the non-demo route
 * is auth-gated by RequireAuth instead, so there is no gate to clear — the real
 * sign-out is the auth one (which locks the vault and reloads). Falling back
 * rather than throwing keeps both nav components mountable on either route.
 */
export function useGate(): GateContextValue {
  const ctx = useContext(GateContext);
  const { signOut } = useAuth();
  return ctx ?? { logout: () => void signOut() };
}
