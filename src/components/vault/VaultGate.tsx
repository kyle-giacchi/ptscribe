import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { vault } from '@/lib/vault/vault';
import { PASSPHRASE_MIN_CHARS } from '@/lib/vault/crypto';
import { migrateLegacyPlaintext } from '@/lib/vault/migration';
import { isDemoMode, getDemoPassphrase } from '@/lib/demoMode';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { audioRepository } from '@/services/AudioRepository';
import { dataRepository } from '@/services/DataRepository';
import { RecoveryCodeReveal } from './RecoveryCodeReveal';

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
  // First-run reveal: the recovery code generated right after vault setup, shown
  // once before the app is entered.
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState<string | null>(null);
  // Unlock screen: toggle to the "forgot passphrase → recovery code" path.
  const [recoveryMode, setRecoveryMode] = useState(false);

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
            // An initialized vault in this profile's namespace won't open with
            // the demo passphrase. Post-ADR-0007 this wipe is profile-scoped:
            // resetLocalDataForDemo() only touches the demo/test-user namespace
            // (STORAGE_KEYS getters), never a real `local`/`<userId>` profile —
            // so this cannot reach real clinical data. Reachable only when
            // getDemoPassphrase() changed out from under an existing demo vault;
            // that demo data is unrecoverable anyway, so re-init cleanly.
            // SAFETY DEPENDS ON: the wipe staying profile-scoped. See
            // docs/invariants.md §Profile-scoped storage.
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

  if (pendingRecoveryCode) {
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
        <div style={{ width: '100%', maxWidth: 460 }}>
          <RecoveryCodeReveal
            code={pendingRecoveryCode}
            onAcknowledge={() => {
              setPendingRecoveryCode(null);
              setUnlocked(true);
            }}
          />
        </div>
      </div>
    );
  }

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
      // Generate the recovery code and reveal it once before entering the app.
      // Best-effort: if generation fails, don't block setup — the user can make
      // one later from Settings.
      try {
        const code = await vault.setupRecoveryCode();
        setPendingRecoveryCode(code);
      } catch {
        setUnlocked(true);
      }
    } catch (err) {
      setError((err as Error).message || 'Could not set up the vault.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecoveryUnlock(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await vault.unlockWithRecoveryCode(pass);
      if (result.ok) {
        setUnlocked(true);
        setPass('');
      } else {
        setError('That recovery code didn’t match.');
        inputRef.current?.focus();
      }
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
            onSubmit={isSetup ? handleSetup : recoveryMode ? handleRecoveryUnlock : handleUnlock}
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
                  device. Next we’ll give you a <strong>one-time recovery code</strong> — keep it
                  safe; it’s how you get back in if you forget your passphrase.
                </>
              ) : recoveryMode ? (
                <>Enter the recovery code you saved when you set up the vault.</>
              ) : (
                <>This prompt appears each time you open a fresh tab.</>
              )}
            </p>

            <input
              ref={inputRef}
              className="input"
              type={recoveryMode ? 'text' : 'password'}
              autoComplete={isSetup ? 'new-password' : recoveryMode ? 'off' : 'current-password'}
              autoCapitalize="off"
              spellCheck={false}
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                if (error) setError(null);
              }}
              placeholder={recoveryMode ? 'Recovery code' : 'Passphrase'}
              aria-label={recoveryMode ? 'Recovery code' : 'Passphrase'}
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
              {busy
                ? 'Working…'
                : isSetup
                  ? 'Encrypt and continue'
                  : recoveryMode
                    ? 'Unlock with recovery code'
                    : 'Unlock'}
            </PtButton>

            {!isSetup && vault.hasRecoveryCode() && (
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode((v) => !v);
                  setPass('');
                  setError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 12,
                  color: 'var(--color-pt-accent-fg)',
                  cursor: 'pointer',
                  justifySelf: 'start',
                }}
              >
                {recoveryMode ? 'Use passphrase instead' : 'Forgot passphrase? Use a recovery code'}
              </button>
            )}

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
    dataRepository.clearCorruptData();
    localStorage.removeItem(STORAGE_KEYS.pageModes);
  } catch {
    /* ignore — best-effort wipe */
  }
  try {
    await audioRepository.clear();
  } catch {
    /* ignore — IDB may be empty or unavailable */
  }
}
