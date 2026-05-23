import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';
import type { AiDebugPrompts, GenerateKeyReport } from '@/types';
import type { DebugDrawerStats } from '@/components/sessions/DebugDrawer';

/**
 * Live, session-scoped debug data pushed up from the active Session page so the
 * app-global drawer can render session panels without being a child of the
 * Session route. Held in memory only (mirrors the old in-Session drawer props);
 * the persistent error log lives on `Session.aiErrors` instead.
 */
/**
 * Snapshot of the most recent PII scrub run in the active session. The scrub
 * itself happens on-device in PIIScrubModal and isn't persisted; this is a
 * live, in-memory diagnostic so production "the scrub missed/over-redacted"
 * reports can be traced to the regex vs model breakdown and model-load state.
 */
export interface PiiScrubDebug {
  ts: number;
  /** 'regex' = instant structured pass only; 'deep' = NER model scan ran. */
  mode: 'regex' | 'deep';
  /** Structured identifiers matched by the synchronous regex pass. */
  regexCount: number;
  /** Extra spans the on-device NER model contributed beyond regex (deep only). */
  modelAdded: number;
  /** Total entities flagged for redaction in the active result. */
  entityTotal: number;
  /** Whether the NER model was already resident when this run started. */
  modelLoaded: boolean;
  /** Resolved PII model id (user override or default). */
  model: string;
  /** Failure message if a deep scan threw. */
  error?: string;
}

export interface SessionDebugData {
  debugStats: DebugDrawerStats | null;
  speedFactor: number;
  lastRawPayload?: string | null;
  lastAiPrompts?: AiDebugPrompts | null;
  lastKeyReport?: GenerateKeyReport | null;
  lastPiiScrub?: PiiScrubDebug | null;
}

interface DebugDrawerContextValue {
  open: boolean;
  openDebug: () => void;
  closeDebug: () => void;
  /** Session id whose panels the drawer currently reflects, or null when off-session. */
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  /** Live debug payload from the active Session page; null when off-session. */
  sessionDebug: SessionDebugData | null;
  setSessionDebug: (data: SessionDebugData | null) => void;
}

const DebugDrawerContext = createContext<DebugDrawerContextValue | null>(null);

export function DebugDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionDebug, setSessionDebug] = useState<SessionDebugData | null>(null);

  const openDebug = useCallback(() => setOpen(true), []);
  const closeDebug = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({
      open,
      openDebug,
      closeDebug,
      activeSessionId,
      setActiveSessionId,
      sessionDebug,
      setSessionDebug,
    }),
    [open, openDebug, closeDebug, activeSessionId, sessionDebug],
  );

  return <DebugDrawerContext.Provider value={value}>{children}</DebugDrawerContext.Provider>;
}

export function useDebugDrawer(): DebugDrawerContextValue {
  const ctx = useContext(DebugDrawerContext);
  if (!ctx) {
    throw new Error('useDebugDrawer must be used within a DebugDrawerProvider');
  }
  return ctx;
}
