// worker/providers/openai.ts
//
// OpenAI Chat Completions adapter. System prompt rides as a `system` role
// message; OpenAI caches prompts automatically, so `cacheSystem` is a no-op.

import type {
  BuildRequestInput,
  ProviderAdapter,
  ProviderModelDescriptor,
  ProviderRequest,
} from './types';
import { composeSystem, probeValidate } from './shared';

// MODEL CATALOG — confirmed 2026-06-02 (owner: flagship tiers only, no mini).
// General-purpose chat models, ordered recommended-first; adjust the list,
// not the adapter, to change it.
const MODELS: ProviderModelDescriptor[] = [
  { id: 'gpt-4.1', label: 'GPT-4.1 (recommended)' },
  { id: 'gpt-4o', label: 'GPT-4o' },
];

function buildRequest(input: BuildRequestInput): ProviderRequest {
  const finalSystem = composeSystem(input.system, input.modifierBlock);
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 2048,
      temperature: input.temperature ?? 0.2,
      messages: [
        { role: 'system', content: finalSystem },
        { role: 'user', content: input.user },
      ],
    }),
  };
}

function extractText(json: unknown): string {
  const data = json as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

export const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  label: 'OpenAI',
  models: MODELS,
  modelAllowlist: new Set(MODELS.map((m) => m.id)),
  consoleUrl: 'https://platform.openai.com/api-keys',
  keyHint: 'sk-…',
  buildRequest,
  extractText,
  validateKey: (apiKey) =>
    probeValidate('https://api.openai.com/v1/models', {
      Authorization: `Bearer ${apiKey}`,
    }),
};
