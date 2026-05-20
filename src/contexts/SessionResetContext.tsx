import { createContext, useContext } from 'react';

interface SessionResetContextValue {
  onResetSession: (() => void) | null;
}

export const SessionResetContext = createContext<SessionResetContextValue>({
  onResetSession: null,
});

export function useSessionReset() {
  return useContext(SessionResetContext);
}
