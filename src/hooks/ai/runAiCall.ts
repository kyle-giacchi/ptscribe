import type { Dispatch } from 'react';
import { toast } from 'sonner';
import { appendAiError } from '@/lib/debug/aiErrorLog';
import type { SessionMachineAction } from '../sessionMachine/types';
import type { AiErrorEntry, Session } from '@/types';

/** Shared timeout for AI calls (generate, cloud transcribe). */
export const AI_CALL_TIMEOUT_MS = 180_000;

export interface AiCallErrorClassification {
  dispatchActions: SessionMachineAction[];
  entry: Omit<AiErrorEntry, 'id' | 'ts'>;
  toastMessage?: string;
}

export interface RunAiCallParams<TResult> {
  session: Session | undefined;
  dispatch: Dispatch<SessionMachineAction>;
  patchSession: (patch: Partial<Session>) => void;
  /** Dispatched (in order) before the call starts, e.g. `[{type:'generate/start'}]`. */
  startActions: SessionMachineAction[];
  busyStatus: Session['status'];
  errorStatus: Session['status'];
  execute: (signal: AbortSignal) => Promise<TResult>;
  /** Owns all success-path dispatch/patchSession calls. */
  onSuccess: (result: TResult) => void;
  classifyError: (error: unknown) => AiCallErrorClassification;
}

/**
 * Shared AI-call scaffolding: start dispatch, 180s abort timeout, and the
 * error-patch shape (aiErrors log + error dispatch + toast + status patch).
 * Success handling is fully owned by the caller via `onSuccess` since it
 * diverges too much (note merge vs. transcript promotion) to unify.
 */
export async function runAiCall<TResult>({
  session,
  dispatch,
  patchSession,
  startActions,
  busyStatus,
  errorStatus,
  execute,
  onSuccess,
  classifyError,
}: RunAiCallParams<TResult>): Promise<void> {
  for (const action of startActions) dispatch(action);
  patchSession({ status: busyStatus });

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), AI_CALL_TIMEOUT_MS);
  try {
    const result = await execute(controller.signal);
    onSuccess(result);
  } catch (e) {
    const { dispatchActions, entry, toastMessage } = classifyError(e);
    for (const action of dispatchActions) dispatch(action);
    if (toastMessage) toast.error(toastMessage);
    patchSession({
      status: errorStatus,
      aiErrors: appendAiError(session?.aiErrors, entry),
    });
  } finally {
    clearTimeout(abortTimer);
  }
}
