import { useDebugDrawer } from '@/contexts/DebugDrawerProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { DebugDrawer } from './DebugDrawer';

/**
 * Renders the single app-global DebugDrawer instance, wired to the
 * DebugDrawerProvider. Mounted once at the app shell so the drawer is reachable
 * from anywhere (Settings → Debug Menu); session-scoped panels read live data
 * the active Session page pushes into the provider, plus the persisted
 * `aiErrors` log straight off the active Session entity.
 */
export function GlobalDebugDrawer() {
  const { open, closeDebug, activeSessionId, sessionDebug } = useDebugDrawer();
  const { getSession, updateSession } = useSessions();

  if (!open) return null;

  const activeSession = activeSessionId ? getSession(activeSessionId) : undefined;

  return (
    <DebugDrawer
      onClose={closeDebug}
      activeSessionId={activeSessionId}
      activeSession={activeSession ?? null}
      debugStats={sessionDebug?.debugStats ?? null}
      speedFactor={sessionDebug?.speedFactor ?? 1.25}
      lastRawPayload={sessionDebug?.lastRawPayload ?? null}
      lastAiPrompts={sessionDebug?.lastAiPrompts ?? null}
      lastKeyReport={sessionDebug?.lastKeyReport ?? null}
      lastPiiScrub={sessionDebug?.lastPiiScrub ?? null}
      aiErrors={activeSession?.aiErrors}
      onClearErrors={
        activeSessionId && activeSession?.aiErrors?.length
          ? () => updateSession(activeSessionId, { aiErrors: [] })
          : undefined
      }
    />
  );
}
