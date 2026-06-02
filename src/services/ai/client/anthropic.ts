/**
 * Browser-side Anthropic client. Calls our hosted Worker at /api/generate;
 * the Worker forwards to the provider using its server-side key (BYOK). The
 * browser never sees the key.
 *
 * The retry loop, backoff, abort handling, and network/exhaustion errors live
 * in the shared {@link retryFetch} harness. This module keeps only what is
 * generate-specific: the JSON request body, `interceptGate: false`, the
 * retryable-status set, and the BYOK-aware error classification.
 */

import { apiFetch } from '@/lib/apiClient';
import { AiCallError, classifyError, type AiProvider } from '../errors';
import { retryFetch, safeReadText } from './retryFetch';

export interface AnthropicMessageArgs {
  /** BYOK provider the Worker should generate against. Defaults to 'anthropic'.
   *  Sent in the /api/generate body; the Worker resolves the user's key for it. */
  provider?: Extract<AiProvider, 'anthropic' | 'openai' | 'google'>;
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

export async function callAnthropic(args: AnthropicMessageArgs): Promise<AnthropicResult> {
  const provider = args.provider ?? 'anthropic';
  const label =
    provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'Google';

  const { response, attempts } = await retryFetch(
    {
      provider,
      label,
      retryableStatuses: RETRYABLE_STATUSES,
      delaysMs: RETRY_DELAYS_MS,
      signal: args.signal,
      onRetry: args.onRetry,
    },
    () =>
      apiFetch(
        '/api/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            model: args.model,
            system: args.system,
            modifierBlock: args.modifierBlock,
            user: args.user,
            maxTokens: args.maxTokens,
            temperature: args.temperature,
            cacheSystem: args.cacheSystem,
          }),
          signal: args.signal,
        },
        // Session-first route: a 401 is SIGNIN_REQUIRED / KEY_REJECTED (a provider/auth
        // signal we classify below), NOT a rejected gate code — don't let apiFetch wipe it.
        { interceptGate: false },
      ),
  );

  if (!response.ok) {
    const raw = await safeReadText(response);
    const detail = raw || response.statusText;
    // The Worker discriminates BYOK failures (NO_KEY, KEY_REJECTED, …) by a body
    // `code`, since 401/429 alone collide with auth/rate-limit. Read it from the raw body.
    throw new AiCallError({
      kind: classifyError(parseErrorCode(raw), response),
      provider,
      status: response.status,
      attemptsMade: attempts,
      rawDetail: detail,
      message: `${label} call failed (${response.status}): ${detail}`,
    });
  }

  const data = (await response.json()) as { text?: string; error?: string };
  if (typeof data.text !== 'string' || data.text.length === 0) {
    throw new AiCallError({
      kind: 'empty',
      provider,
      status: response.status,
      attemptsMade: attempts,
      rawDetail: data.error,
      message: data.error || `${label} returned no text content`,
    });
  }
  return { text: data.text };
}

/** Pull the Worker's `{ code }` discriminator out of an error body, if present. */
function parseErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return typeof parsed.code === 'string' ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}
