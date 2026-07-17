import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const apiFetchMock = vi.fn();
vi.mock('@/lib/apiClient', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

beforeEach(() => {
  vi.resetModules();
  apiFetchMock.mockReset();
});

describe('providerCatalog', () => {
  it('replaces the fallback catalog once a full, valid /api/providers response resolves', async () => {
    apiFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          providers: [
            { id: 'anthropic', label: 'Anthropic (live)', models: [{ id: 'x', label: 'X' }] },
            { id: 'openai', label: 'OpenAI (live)', models: [{ id: 'y', label: 'Y' }] },
            { id: 'google', label: 'Google (live)', models: [{ id: 'z', label: 'Z' }] },
          ],
        }),
        { status: 200 },
      ),
    );

    const { useProviderCatalog } = await import('./providerCatalog');
    const { result } = renderHook(() => useProviderCatalog());

    await waitFor(() => expect(result.current.anthropic.label).toBe('Anthropic (live)'));
  });

  it('keeps the fallback catalog when the response is missing a provider', async () => {
    apiFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          providers: [
            { id: 'anthropic', label: 'Anthropic (live)', models: [{ id: 'x', label: 'X' }] },
          ],
        }),
        { status: 200 },
      ),
    );

    const { useProviderCatalog, defaultModelFor } = await import('./providerCatalog');
    const { result } = renderHook(() => useProviderCatalog());

    // Give the in-flight load() a tick to (not) resolve into the store.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.anthropic.label).toBe('Anthropic');
    expect(defaultModelFor('anthropic')).toBe('claude-sonnet-4-6');
  });

  it('keeps the fallback catalog on a network failure', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));

    const { useProviderCatalog } = await import('./providerCatalog');
    const { result } = renderHook(() => useProviderCatalog());

    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.openai.label).toBe('OpenAI');
  });
});
