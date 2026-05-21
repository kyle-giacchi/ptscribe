/**
 * Browser-side Anthropic client. Calls our hosted Worker at /api/generate;
 * the Worker forwards to api.anthropic.com using its server-side ANTHROPIC_API_KEY
 * secret. The browser never sees the key.
 */

import { apiFetch } from '@/lib/apiClient';
import { AiCallError, classifyResponse, type AiErrorKind } from '../errors';

export interface AnthropicMessageArgs {
  model: string;
  /** Raw template system prompt — WITHOUT the modifier block. The Worker
   *  appends the modifier block server-side so the string sent to Anthropic
   *  is always composed server-side, giving stable prompt-cache keys. */
  system: string;
  /** Pre-built modifier block (tone + emphasis + custom instruction).
   *  Forwarded to the Worker which appends it to the system prompt. */
  modifierBlock?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Cache the system prompt? Defaults to true. Saves money on repeat templates. */
  cacheSystem?: boolean;
  /** Called immediately before each backoff sleep. attempt is 1-based; max equals RETRY_DELAYS_MS.length. */
  onRetry?: (info: { attempt: number; max: number; reason: string }) => void;
}

export interface AnthropicResult {
  text: string;
}

const RETRY_DELAYS_MS = [5_000, 10_000, 25_000];
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export async function callAnthropic(args: AnthropicMessageArgs): Promise<AnthropicResult> {
  let lastErrorKind: AiErrorKind = 'network';
  let lastStatus: number | undefined;
  let lastRaw: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (args.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const res = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: args.model,
          system: args.system,
          modifierBlock: args.modifierBlock,
          user: args.user,
          maxTokens: args.maxTokens,
          temperature: args.temperature,
          cacheSystem: args.cacheSystem,
        }),
        signal: args.signal,
      });

      if (!res.ok) {
        const body = await safeReadText(res);
        lastStatus = res.status;
        lastRaw = body || res.statusText;

        if (!RETRYABLE_STATUSES.has(res.status)) {
          throw new AiCallError({
            kind: classifyResponse(res, 'anthropic'),
            provider: 'anthropic',
            status: res.status,
            attemptsMade: attempt,
            rawDetail: lastRaw,
            message: `Anthropic call failed (${res.status}): ${lastRaw}`,
          });
        }

        lastErrorKind = 'network';
        if (attempt === MAX_ATTEMPTS) {
          throw new AiCallError({
            kind: 'network',
            provider: 'anthropic',
            status: res.status,
            attemptsMade: attempt,
            rawDetail: lastRaw,
            message: `Anthropic call failed after ${attempt} attempts (${res.status})`,
          });
        }
        args.onRetry?.({ attempt, max: RETRY_DELAYS_MS.length, reason: String(res.status) });
        await sleep(RETRY_DELAYS_MS[attempt - 1], args.signal);
        continue;
      }

      const data = (await res.json()) as { text?: string; error?: string };
      if (typeof data.text !== 'string' || data.text.length === 0) {
        throw new AiCallError({
          kind: 'empty',
          provider: 'anthropic',
          status: res.status,
          attemptsMade: attempt,
          rawDetail: data.error,
          message: data.error || 'Anthropic returned no text content',
        });
      }
      return { text: data.text };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (err instanceof AiCallError) throw err;

      lastRaw = err instanceof Error ? err.message : String(err);
      lastErrorKind = 'network';
      if (attempt === MAX_ATTEMPTS) {
        throw new AiCallError({
          kind: lastErrorKind,
          provider: 'anthropic',
          status: lastStatus,
          attemptsMade: attempt,
          rawDetail: lastRaw,
          message: `Anthropic call failed after ${attempt} attempts: ${lastRaw}`,
        });
      }
      args.onRetry?.({ attempt, max: RETRY_DELAYS_MS.length, reason: 'network' });
      await sleep(RETRY_DELAYS_MS[attempt - 1], args.signal);
    }
  }

  throw new AiCallError({
    kind: lastErrorKind,
    provider: 'anthropic',
    status: lastStatus,
    attemptsMade: MAX_ATTEMPTS,
    rawDetail: lastRaw,
    message: 'Anthropic call failed',
  });
}

async function safeReadText(res: Response): Promise<string> {
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
