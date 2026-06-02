/**
 * Non-secret, client-side descriptor for the BYOK generation providers
 * (ADR-0009, issue 05). Mirrors the Worker's per-provider model allowlists,
 * console URLs, and key hints (worker/providers/*). Kept in sync by hand — the
 * Worker remains the authority (it re-checks `isModelAllowed` before any spend),
 * so a drift here can only narrow the UI, never bypass a server guard.
 */

import type { KeyProvider } from './keysClient';

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderDescriptor {
  id: KeyProvider;
  label: string;
  models: ProviderModel[];
  /** Where the clinician mints a key. */
  consoleUrl: string;
  /** Visual prefix hint for the key-entry field. */
  keyHint: string;
}

export const PROVIDER_CATALOG: Record<KeyProvider, ProviderDescriptor> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (most capable)' },
    ],
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-4.1', label: 'GPT-4.1 (recommended)' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
    consoleUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
  },
  google: {
    id: 'google',
    label: 'Google',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (recommended)' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (fastest)' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'AIza…',
  },
};

/** The default model for a provider (first entry — the "recommended" one). */
export function defaultModelFor(provider: KeyProvider): string {
  return PROVIDER_CATALOG[provider].models[0].id;
}
