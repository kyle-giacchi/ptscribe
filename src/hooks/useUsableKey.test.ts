import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const demoState = vi.hoisted(() => ({ demo: false }));
const settingsState = vi.hoisted(() => ({ provider: 'anthropic' as string, model: 'm' }));
const keysState = vi.hoisted(() => ({
  user: { signinRequired: false, keys: [] as Array<{ provider: string; set: boolean }> },
  org: { signinRequired: false, keys: [] as Array<{ provider: string; set: boolean }> },
}));

vi.mock('@/lib/demoMode', () => ({ isDemoMode: () => demoState.demo }));
vi.mock('@/contexts/SettingsProvider', () => ({
  useSettings: () => ({ settings: { ai: { generation: settingsState } } }),
}));
vi.mock('@/services/ai/keysClient', () => ({
  getUserKeys: () => Promise.resolve(keysState.user),
  getOrgKeys: () => Promise.resolve(keysState.org),
}));

import { useUsableKey } from './useUsableKey';

beforeEach(() => {
  demoState.demo = false;
  settingsState.provider = 'anthropic';
  keysState.user = { signinRequired: false, keys: [] };
  keysState.org = { signinRequired: false, keys: [] };
});

describe('useUsableKey', () => {
  it('is disabled in demo mode', () => {
    demoState.demo = true;
    const { result } = renderHook(() => useUsableKey());
    expect(result.current.state).toBe('disabled');
  });

  it('is disabled when provider is none', () => {
    settingsState.provider = 'none';
    const { result } = renderHook(() => useUsableKey());
    expect(result.current.state).toBe('disabled');
  });

  it('reports ready when a personal key is set for the active provider', async () => {
    keysState.user = { signinRequired: false, keys: [{ provider: 'anthropic', set: true }] };
    const { result } = renderHook(() => useUsableKey());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.personalSet).toBe(true);
  });

  it('reports ready via an org key when no personal key exists (personal → org)', async () => {
    keysState.org = { signinRequired: false, keys: [{ provider: 'anthropic', set: true }] };
    const { result } = renderHook(() => useUsableKey());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.personalSet).toBe(false);
    expect(result.current.orgSet).toBe(true);
  });

  it('reports missing when neither personal nor org key covers the provider', async () => {
    keysState.user = { signinRequired: false, keys: [{ provider: 'openai', set: true }] };
    const { result } = renderHook(() => useUsableKey());
    await waitFor(() => expect(result.current.state).toBe('missing'));
  });

  it('reports signin when the user keys call says signin is required', async () => {
    keysState.user = { signinRequired: true, keys: [] };
    const { result } = renderHook(() => useUsableKey());
    await waitFor(() => expect(result.current.state).toBe('signin'));
  });
});
