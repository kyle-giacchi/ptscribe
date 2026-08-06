/**
 * Browser-side client for a *self-hosted* OpenAI-compatible chat server —
 * Ollama, LM Studio, llama.cpp server, vLLM, TGI behind a proxy.
 *
 * Unlike every other AI client here, this one calls the endpoint DIRECTLY: no
 * Worker, no gate header, no cookies (ADR-0011). There is no provider secret to
 * hide, and routing the transcript through our infrastructure to reach a box
 * sitting next to the clinician would be strictly worse for privacy.
 *
 * Transport/retry lives in the shared {@link retryFetch} harness; this module
 * owns the request shape, the model listing used by "Test connection", and the
 * error classification (a browser reports server-down, CORS, mixed content, and
 * private-network blocks as one indistinguishable fetch TypeError → `unreachable`).
 */

import { AiCallError, type AiProvider } from '../errors';
import { retryFetch, safeReadText } from './retryFetch';
import type { SelfHostedEndpoint, SelfHostedProvider } from '@/types';

export interface OpenAiCompatArgs {
  provider: SelfHostedProvider;
  endpoint: SelfHostedEndpoint;
  /** Full system prompt — composed client-side, modifier block already appended. */
  system: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; max: number; reason: string }) => void;
}

// A local box either answers or it doesn't — long cloud-style backoff just makes
// the user stare at a spinner.
const RETRY_DELAYS_MS = [2_000, 4_000];
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

/** Strip a trailing slash and a trailing `/v1` so both forms of pasted URL work. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

/**
 * Reject URLs the browser will silently refuse to fetch. An HTTPS page may call
 * `http://localhost` (trustworthy-origin exemption) but NOT `http://192.168.x.x` —
 * that request is blocked as mixed content with no useful error.
 * Returns an error message, or null when the URL is usable.
 */
export function validateEndpointUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(normalizeBaseUrl(raw));
  } catch {
    return 'Enter a full URL, e.g. http://localhost:11434';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return 'URL must start with http or https.';
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
    return 'Plain http:// works only for localhost. A server on your network must be reachable over https:// (put it behind a reverse proxy with a certificate).';
  }
  return null;
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

function authHeaders(endpoint: SelfHostedEndpoint): Record<string, string> {
  return endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {};
}

/** Send one chat completion and return the assistant text. */
export async function callOpenAiCompat(args: OpenAiCompatArgs): Promise<{ text: string }> {
  const base = normalizeBaseUrl(args.endpoint.baseUrl);
  const label = LABELS[args.provider];

  const { response, attempts } = await withUnreachable(args.provider, () =>
    retryFetch(
      {
        provider: args.provider,
        label,
        retryableStatuses: RETRYABLE_STATUSES,
        delaysMs: RETRY_DELAYS_MS,
        signal: args.signal,
        onRetry: args.onRetry,
      },
      () =>
        fetch(`${base}/v1/chat/completions`, {
          method: 'POST',
          // No gate header, no cookies: this endpoint is the user's own machine.
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json', ...authHeaders(args.endpoint) },
          body: JSON.stringify({
            model: args.endpoint.model,
            messages: [
              { role: 'system', content: args.system },
              { role: 'user', content: args.user },
            ],
            temperature: args.temperature ?? 0.2,
            stream: false,
            // Small local models drift off JSON badly. Servers that don't know this
            // field ignore it; Ollama and vLLM honour it.
            response_format: { type: 'json_object' },
          }),
          signal: args.signal,
        }),
    ),
  );

  if (!response.ok) {
    const detail = (await safeReadText(response)) || response.statusText;
    throw new AiCallError({
      kind: classifySelfHostedStatus(response.status),
      provider: args.provider,
      status: response.status,
      attemptsMade: attempts,
      rawDetail: detail,
      message: `${label} call failed (${response.status}): ${detail}`,
    });
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.length === 0) {
    throw new AiCallError({
      kind: 'empty',
      provider: args.provider,
      status: response.status,
      attemptsMade: attempts,
      message: `${label} returned no text content`,
    });
  }
  return { text };
}

export interface ConnectionTestResult {
  ok: boolean;
  /** Model IDs the server advertises — feeds the Settings model picker. */
  models: string[];
  /** Present when `ok` is false. */
  error?: AiCallError;
}

/**
 * `GET /v1/models` — doubles as the "Test connection" probe and the model
 * catalog for self-hosted endpoints (`providerCatalog` stays Worker-backed
 * BYOK metadata and is untouched).
 */
export async function testConnection(
  provider: SelfHostedProvider,
  endpoint: SelfHostedEndpoint,
  signal?: AbortSignal,
): Promise<ConnectionTestResult> {
  const base = normalizeBaseUrl(endpoint.baseUrl);
  try {
    const response = await fetch(`${base}/v1/models`, {
      credentials: 'omit',
      headers: authHeaders(endpoint),
      signal,
    });
    if (!response.ok) {
      const detail = (await safeReadText(response)) || response.statusText;
      throw new AiCallError({
        kind: classifySelfHostedStatus(response.status),
        provider,
        status: response.status,
        attemptsMade: 1,
        rawDetail: detail,
        message: `${LABELS[provider]} responded ${response.status}: ${detail}`,
      });
    }
    const data = (await response.json()) as { data?: { id?: unknown }[] };
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string');
    return { ok: true, models };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return { ok: false, models: [], error: toUnreachable(provider, err) };
  }
}

const LABELS: Record<SelfHostedProvider, string> = {
  local: 'Local model',
  network: 'In-network model',
};

function classifySelfHostedStatus(status: number) {
  if (status === 401 || status === 403) return 'key_rejected' as const;
  if (status === 404) return 'model_missing' as const;
  if (status === 429) return 'rate_limit' as const;
  return 'unreachable' as const;
}

/**
 * The retry harness reports transport failures as `network` ("check your
 * internet"), which is the wrong advice here — the endpoint is on the LAN or
 * this very machine. Re-label those as `unreachable`.
 */
async function withUnreachable<T>(provider: SelfHostedProvider, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AiCallError && err.kind === 'network') {
      throw toUnreachable(provider, err, err.attemptsMade);
    }
    throw err;
  }
}

function toUnreachable(provider: AiProvider, err: unknown, attempts = 1): AiCallError {
  if (err instanceof AiCallError && err.kind !== 'network') return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new AiCallError({
    kind: 'unreachable',
    provider,
    attemptsMade: attempts,
    rawDetail: detail,
    message: `Could not reach the endpoint: ${detail}`,
  });
}
