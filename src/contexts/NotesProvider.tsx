import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { makeListMutators } from './listSlice';
import type { Note } from '@/types';

export interface NotesContextValue {
  notes: Note[];
  addNote: (note: Note) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  finalizeNote: (id: string) => void;
  unfinalizeNote: (id: string) => void;
  removeNote: (id: string) => void;
  getNote: (id: string) => Note | undefined;
  forPatient: (patientId: string) => Note[];
  forSession: (sessionId: string) => Note | undefined;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const { appData, updateNotesSlice } = useAppData();
  const notes = appData.notes;
  const value = useMemo<NotesContextValue>(() => {
    const m = makeListMutators(notes, updateNotesSlice);
    return {
      notes,
      addNote: m.add,
      updateNote: m.update,
      removeNote: m.remove,
      finalizeNote: (id) => m.update(id, { finalized: true, finalizedAt: Date.now() }),
      unfinalizeNote: (id) => m.update(id, { finalized: false, finalizedAt: undefined }),
      getNote: m.get,
      forPatient: (patientId) =>
        notes.filter((n) => n.patientId === patientId).sort((a, b) => b.createdAt - a.createdAt),
      forSession: (sessionId) => notes.find((n) => n.sessionId === sessionId),
    };
  }, [notes, updateNotesSlice]);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within NotesProvider');
  return ctx;
}
