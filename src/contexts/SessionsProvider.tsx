import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { makeListMutators } from './listSlice';
import type { Session, SessionStatus } from '@/types';

export interface SessionsContextValue {
  sessions: Session[];
  addSession: (session: Session) => void;
  updateSession: (id: string, patch: Partial<Session>) => void;
  removeSession: (id: string) => void;
  setStatus: (id: string, status: SessionStatus) => void;
  getSession: (id: string) => Session | undefined;
  forPatient: (patientId: string) => Session[];
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { appData, updateSessionsSlice } = useAppData();
  const sessions = appData.sessions;
  const value = useMemo<SessionsContextValue>(() => {
    const m = makeListMutators(sessions, updateSessionsSlice);
    return {
      sessions,
      addSession: m.add,
      updateSession: m.update,
      removeSession: m.remove,
      setStatus: (id, status) => m.update(id, { status } as Partial<Session>),
      getSession: m.get,
      forPatient: (patientId) =>
        sessions.filter((s) => s.patientId === patientId).sort((a, b) => b.date - a.date),
    };
  }, [sessions, updateSessionsSlice]);
  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions must be used within SessionsProvider');
  return ctx;
}
