/**
 * Browser-side Anthropic client. Calls our hosted Worker at /api/generate;
 * the Worker forwards to api.anthropic.com using its server-side ANTHROPIC_API_KEY
 * secret. The browser never sees the key.
 */

import type { ToneStyle } from '@/types';
import { apiFetch } from '@/lib/apiClient';

export interface AnthropicMessageArgs {
  model: string; // e.g. 'claude-sonnet-4-6'
  /** Raw template system prompt — WITHOUT the tone block. The Worker appends
   *  the tone block server-side from its static TONE_BLOCKS map so the exact
   *  string sent to Anthropic is always built from a constant, giving stable
   *  prompt-cache keys. */
  system: string;
  /** Tone style; forwarded to the Worker which appends the matching block.
   *  Defaults to 'narrative' if omitted. */
  toneStyle?: ToneStyle;
  user: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Cache the system prompt? Defaults to true. Saves money on repeat templates. */
  cacheSystem?: boolean;
}

export interface AnthropicResult {
  text: string;
}

const RETRY_DELAYS_MS = [1_000, 3_000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export async function callAnthropic(args: AnthropicMessageArgs): Promise<AnthropicResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (args.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    // Tracks throws that should propagate immediately without retrying (non-transient errors).
    let nonRetryable = false;
    try {
      const res = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: args.model,
          system: args.system,
          toneStyle: args.toneStyle,
          user: args.user,
          maxTokens: args.maxTokens,
          temperature: args.temperature,
          cacheSystem: args.cacheSystem,
        }),
        signal: args.signal,
      });

      if (!res.ok) {
        if (!RETRYABLE_STATUSES.has(res.status) || attempt === RETRY_DELAYS_MS.length) {
          nonRetryable = true;
          const errBody = await safeReadText(res);
          throw new Error(`Generate proxy failed (${res.status}): ${errBody || res.statusText}`);
        }
        lastError = new Error(`Generate proxy failed (${res.status}): ${res.statusText}`);
      } else {
        const data = (await res.json()) as { text?: string; error?: string };
        if (typeof data.text !== 'string' || data.text.length === 0) {
          nonRetryable = true;
          throw new Error(data.error || 'Generate proxy response had no text content');
        }
        return { text: data.text };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (nonRetryable || attempt === RETRY_DELAYS_MS.length) throw err;
      lastError = err;
    }

    await sleep(RETRY_DELAYS_MS[attempt], args.signal);
  }

  throw lastError instanceof Error ? lastError : new Error('Generate proxy request failed');
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
