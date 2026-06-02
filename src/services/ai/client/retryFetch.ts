/**
 * Shared retry harness for the Worker-proxied AI clients (Nova transcribe,
 * BYOK generate). It owns ONLY the transport concerns that were copy-pasted
 * between the two clients: the attempt loop, abort checks, backoff sleep, the
 * onRetry callback, and the terminal AiCallError on network failure / retry
 * exhaustion.
 *
 * It is deliberately ignorant of request shape and success parsing — the
 * adapter supplies a `doFetch` thunk (URL, body, headers, interceptGate) and
 * classifies/parses whatever Response comes back. Error construction is split
 * by design: the harness builds the network/exhaustion errors it can see; the
 * adapter builds the status/empty errors only it understands (e.g. reading the
 * Worker's BYOK `code` out of the body).
 *
 * The per-call {@link RetryPolicy} is explicit so the historical drift between
 * the two clients — Nova retries 408/425, generate does not — is visible
 * configuration rather than logic buried in two near-identical loops.
 */

import { AiCallError, type AiProvider } from '../errors';

export interface RetryPolicy {
  /** Provider tag stamped onto terminal {@link AiCallError}s. */
  provider: AiProvider;
  /** Human label for terminal error messages, e.g. 'Nova', 'Anthropic'. */
  label: string;
  /** HTTP statuses worth retrying with backoff. Anything else is returned to the adapter. */
  retryableStatuses: ReadonlySet<number>;
  /** Backoff delays in ms; its length sets the retry count (attempts = length + 1). */
  delaysMs: readonly number[];
  signal?: AbortSignal;
  /** Fired immediately before each backoff sleep. `attempt` is 1-based; `max` equals delaysMs.length. */
  onRetry?: (info: { attempt: number; max: number; reason: string }) => void;
}

export interface RetryFetchResult {
  /**
   * The final HTTP Response: either `ok`, or a non-retryable failure. The body
   * is unconsumed so the adapter can read it for classification.
   */
  response: Response;
  /** 1-based attempt count when this Response arrived (feeds `AiCallError.attemptsMade`). */
  attempts: number;
}

/**
 * Run `doFetch` with retry/backoff under `policy`.
 *
 * - Response obtained that is `ok` OR carries a non-retryable status →
 *   resolves `{ response, attempts }`; the adapter owns `!response.ok` handling.
 * - Retryable status seen and retries exhausted → throws `AiCallError({ kind: 'network' })`.
 * - Transport error (fetch threw) and retries exhausted → throws `AiCallError({ kind: 'network' })`.
 * - `policy.signal` aborted → throws `DOMException('Aborted', 'AbortError')`, never wrapped.
 */
export async function retryFetch(
  policy: RetryPolicy,
  doFetch: () => Promise<Response>,
): Promise<RetryFetchResult> {
  const maxAttempts = policy.delaysMs.length + 1;
  let lastStatus: number | undefined;
  let lastRaw: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (policy.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const response = await doFetch();
      if (response.ok || !policy.retryableStatuses.has(response.status)) {
        return { response, attempts: attempt };
      }

      // Retryable failure: drain the body for the terminal message, then back off.
      lastStatus = response.status;
      lastRaw = (await safeReadText(response)) || response.statusText;
      if (attempt === maxAttempts) {
        throw new AiCallError({
          kind: 'network',
          provider: policy.provider,
          status: response.status,
          attemptsMade: attempt,
          rawDetail: lastRaw,
          message: `${policy.label} call failed after ${attempt} attempts (${response.status})`,
        });
      }
      policy.onRetry?.({ attempt, max: policy.delaysMs.length, reason: String(response.status) });
      await sleep(policy.delaysMs[attempt - 1], policy.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (err instanceof AiCallError) throw err;

      lastRaw = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) {
        throw new AiCallError({
          kind: 'network',
          provider: policy.provider,
          status: lastStatus,
          attemptsMade: attempt,
          rawDetail: lastRaw,
          message: `${policy.label} call failed after ${attempt} attempts: ${lastRaw}`,
        });
      }
      policy.onRetry?.({ attempt, max: policy.delaysMs.length, reason: 'network' });
      await sleep(policy.delaysMs[attempt - 1], policy.signal);
    }
  }

  // Unreachable: the final attempt always returns or throws above.
  throw new AiCallError({
    kind: 'network',
    provider: policy.provider,
    status: lastStatus,
    attemptsMade: maxAttempts,
    rawDetail: lastRaw,
    message: `${policy.label} call failed`,
  });
}

/** Read a Response body as text without throwing on a decode/stream error. */
export async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
