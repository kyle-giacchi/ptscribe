import { createListSliceContext } from './createListSliceContext';
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

const { Provider, useSlice } = createListSliceContext<Note, NotesContextValue>({
  label: 'Notes',
  select: (appData) => appData.notes,
  selectUpdater: (app) => app.updateNotesSlice,
  build: (m, notes) => ({
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
  }),
});

export const NotesProvider = Provider;
export const useNotes = useSlice;
