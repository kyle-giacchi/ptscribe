import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { checkGateCode, getStoredGateCode, storeGateCode } from '@/lib/gate';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';

const CODE_LENGTH = 6;

type Status = 'checking' | 'locked' | 'unlocked' | 'error';

export function AppGate({ children }: { children: ReactNode }) {
  // Initial status is derived synchronously from localStorage. If a stored
  // code exists we optimistically treat it as valid until the async hash
  // check below confirms or rejects it; this avoids a flash of the lock UI
  // for already-unlocked users.
  const [status, setStatus] = useState<Status>(() =>
    getStoredGateCode() ? 'unlocked' : 'locked',
  );
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = getStoredGateCode();
    if (!stored) return;
    let cancelled = false;
    void (async () => {
      const ok = await checkGateCode(stored);
      if (cancelled || ok) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile localStorage tampering
      setStatus('locked');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === 'locked') inputRef.current?.focus();
  }, [status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const ok = await checkGateCode(code);
    if (!ok) {
      setErrorMsg('Code not recognized.');
      setStatus('error');
      setCode('');
      return;
    }
    storeGateCode(code);
    setStatus('unlocked');
  }

  if (status === 'unlocked') return <>{children}</>;
  if (status === 'checking') return null;

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
      <div style={{ width: '100%', maxWidth: 380, display: 'grid', gap: 16 }}>
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
            <Lock size={18} strokeWidth={1.75} />
          </div>
          <div>
            <Eyebrow>PTScribe</Eyebrow>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-pt-text)',
                letterSpacing: '-0.01em',
              }}
            >
              Enter access code
            </div>
          </div>
        </div>

        <SurfaceCard padding={18}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--color-pt-text-2)',
                lineHeight: 1.5,
              }}
            >
              This is a private testing build. Enter the 6-digit code you were given.
            </p>
            <input
              ref={inputRef}
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
                setCode(next);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="••••••"
              style={{
                fontSize: 22,
                letterSpacing: '0.4em',
                textAlign: 'center',
                padding: '12px 14px',
              }}
              aria-label="6-digit access code"
              aria-invalid={status === 'error'}
            />
            {errorMsg && (
              <div style={{ fontSize: 12, color: 'var(--color-pt-danger, #c0392b)' }}>
                {errorMsg}
              </div>
            )}
            <PtButton
              variant="primary"
              type="submit"
              disabled={code.length !== CODE_LENGTH}
            >
              Unlock
            </PtButton>
          </form>
        </SurfaceCard>
      </div>
    </div>
  );
}
