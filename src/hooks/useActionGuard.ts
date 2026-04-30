import { useRef, useState } from 'react';

export const MAX_TRANSCRIBES_PER_SESSION = 10;
export const MAX_GENERATES_PER_SESSION = 10;

const ACTION_COOLDOWN_MS = 3000;

type ActionKind = 'transcribe' | 'generate';
type GuardResult = { allowed: true } | { allowed: false; reason: string };

export function useActionGuard() {
  const lastTranscribeAtRef = useRef(0);
  const lastGenerateAtRef = useRef(0);
  const transcribeCountRef = useRef(0);
  const generateCountRef = useRef(0);
  const [transcribeUsed, setTranscribeUsed] = useState(0);
  const [generateUsed, setGenerateUsed] = useState(0);

  function checkActionGuard(kind: ActionKind): GuardResult {
    const now = Date.now();
    const lastAt = kind === 'transcribe' ? lastTranscribeAtRef.current : lastGenerateAtRef.current;
    const count = kind === 'transcribe' ? transcribeCountRef.current : generateCountRef.current;
    const max = kind === 'transcribe' ? MAX_TRANSCRIBES_PER_SESSION : MAX_GENERATES_PER_SESSION;
    if (count >= max) {
      return {
        allowed: false,
        reason: `Limit reached: ${max} ${kind}s per session. Reload to reset.`,
      };
    }
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
      transcribeCountRef.current += 1;
      setTranscribeUsed(transcribeCountRef.current);
    } else {
      lastGenerateAtRef.current = Date.now();
      generateCountRef.current += 1;
      setGenerateUsed(generateCountRef.current);
    }
  }

  return { checkActionGuard, recordAction, transcribeUsed, generateUsed };
}
