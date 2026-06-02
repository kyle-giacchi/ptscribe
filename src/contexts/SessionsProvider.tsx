import { createListSliceContext } from './createListSliceContext';
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

const { Provider, useSlice } = createListSliceContext<Session, SessionsContextValue>({
  label: 'Sessions',
  select: (appData) => appData.sessions,
  selectUpdater: (app) => app.updateSessionsSlice,
  build: (m, sessions) => ({
    sessions,
    addSession: m.add,
    updateSession: m.update,
    removeSession: m.remove,
    setStatus: (id, status) => m.update(id, { status } as Partial<Session>),
    getSession: m.get,
    forPatient: (patientId) =>
      sessions.filter((s) => s.patientId === patientId).sort((a, b) => b.date - a.date),
  }),
});

export const SessionsProvider = Provider;
export const useSessions = useSlice;
