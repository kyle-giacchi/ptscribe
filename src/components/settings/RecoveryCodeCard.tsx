import { useState } from 'react';
import { toast } from 'sonner';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { RecoveryCodeReveal } from '@/components/vault/RecoveryCodeReveal';
import { vault } from '@/lib/vault/vault';
import { isDemoMode } from '@/lib/demoMode';

/**
 * Generate or regenerate the vault recovery code (ADR-0003). Regenerating
 * invalidates the previous code. Hidden in demo mode (the vault auto-unlocks).
 */
export function RecoveryCodeCard() {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Snapshot at mount; refreshed after we generate one.
  const [hasCode, setHasCode] = useState(() => vault.hasRecoveryCode());

  if (isDemoMode()) return null;

  const unlocked = vault.isUnlocked();

  async function handleGenerate() {
    setBusy(true);
    try {
      const code = await vault.setupRecoveryCode();
      setRevealed(code);
    } catch (e) {
      toast.error(`Could not generate a recovery code: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Recovery code</Eyebrow>
        {revealed ? (
          <RecoveryCodeReveal
            code={revealed}
            confirmLabel="I’ve saved my new recovery code"
            onAcknowledge={() => {
              setRevealed(null);
              setHasCode(true);
              toast.success('Recovery code saved. The previous code no longer works.');
            }}
          />
        ) : (
          <>
            <p
              style={{ margin: 0, fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}
            >
              {hasCode
                ? 'A recovery code is set. Regenerate it if you’ve lost it — this invalidates the old one.'
                : 'No recovery code yet. Generate one so a forgotten passphrase isn’t the end of your data.'}
            </p>
            {!unlocked && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-pt-text-3)' }}>
                Unlock the vault to manage your recovery code.
              </p>
            )}
            <div>
              <PtButton variant="ghost" onClick={handleGenerate} disabled={busy || !unlocked}>
                {busy
                  ? 'Generating…'
                  : hasCode
                    ? 'Regenerate recovery code'
                    : 'Generate recovery code'}
              </PtButton>
            </div>
          </>
        )}
      </div>
    </SurfaceCard>
  );
}
