import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '@/contexts/SettingsProvider';
import { isDemoMode } from '@/lib/demoMode';
import { getUserKeys, getOrgKeys, type KeyProvider } from '@/services/ai/keysClient';

/**
 * Whether the active generation provider has a usable key, mirroring the Worker's
 * personal → org → block resolution (ADR-0009, issue 07).
 *
 * SOURCE-OF-TRUTH NOTE: this drives the onboarding hint and the reminder banner
 * ONLY. The Generate action itself never pre-blocks on this — it treats the
 * Worker's `NO_KEY` response as authoritative, so client and server can't disagree.
 *
 * - `disabled`: demo build or provider = none (BYOK not in play).
 * - `signin`:   not authenticated (shouldn't happen behind RequireAuth, but safe).
 * - `ready`:    a personal OR org key is set for the active provider.
 * - `missing`:  authenticated, BYOK on, but no usable key anywhere.
 */
export type UsableKeyState = 'loading' | 'ready' | 'missing' | 'signin' | 'disabled';

export interface UsableKey {
  state: UsableKeyState;
  provider: KeyProvider | null;
  personalSet: boolean;
  orgSet: boolean;
  recheck: () => void;
}

/** Async resolution outcome, tagged with the provider it was resolved for. */
interface Resolved {
  provider: KeyProvider | null;
  state: 'ready' | 'missing' | 'signin';
  personalSet: boolean;
  orgSet: boolean;
}

export function useUsableKey(): UsableKey {
  const { settings } = useSettings();
  const provider = settings.ai.generation.provider;
  const active: KeyProvider | null = provider === 'none' ? null : provider;
  const disabled = isDemoMode() || active === null;

  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [nonce, setNonce] = useState(0);

  // Bump nonce to force a refetch; clear the stale result so the hook reports
  // `loading` again. setState here lives in an event callback, not an effect body.
  const recheck = useCallback(() => {
    setResolved(null);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    void Promise.all([getUserKeys(), getOrgKeys()]).then(([user, org]) => {
      if (cancelled) return;
      if (user.signinRequired) {
        setResolved({ provider: active, state: 'signin', personalSet: false, orgSet: false });
        return;
      }
      const personal = user.keys.some((k) => k.provider === active && k.set);
      const orgKey = !org.signinRequired && org.keys.some((k) => k.provider === active && k.set);
      setResolved({
        provider: active,
        state: personal || orgKey ? 'ready' : 'missing',
        personalSet: personal,
        orgSet: orgKey,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [disabled, active, nonce]);

  if (disabled) {
    return { state: 'disabled', provider: active, personalSet: false, orgSet: false, recheck };
  }
  // A result tagged for a different provider is stale (provider just switched).
  if (!resolved || resolved.provider !== active) {
    return { state: 'loading', provider: active, personalSet: false, orgSet: false, recheck };
  }
  return {
    state: resolved.state,
    provider: active,
    personalSet: resolved.personalSet,
    orgSet: resolved.orgSet,
    recheck,
  };
}
