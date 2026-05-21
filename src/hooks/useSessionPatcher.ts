import { useCallback, useMemo } from 'react';
import { useAppData } from '@/contexts/AppDataProvider';
import type { Session, SessionClip } from '@/types';

export interface SessionPatcher {
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
}

/**
 * Stable patcher callbacks for one session. Every mutation goes through
 * `updateSessionsSlice` and stamps `updatedAt`, matching the inline closures
 * that previously lived in Session.tsx.
 */
export function useSessionPatcher(sessionId: string): SessionPatcher {
  const { updateSessionsSlice } = useAppData();

  const patchSession = useCallback(
    (patch: Partial<Session>) => {
      updateSessionsSlice((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...patch, updatedAt: Date.now() } : s)),
      );
    },
    [sessionId, updateSessionsSlice],
  );

  const patchClips = useCallback(
    (mapper: (clips: SessionClip[]) => SessionClip[]) => {
      updateSessionsSlice((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, clips: mapper(s.clips), updatedAt: Date.now() } : s,
        ),
      );
    },
    [sessionId, updateSessionsSlice],
  );

  const patchClip = useCallback(
    (clipId: string, patch: Partial<SessionClip>) => {
      patchClips((clips) =>
        clips.map((c) => (c.id === clipId ? { ...c, ...patch, updatedAt: Date.now() } : c)),
      );
    },
    [patchClips],
  );

  return useMemo(
    () => ({ patchSession, patchClips, patchClip }),
    [patchSession, patchClips, patchClip],
  );
}
