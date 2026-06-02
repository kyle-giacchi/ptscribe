// worker/providers/anthropic.ts
//
// Anthropic Messages adapter. Ported verbatim from the original single-provider
// handleGenerate: /v1/messages, x-api-key, anthropic-version, top-level `system`
// blocks with an ephemeral cache_control when cacheSystem is on.

import type { BuildRequestInput, ProviderAdapter, ProviderRequest } from './types';
import { composeSystem, probeValidate } from './shared';

// MODEL CATALOG — confirmed (this is the pre-BYOK ALLOWED_GENERATE_MODELS list).
const MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'];

function buildRequest(input: BuildRequestInput): ProviderRequest {
  const finalSystem = composeSystem(input.system, input.modifierBlock);
  const cacheSystem = input.cacheSystem !== false;
  const systemBlocks = [
    cacheSystem
      ? { type: 'text', text: finalSystem, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: finalSystem },
  ];
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 2048,
      temperature: input.temperature ?? 0.2,
      system: systemBlocks,
      messages: [{ role: 'user', content: [{ type: 'text', text: input.user }] }],
    }),
  };
}

function extractText(json: unknown): string {
  const data = json as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  modelAllowlist: new Set(MODELS),
  consoleUrl: 'https://console.anthropic.com/settings/keys',
  keyHint: 'sk-ant-…',
  buildRequest,
  extractText,
  validateKey: (apiKey) =>
    probeValidate('https://api.anthropic.com/v1/models', {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }),
};
