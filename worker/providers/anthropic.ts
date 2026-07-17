// worker/providers/anthropic.ts
//
// Anthropic Messages adapter. Ported verbatim from the original single-provider
// handleGenerate: /v1/messages, x-api-key, anthropic-version, top-level `system`
// blocks with an ephemeral cache_control when cacheSystem is on.

import type {
  BuildRequestInput,
  ProviderAdapter,
  ProviderModelDescriptor,
  ProviderRequest,
} from './types';
import { composeSystem, probeValidate } from './shared';

// MODEL CATALOG — confirmed (this is the pre-BYOK ALLOWED_GENERATE_MODELS list),
// ordered recommended-first.
const MODELS: ProviderModelDescriptor[] = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (most capable)' },
];

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
  label: 'Anthropic',
  models: MODELS,
  modelAllowlist: new Set(MODELS.map((m) => m.id)),
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
