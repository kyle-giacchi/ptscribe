import { useRef } from 'react';

const ACTION_COOLDOWN_MS = 3000;

type ActionKind = 'transcribe' | 'generate';
type GuardResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Anti-double-tap cooldown for the transcribe/generate actions. This hook owns
 * **only** the 3-second cooldown — it deliberately does NOT track lifetime
 * per-session counts. The lifetime caps (`MAX_TRANSCRIBES_PER_SESSION`,
 * `MAX_GENERATES_PER_SESSION` in `@/types`) are enforced from the persisted
 * Session fields (`cloudTranscribeCount` in `useTranscriptSource`,
 * `generateCount` in `useGeneratePhase`) so they survive reload, Revert, and
 * Unlock. An in-memory count here would reset on reload and silently
 * contradict that invariant.
 */
export function useActionGuard() {
  const lastTranscribeAtRef = useRef(0);
  const lastGenerateAtRef = useRef(0);

  function checkActionGuard(kind: ActionKind): GuardResult {
    const now = Date.now();
    const lastAt = kind === 'transcribe' ? lastTranscribeAtRef.current : lastGenerateAtRef.current;
    const elapsed = now - lastAt;
    if (lastAt > 0 && elapsed < ACTION_COOLDOWN_MS) {
      const wait = Math.ceil((ACTION_COOLDOWN_MS - elapsed) / 1000);
      return { allowed: false, reason: `Please wait ${wait}s before retrying.` };
    }
    return { allowed: true };
  }

  function recordAction(kind: ActionKind) {
    if (kind === 'transcribe') {
      lastTranscribeAtRef.current = Date.now();
    } else {
      lastGenerateAtRef.current = Date.now();
    }
  }

  return { checkActionGuard, recordAction };
}
