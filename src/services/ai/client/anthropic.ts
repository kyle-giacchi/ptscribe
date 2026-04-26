/**
 * Browser-side Anthropic client. Calls our hosted Worker at /api/generate;
 * the Worker forwards to api.anthropic.com using its server-side ANTHROPIC_API_KEY
 * secret. The browser never sees the key.
 */

import { apiFetch } from '@/lib/apiClient';

export interface AnthropicMessageArgs {
  model: string; // e.g. 'claude-sonnet-4-6'
  system: string;
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

export async function callAnthropic(args: AnthropicMessageArgs): Promise<AnthropicResult> {
  const res = await apiFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      system: args.system,
      user: args.user,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      cacheSystem: args.cacheSystem,
    }),
    signal: args.signal,
  });

  if (!res.ok) {
    const errBody = await safeReadText(res);
    throw new Error(`Generate proxy failed (${res.status}): ${errBody || res.statusText}`);
  }
  const data = (await res.json()) as { text?: string; error?: string };
  if (typeof data.text !== 'string' || data.text.length === 0) {
    throw new Error(data.error || 'Generate proxy response had no text content');
  }
  return { text: data.text };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
