import { newId } from '@/utils/ids';
import type { AiErrorEntry } from '@/types';

/**
 * Max number of AI-error entries retained per session. The log is a ring buffer
 * (oldest dropped first) so it never grows unbounded inside the encrypted
 * AppData blob. Newest entries are kept; the Error log panel renders them
 * newest-first.
 */
export const AI_ERROR_LOG_CAP = 20;

/** Truncate raw model output stored on a content-failure entry. */
export const AI_ERROR_SNIPPET_MAX = 2000;

/**
 * Append a new AI-error entry to a session's capped log, stamping it with a
 * fresh id + timestamp. Pure: returns the next array, leaving the input intact.
 *
 * Callers MUST fold the returned array into a single `updateSession`/`patchSession`
 * write alongside any other field changes in the same synchronous block — never
 * chain a second mutator call, or the stale-closure snapshot will clobber it.
 */
export function appendAiError(
  existing: AiErrorEntry[] | undefined,
  input: Omit<AiErrorEntry, 'id' | 'ts'>,
): AiErrorEntry[] {
  const entry: AiErrorEntry = {
    id: newId(),
    ts: Date.now(),
    ...input,
    rawSnippet: input.rawSnippet?.slice(0, AI_ERROR_SNIPPET_MAX),
  };
  return [...(existing ?? []), entry].slice(-AI_ERROR_LOG_CAP);
}
