import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { vault } from '@/lib/vault/vault';
import { PASSPHRASE_MIN_CHARS } from '@/lib/vault/crypto';
import { migrateLegacyPlaintext } from '@/lib/vault/migration';
import { isDemoMode, getDemoPassphrase } from '@/lib/demoMode';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { audioRepository } from '@/services/AudioRepository';

type Mode = 'setup' | 'unlock';

export function VaultGate({ children }: { children: ReactNode }) {
  const demoMode = isDemoMode();
  const [mode] = useState<Mode>(() => (vault.isInitialized() ? 'unlock' : 'setup'));
  const [unlocked, setUnlocked] = useState<boolean>(vault.isUnlocked());
  const [autoUnlockTried, setAutoUnlockTried] = useState<boolean>(!demoMode);
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!demoMode || unlocked || autoUnlockTried) return;
    let cancelled = false;
    void (async () => {
      const demoPass = getDemoPassphrase();
      try {
        if (vault.isInitialized()) {
          const result = await vault.unlock(demoPass);
          if (!cancelled && result.ok) {
            setUnlocked(true);
          } else if (!cancelled) {
            // Stale vault from a prior non-demo visit: nuke local data and
            // re-init with the demo passphrase. The data is unrecoverable
            // anyway (we don't have the user's passphrase), so this just
            // saves the user from a dead-end prompt.
            await resetLocalDataForDemo();
            await vault.setup(demoPass);
            if (!cancelled) setUnlocked(true);
          }
        } else {
          await vault.setup(demoPass);
          await migrateLegacyPlaintext();
          if (!cancelled) setUnlocked(true);
        }
      } catch {
        // fall through — user will see the regular vault UI as a recovery path
      }
      if (!cancelled) setAutoUnlockTried(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [demoMode, unlocked, autoUnlockTried]);

  useEffect(() => {
    if (demoMode && !autoUnlockTried) return;
    if (!unlocked) inputRef.current?.focus();
  }, [unlocked, mode, demoMode, autoUnlockTried]);

  if (unlocked) return <>{children}</>;
  if (demoMode && !autoUnlockTried) return null;

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pass.length < PASSPHRASE_MIN_CHARS) {
      setError(`Passphrase must be at least ${PASSPHRASE_MIN_CHARS} characters.`);
      return;
    }
    if (pass !== confirm) {
      setError('Passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      await vault.setup(pass);
      await migrateLegacyPlaintext();
      setUnlocked(true);
    } catch (err) {
      setError((err as Error).message || 'Could not set up the vault.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await vault.unlock(pass);
      if (result.ok) {
        setUnlocked(true);
        setPass('');
      } else if (result.reason === 'bad_passphrase') {
        setError("Passphrase didn't match.");
        setPass('');
        inputRef.current?.focus();
      } else {
        setError('Vault is corrupt — see Settings to reset.');
      }
    } finally {
      setBusy(false);
    }
  }

  const isSetup = mode === 'setup';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-pt-bg)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'var(--color-pt-accent-soft)',
              color: 'var(--color-pt-accent-fg)',
            }}
          >
            {isSetup ? (
              <ShieldCheck size={18} strokeWidth={1.75} />
            ) : (
              <Lock size={18} strokeWidth={1.75} />
            )}
          </div>
          <div>
            <Eyebrow>Vault</Eyebrow>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-pt-text)',
                letterSpacing: '-0.01em',
              }}
            >
              {isSetup ? 'Encrypt your data' : 'Unlock your vault'}
            </div>
          </div>
        </div>

        <SurfaceCard padding={18}>
          <form
            onSubmit={isSetup ? handleSetup : handleUnlock}
            style={{ display: 'grid', gap: 12 }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--color-pt-text-2)',
                lineHeight: 1.5,
              }}
            >
              {isSetup ? (
                <>
                  Choose a passphrase. We use it to encrypt every record and recording on this
                  device. <strong>There is no recovery.</strong> If you forget your passphrase, your
                  data on this device is gone.
                </>
              ) : (
                <>This prompt appears each time you open a fresh tab.</>
              )}
            </p>

            <input
              ref={inputRef}
              className="input"
              type="password"
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Passphrase"
              aria-label="Passphrase"
              disabled={busy}
              style={{ padding: '10px 12px', fontSize: 14 }}
            />

            {isSetup && (
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm passphrase"
                aria-label="Confirm passphrase"
                disabled={busy}
                style={{ padding: '10px 12px', fontSize: 14 }}
              />
            )}

            {error && (
              <div style={{ fontSize: 12, color: 'var(--color-pt-danger, #c0392b)' }}>{error}</div>
            )}

            <PtButton variant="primary" type="submit" disabled={busy || pass.length === 0}>
              {busy ? 'Working…' : isSetup ? 'Encrypt and continue' : 'Unlock'}
            </PtButton>

            {isSetup && (
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: 'var(--color-pt-text-3)',
                  lineHeight: 1.5,
                }}
              >
                Your passphrase never leaves this device. Cloudflare Whisper and Anthropic still
                receive plaintext audio and text — that is required for transcription.
              </p>
            )}
          </form>
        </SurfaceCard>
      </div>
    </div>
  );
}

async function resetLocalDataForDemo(): Promise<void> {
  vault.lock();
  try {
    localStorage.removeItem(STORAGE_KEYS.vault);
    localStorage.removeItem(STORAGE_KEYS.appData);
  } catch {
    /* ignore — best-effort wipe */
  }
  try {
    await audioRepository.clear();
  } catch {
    /* ignore — IDB may be empty or unavailable */
  }
}
