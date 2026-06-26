import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from '@/contexts/AppDataProvider';
import { SessionsProvider, useSessions } from '@/contexts/SessionsProvider';
import { useSessionPatcher, type SessionPatcher } from './useSessionPatcher';
import type { Session, SessionClip } from '@/types';

function makeSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
    index: 0,
    durationSec: 120,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

type Captured = {
  patcher: SessionPatcher | null;
  sessions: ReturnType<typeof useSessions> | null;
  renderCount: number;
  patcherRefs: SessionPatcher[];
};

function Probe({
  sessionId,
  onRender,
}: {
  sessionId: string;
  onRender: (patcher: SessionPatcher, sessions: ReturnType<typeof useSessions>) => void;
}) {
  const patcher = useSessionPatcher(sessionId);
  const sessions = useSessions();
  useEffect(() => {
    onRender(patcher, sessions);
  });
  return null;
}

async function mount(sessionId: string) {
  const captured: Captured = {
    patcher: null,
    sessions: null,
    renderCount: 0,
    patcherRefs: [],
  };
  const onRender = (patcher: SessionPatcher, sessions: ReturnType<typeof useSessions>) => {
    captured.renderCount += 1;
    captured.patcherRefs.push(patcher);
    captured.patcher = patcher;
    captured.sessions = sessions;
  };
  const { rerender } = render(
    <AppDataProvider>
      <SessionsProvider>
        <Probe sessionId={sessionId} onRender={onRender} />
      </SessionsProvider>
    </AppDataProvider>,
  );
  await waitFor(() => expect(captured.sessions).not.toBeNull());
  return {
    captured,
    rerenderWithId: (id: string) =>
      rerender(
        <AppDataProvider>
          <SessionsProvider>
            <Probe sessionId={id} onRender={onRender} />
          </SessionsProvider>
        </AppDataProvider>,
      ),
  };
}

describe('useSessionPatcher', () => {
  it('returns a stable patcher object across renders when sessionId is stable', async () => {
    const sessionId = 'sess-stable';
    const { captured, rerenderWithId } = await mount(sessionId);

    const firstObject = captured.patcher;
    const firstPatchSession = firstObject!.patchSession;

    rerenderWithId(sessionId);
    rerenderWithId(sessionId);

    expect(captured.renderCount).toBeGreaterThan(1);
    expect(captured.patcher).toBe(firstObject);
    expect(captured.patcher!.patchSession).toBe(firstPatchSession);
  });

  it('produces a new patcher object when sessionId changes', async () => {
    const { captured, rerenderWithId } = await mount('sess-a');
    const first = captured.patcher;

    rerenderWithId('sess-b');
    await waitFor(() => expect(captured.patcher).not.toBe(first));

    expect(captured.patcher!.patchSession).not.toBe(first!.patchSession);
  });

  it('patchSession mutates only the matching session and stamps updatedAt', async () => {
    const target = makeSession({ id: 'sess-target' });
    const other = makeSession({ id: 'sess-other' });

    const { captured } = await mount(target.id);
    await act(async () => {
      captured.sessions!.addSession(target);
    });
    await waitFor(() => expect(captured.sessions!.getSession(target.id)).toBeTruthy());
    await act(async () => {
      captured.sessions!.addSession(other);
    });
    await waitFor(() => expect(captured.sessions!.getSession(other.id)).toBeTruthy());

    const before = Date.now();
    await act(async () => {
      captured.patcher!.patchSession({ status: 'finalized' });
    });

    await waitFor(() => {
      expect(captured.sessions!.getSession(target.id)!.status).toBe('finalized');
    });
    const updated = captured.sessions!.getSession(target.id)!;
    const untouched = captured.sessions!.getSession(other.id)!;
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
    expect(untouched.status).toBe('draft');
  });

  it('patchClips replaces the clips array via the mapper', async () => {
    const target = makeSession({ id: 'sess-clips', clips: [makeClip({ id: 'c1' })] });

    const { captured } = await mount(target.id);
    await act(async () => {
      captured.sessions!.addSession(target);
    });

    await act(async () => {
      captured.patcher!.patchClips((clips) => [...clips, makeClip({ id: 'c2', index: 1 })]);
    });

    const updated = captured.sessions!.getSession(target.id)!;
    expect(updated.clips.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('patchClip updates a single clip by id and stamps its updatedAt', async () => {
    const target = makeSession({
      id: 'sess-clip',
      clips: [makeClip({ id: 'c1', durationSec: 10 }), makeClip({ id: 'c2', durationSec: 20 })],
    });

    const { captured } = await mount(target.id);
    await act(async () => {
      captured.sessions!.addSession(target);
    });

    const before = Date.now();
    await act(async () => {
      captured.patcher!.patchClip('c2', { durationSec: 99 });
    });

    const updated = captured.sessions!.getSession(target.id)!;
    const c1 = updated.clips.find((c) => c.id === 'c1')!;
    const c2 = updated.clips.find((c) => c.id === 'c2')!;
    expect(c1.durationSec).toBe(10);
    expect(c2.durationSec).toBe(99);
    expect(c2.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
