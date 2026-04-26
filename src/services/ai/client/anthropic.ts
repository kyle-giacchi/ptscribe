/**
 * Minimal browser-side Anthropic Messages API client.
 *
 * The user supplies their own API key in Settings; the call goes directly
 * from the browser to api.anthropic.com. We use `fetch` (rather than the SDK)
 * so we don't pull in the SDK's Node-isms, and so the caller can wire
 * `prompt-cache-control` cleanly.
 */

export interface AnthropicCacheControl {
  type: 'ephemeral';
}

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicMessageArgs {
  apiKey: string;
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
  if (!args.apiKey) {
    throw new Error('Anthropic API key is missing. Add one in Settings.');
  }
  const cacheSystem = args.cacheSystem !== false;
  const systemBlocks: AnthropicTextBlock[] = [
    cacheSystem
      ? { type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: args.system },
  ];

  const body = {
    model: args.model,
    max_tokens: args.maxTokens ?? 2048,
    temperature: args.temperature ?? 0.2,
    system: systemBlocks,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: args.user }],
      },
    ],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!res.ok) {
    const errBody = await safeReadText(res);
    throw new Error(`Anthropic request failed (${res.status}): ${errBody || res.statusText}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (!text) throw new Error('Anthropic response had no text content');
  return { text };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
