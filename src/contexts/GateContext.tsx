import { createContext, useContext } from 'react';

interface GateContextValue {
  logout: () => void;
}

export const GateContext = createContext<GateContextValue | null>(null);

export function useGate(): GateContextValue {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error('useGate must be used within AppGate');
  return ctx;
}
