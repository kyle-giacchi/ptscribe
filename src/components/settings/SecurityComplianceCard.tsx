import { useState } from 'react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { HipaaDisclosure } from '@/components/disclosures/HipaaDisclosure';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { vault } from '@/lib/vault/vault';

function describeVaultStatus(
  unlocked: boolean,
  initialized: boolean,
): { label: string; color: string } {
  if (!initialized) return { label: 'Vault: not initialized', color: 'var(--color-pt-text-3)' };
  if (unlocked) return { label: 'Vault: unlocked', color: '#16a34a' };
  return { label: 'Vault: locked', color: '#dc2626' };
}

function describeDisclosure(at: number | undefined, version: number | undefined): string {
  if (!at || !version) return '—';
  return `Disclosure v${version} acknowledged ${new Date(at).toLocaleDateString()}`;
}

// A1 "Security & compliance" summary card. Decision: keep the Vault & security
// and Data retention cards as-is (they own the actual mutators) and render a
// compact summary here that surfaces vault state, disclosure acknowledgement,
// and a re-show toggle. The summary footer cross-links to the detail cards
// rather than duplicating their selects.
export function SecurityComplianceCard() {
  const { clinician } = useClinician();
  const { settings } = useSettings();
  const [showFullDisclosure, setShowFullDisclosure] = useState(false);

  const vaultUnlocked = vault.isUnlocked();
  const vaultStatus = describeVaultStatus(vaultUnlocked, vault.isInitialized());
  const disclosureLine = describeDisclosure(
    clinician.acknowledgedDisclosureAt,
    settings.firstRun.disclosureVersion,
  );

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Security &amp; compliance</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: vaultStatus.color,
              flex: '0 0 auto',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-pt-text-1)' }}>{vaultStatus.label}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-pt-text-2)' }}>{disclosureLine}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {vaultUnlocked && (
            <PtButton
              variant="ghost"
              onClick={() => {
                vault.lock();
                window.location.reload();
              }}
            >
              Lock now
            </PtButton>
          )}
          <PtButton variant="ghost" onClick={() => setShowFullDisclosure((v) => !v)}>
            {showFullDisclosure ? 'Hide full disclosure' : 'Re-show full disclosure'}
          </PtButton>
        </div>
        {showFullDisclosure && <HipaaDisclosure variant="full" />}
        <p
          style={{
            fontSize: 11,
            color: 'var(--color-pt-text-3)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Idle-lock timing lives in the Vault &amp; security card above; audio retention lives in
          the Data retention card below.
        </p>
      </div>
    </SurfaceCard>
  );
}
