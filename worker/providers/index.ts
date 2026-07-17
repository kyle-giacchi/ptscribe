// worker/providers/index.ts
//
// BYOK generation provider registry (ADR-0009, issue 02). One uniform interface
// over Anthropic / OpenAI / Google so the Worker can generate against any of them.
// Routing + key resolution are issue 03 — this module only exposes the adapters
// and a couple of pure lookups.

import type { ProviderAdapter, ProviderId, ProviderModelDescriptor } from './types';
import { anthropicAdapter } from './anthropic';
import { openaiAdapter } from './openai';
import { googleAdapter } from './google';

export * from './types';
export { composeSystem } from './shared';

const REGISTRY: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

/** Adapter for a provider id, or undefined if unknown. */
export function getProvider(provider: string): ProviderAdapter | undefined {
  return (REGISTRY as Record<string, ProviderAdapter>)[provider];
}

/**
 * True iff `model` is allowlisted for `provider`. The caller (issue 03) uses this
 * to reject an out-of-allowlist model BEFORE any upstream call — no provider key
 * is ever spent on an unapproved model.
 */
export function isModelAllowed(provider: string, model: string): boolean {
  return getProvider(provider)?.modelAllowlist.has(model) ?? false;
}

/** Non-secret provider descriptors for the client key-entry UI (issue 05). */
export function providerCatalog(): Array<{
  id: ProviderId;
  label: string;
  models: ProviderModelDescriptor[];
  consoleUrl: string;
  keyHint: string;
}> {
  return (Object.values(REGISTRY) as ProviderAdapter[]).map((a) => ({
    id: a.id,
    label: a.label,
    models: a.models,
    consoleUrl: a.consoleUrl,
    keyHint: a.keyHint,
  }));
}
