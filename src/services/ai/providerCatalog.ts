/**
 * Client-side mirror of the Worker's provider/model catalog (worker/providers/*).
 * The Worker's per-adapter `models` list is the single source of truth for
 * ordering/labels; we fetch it once at module load via GET /api/providers and
 * cache it through a tiny useSyncExternalStore. FALLBACK_CATALOG (today's
 * known-good values) seeds the store immediately so nothing renders empty
 * while the fetch is in flight, and is kept if the fetch fails.
 */

import { useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/apiClient';
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

const FALLBACK_CATALOG: Record<KeyProvider, ProviderDescriptor> = {
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

let catalog: Record<KeyProvider, ProviderDescriptor> = FALLBACK_CATALOG;
const listeners = new Set<() => void>();

function isDescriptor(v: unknown): v is ProviderDescriptor {
  const d = v as Partial<ProviderDescriptor> | null;
  return (
    !!d &&
    typeof d.id === 'string' &&
    typeof d.label === 'string' &&
    Array.isArray(d.models) &&
    d.models.length > 0
  );
}

async function load() {
  try {
    const res = await apiFetch('/api/providers', { method: 'GET' }, { interceptGate: false });
    if (!res.ok) return;
    const body = (await res.json()) as { providers?: unknown };
    if (!Array.isArray(body.providers)) return;
    const next: Partial<Record<KeyProvider, ProviderDescriptor>> = {};
    for (const p of body.providers) {
      if (isDescriptor(p)) next[p.id as KeyProvider] = p;
    }
    // Only replace once every known provider resolved cleanly — a partial
    // response would otherwise silently drop a provider from the UI.
    if (Object.keys(next).length === Object.keys(FALLBACK_CATALOG).length) {
      catalog = next as Record<KeyProvider, ProviderDescriptor>;
      listeners.forEach((l) => l());
    }
  } catch {
    // keep FALLBACK_CATALOG
  }
}
void load();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live provider/model catalog, kept in sync with the Worker's registry. */
export function useProviderCatalog(): Record<KeyProvider, ProviderDescriptor> {
  return useSyncExternalStore(subscribe, () => catalog);
}

/** Plain (non-hook) read for event-handler callbacks, e.g. onChange provider pickers. */
export function defaultModelFor(provider: KeyProvider): string {
  return catalog[provider].models[0].id;
}
