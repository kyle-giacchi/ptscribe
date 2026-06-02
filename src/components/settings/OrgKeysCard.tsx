import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { ProviderKeyCard } from './ProviderKeyCard';
import { PROVIDER_CATALOG } from '@/services/ai/providerCatalog';
import { getOrgKeys, type KeyProvider, type KeyStatus } from '@/services/ai/keysClient';

const PROVIDERS = Object.values(PROVIDER_CATALOG);

/**
 * Org-level AI provider keys (issue 09). Managers set/replace/remove the org's
 * shared key per provider; members inherit it at Generate when they have no
 * personal key (Worker resolution: personal → org → block). Non-managers see a
 * read-only signal so they understand why generation works without a personal key.
 *
 * Billing for an org key lands on the org owner's provider account — stated in copy.
 */
export function OrgKeysCard({ canManage }: { canManage: boolean }) {
  const [keys, setKeys] = useState<Record<string, KeyStatus> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOrgKeys().then((result) => {
      if (cancelled) return;
      const byProvider = result.signinRequired
        ? {}
        : Object.fromEntries(result.keys.map((k) => [k.provider, k]));
      setKeys(byProvider);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleStatus(provider: KeyProvider, status: KeyStatus) {
    setKeys((prev) => ({ ...(prev ?? {}), [provider]: status }));
  }

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <Eyebrow>AI provider keys</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0, lineHeight: 1.5 }}>
            {canManage
              ? 'Members with no personal key generate notes against the organization’s key. Billing lands on the organization owner’s provider account.'
              : 'Keys your organization provides. When set, you can generate notes without adding your own key.'}
          </p>
        </div>

        {keys === null ? (
          <div style={{ fontSize: 13, color: 'var(--color-pt-text-3)' }}>Loading key status…</div>
        ) : canManage ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {PROVIDERS.map((descriptor) => (
              <ProviderKeyCard
                key={descriptor.id}
                scope="org"
                descriptor={descriptor}
                status={keys[descriptor.id]}
                onStatusChange={(s) => handleStatus(descriptor.id, s)}
              />
            ))}
          </div>
        ) : (
          <ReadOnlyOrgKeys keys={keys} />
        )}
      </div>
    </SurfaceCard>
  );
}

function ReadOnlyOrgKeys({ keys }: { keys: Record<string, KeyStatus> }) {
  const present = PROVIDERS.filter((p) => keys[p.id]?.set);
  if (present.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-pt-text-3)', fontStyle: 'italic' }}>
        Your organization hasn’t configured an AI key yet.
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {present.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Check size={14} strokeWidth={2.5} style={{ color: 'var(--color-positive, #16794a)' }} />
          <span style={{ color: 'var(--color-pt-text)' }}>{p.label}</span>
          <span style={{ color: 'var(--color-pt-text-3)' }}>
            — provided by your organization ···· {keys[p.id]?.last4 ?? '????'}
          </span>
        </div>
      ))}
    </div>
  );
}
