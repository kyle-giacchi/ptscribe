import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { ChangePassphraseForm } from '@/components/vault/ChangePassphraseForm';
import { vault } from '@/lib/vault/vault';

export function VaultSecurityCard() {
  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Vault &amp; security</Eyebrow>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-pt-text-3)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Your data on this device is encrypted with your passphrase. The key lives in this tab and
          is cleared when you close it. Use Lock now if you need to hand the device over.
        </p>
        <ChangePassphraseForm />
        <div>
          <PtButton
            variant="ghost"
            onClick={() => {
              vault.lock();
              window.location.reload();
            }}
          >
            Lock now
          </PtButton>
        </div>
      </div>
    </SurfaceCard>
  );
}
