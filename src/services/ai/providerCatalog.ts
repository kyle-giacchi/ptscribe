/**
 * Client-side BYOK provider/model catalog. A plain constant — it changes on
 * deploy, and the bundle redeploys with the Worker, so there is nothing to
 * fetch. Keep in sync with worker/providers/* when models change.
 */

import type { KeyProvider } from './keysClient';

interface ProviderModel {
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

const CATALOG: Record<KeyProvider, ProviderDescriptor> = {
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

/** Provider/model catalog. Hook-shaped for the existing call sites. */
export function useProviderCatalog(): Record<KeyProvider, ProviderDescriptor> {
  return CATALOG;
}

/** Plain (non-hook) read for event-handler callbacks, e.g. onChange provider pickers. */
export function defaultModelFor(provider: KeyProvider): string {
  return CATALOG[provider].models[0].id;
}
