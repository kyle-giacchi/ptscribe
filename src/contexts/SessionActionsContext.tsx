import { createContext, useContext } from 'react';

interface SessionActionsContextValue {
  onResetSession: (() => void) | null;
}

export const SessionActionsContext = createContext<SessionActionsContextValue>({
  onResetSession: null,
});

export function useSessionActions() {
  return useContext(SessionActionsContext);
}
