// worker/providers/google.ts
//
// Google Gemini generateContent adapter. System prompt rides as
// `systemInstruction`; the key is a query param. No ephemeral cache flag for v1,
// so `cacheSystem` is a no-op.

import type { BuildRequestInput, ProviderAdapter, ProviderRequest } from './types';
import { composeSystem, mapValidateStatus } from './shared';

// MODEL CATALOG — confirmed 2026-06-02 (owner: 2.5 pro/flash + 2.0 flash).
const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'];

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function buildRequest(input: BuildRequestInput): ProviderRequest {
  const finalSystem = composeSystem(input.system, input.modifierBlock);
  return {
    // Key goes in the query string (Gemini's documented auth for the REST API).
    url: `${BASE}/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: finalSystem }] },
      contents: [{ role: 'user', parts: [{ text: input.user }] }],
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? 2048,
        temperature: input.temperature ?? 0.2,
      },
    }),
  };
}

function extractText(json: unknown): string {
  const data = json as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

export const googleAdapter: ProviderAdapter = {
  id: 'google',
  modelAllowlist: new Set(MODELS),
  consoleUrl: 'https://aistudio.google.com/app/apikey',
  keyHint: 'AIza…',
  buildRequest,
  extractText,
  // Gemini's key is a query param, not a header — probeValidate's header path
  // doesn't apply, so call the models-list endpoint directly.
  validateKey: async (apiKey) => {
    try {
      const res = await fetch(`${BASE}/models?key=${encodeURIComponent(apiKey)}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });
      return mapValidateStatus(res.status);
    } catch {
      return { ok: false, reason: 'network_error' };
    }
  },
};
