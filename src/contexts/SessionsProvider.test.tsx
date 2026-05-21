import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from './AppDataProvider';
import { SessionsProvider, useSessions } from './SessionsProvider';
import { newId } from '@/utils/ids';
import type { Session, SessionClip } from '@/types';

type Api = ReturnType<typeof useSessions>;

function makeSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  return {
    id: newId(),
    patientId: 'patient-1',
    type: 'follow_up',
    date: now,
    status: 'draft',
    clips: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeClip(overrides: Partial<SessionClip> = {}): SessionClip {
  const now = Date.now();
  return {
    id: newId(),
    index: 0,
    durationSec: 120,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function Probe({ ref }: { ref: { current: Api | null } }) {
  const api = useSessions();
  useEffect(() => {
    ref.current = api;
  });
  return null;
}

async function renderAndWait() {
  const ref: { current: Api | null } = { current: null };
  render(
    <AppDataProvider>
      <SessionsProvider>
        <Probe ref={ref} />
      </SessionsProvider>
    </AppDataProvider>,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  return ref as { current: Api };
}

describe('SessionsProvider', () => {
  it('initializes with an empty sessions list', async () => {
    const ref = await renderAndWait();
    expect(ref.current.sessions).toEqual([]);
  });

  it('addSession: new session appears in the list', async () => {
    const ref = await renderAndWait();
    const session = makeSession({ type: 'evaluation' });
    await act(async () => ref.current.addSession(session));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(1));
    expect(ref.current.sessions[0].type).toBe('evaluation');
  });

  it('updateSession: changed field persists', async () => {
    const ref = await renderAndWait();
    const session = makeSession();
    await act(async () => ref.current.addSession(session));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(1));
    await act(async () => ref.current.updateSession(session.id, { status: 'ready' }));
    await waitFor(() => expect(ref.current.sessions[0].status).toBe('ready'));
  });

  it('removeSession: session no longer in list', async () => {
    const ref = await renderAndWait();
    const session = makeSession();
    await act(async () => ref.current.addSession(session));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(1));
    await act(async () => ref.current.removeSession(session.id));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(0));
  });

  it('setStatus: updates the status field', async () => {
    const ref = await renderAndWait();
    const session = makeSession({ status: 'draft' });
    await act(async () => ref.current.addSession(session));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(1));
    await act(async () => ref.current.setStatus(session.id, 'finalized'));
    await waitFor(() => expect(ref.current.sessions[0].status).toBe('finalized'));
  });

  it('forPatient: returns only sessions for the given patientId', async () => {
    const ref = await renderAndWait();
    const s1 = makeSession({ patientId: 'patient-A' });
    const s2 = makeSession({ patientId: 'patient-B' });
    await act(async () => ref.current.addSession(s1));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(1));
    await act(async () => ref.current.addSession(s2));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(2));
    expect(ref.current.forPatient('patient-A')).toHaveLength(1);
    expect(ref.current.forPatient('patient-A')[0].id).toBe(s1.id);
  });

  it('forPatient: returns sessions sorted by date descending', async () => {
    const ref = await renderAndWait();
    const older = makeSession({ patientId: 'patient-A', date: 1_000_000 });
    const newer = makeSession({ patientId: 'patient-A', date: 2_000_000 });
    await act(async () => ref.current.addSession(older));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(1));
    await act(async () => ref.current.addSession(newer));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(2));
    const results = ref.current.forPatient('patient-A');
    expect(results[0].id).toBe(newer.id);
    expect(results[1].id).toBe(older.id);
  });

  it('updateSession with clips patch: clips persist', async () => {
    const ref = await renderAndWait();
    const session = makeSession();
    await act(async () => ref.current.addSession(session));
    await waitFor(() => expect(ref.current.sessions).toHaveLength(1));
    const clip = makeClip({ index: 0 });
    await act(async () => ref.current.updateSession(session.id, { clips: [clip] }));
    await waitFor(() => expect(ref.current.sessions[0].clips).toHaveLength(1));
    expect(ref.current.sessions[0].clips[0].id).toBe(clip.id);
  });
});
