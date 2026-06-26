import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from './AppDataProvider';
import { NotesProvider, useNotes } from './NotesProvider';
import type { Note } from '@/types';

type Api = ReturnType<typeof useNotes>;

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    patientId: 'patient-1',
    format: 'soap',
    sections: [{ key: 'subjective', label: 'Subjective', body: 'Initial entry.' }],
    finalized: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function Probe({ ref }: { ref: { current: Api | null } }) {
  const api = useNotes();
  useEffect(() => {
    ref.current = api;
  });
  return null;
}

async function renderAndWait() {
  const ref: { current: Api | null } = { current: null };
  render(
    <AppDataProvider>
      <NotesProvider>
        <Probe ref={ref} />
      </NotesProvider>
    </AppDataProvider>,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  return ref as { current: Api };
}

describe('NotesProvider', () => {
  it('initializes with an empty notes list', async () => {
    const ref = await renderAndWait();
    expect(ref.current.notes).toEqual([]);
  });

  it('addNote: note appears in the list', async () => {
    const ref = await renderAndWait();
    const note = makeNote();
    await act(async () => ref.current.addNote(note));
    await waitFor(() => expect(ref.current.notes).toHaveLength(1));
    expect(ref.current.notes[0].id).toBe(note.id);
  });

  it('updateNote: updated sections persist', async () => {
    const ref = await renderAndWait();
    const note = makeNote();
    await act(async () => ref.current.addNote(note));
    await waitFor(() => expect(ref.current.notes).toHaveLength(1));
    const newSections = [{ key: 'subjective', label: 'Subjective', body: 'Updated content.' }];
    await act(async () => ref.current.updateNote(note.id, { sections: newSections }));
    await waitFor(() => expect(ref.current.notes[0].sections[0].body).toBe('Updated content.'));
  });

  it('finalizeNote: sets finalized to true and records finalizedAt', async () => {
    const ref = await renderAndWait();
    const note = makeNote({ finalized: false });
    await act(async () => ref.current.addNote(note));
    await waitFor(() => expect(ref.current.notes).toHaveLength(1));
    await act(async () => ref.current.finalizeNote(note.id));
    await waitFor(() => expect(ref.current.notes[0].finalized).toBe(true));
    expect(ref.current.notes[0].finalizedAt).toBeGreaterThan(0);
  });

  it('unfinalizeNote: clears the finalized flag', async () => {
    const ref = await renderAndWait();
    const note = makeNote({ finalized: true, finalizedAt: Date.now() });
    await act(async () => ref.current.addNote(note));
    await waitFor(() => expect(ref.current.notes).toHaveLength(1));
    await act(async () => ref.current.unfinalizeNote(note.id));
    await waitFor(() => expect(ref.current.notes[0].finalized).toBe(false));
    expect(ref.current.notes[0].finalizedAt).toBeUndefined();
  });

  it('removeNote: note no longer in list', async () => {
    const ref = await renderAndWait();
    const note = makeNote();
    await act(async () => ref.current.addNote(note));
    await waitFor(() => expect(ref.current.notes).toHaveLength(1));
    await act(async () => ref.current.removeNote(note.id));
    await waitFor(() => expect(ref.current.notes).toHaveLength(0));
  });

  it('forSession: returns the note for a given sessionId', async () => {
    const ref = await renderAndWait();
    const sessionId = crypto.randomUUID();
    const note = makeNote({ sessionId });
    await act(async () => ref.current.addNote(note));
    await waitFor(() => expect(ref.current.notes).toHaveLength(1));
    expect(ref.current.forSession(sessionId)?.id).toBe(note.id);
  });

  it('forSession: returns undefined for unknown sessionId', async () => {
    const ref = await renderAndWait();
    expect(ref.current.forSession('unknown')).toBeUndefined();
  });
});
