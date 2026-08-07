import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { deriveDeviceName, isPasskeySupported, passkeyError } from '@/lib/auth/passkey';

function safePath(raw: string | null): string {
  if (!raw) return '/';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

type View = 'verifying' | 'offer-passkey';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<View>('verifying');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dest = useRef('/');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      navigate('/login?error=missing-token', { replace: true });
      return;
    }
    dest.current = safePath(searchParams.get('from'));

    authClient.magicLink
      .verify({ query: { token } })
      .then(({ error }) => {
        if (error) {
          // The server reached us and rejected the token: genuinely expired/invalid.
          navigate('/login?error=invalid-link', { replace: true });
          return;
        }
        // Logged in. Offer a passkey if WebAuthn is available; otherwise go straight in.
        if (isPasskeySupported()) {
          setView('offer-passkey');
        } else {
          navigate(dest.current, { replace: true });
        }
      })
      .catch(() => {
        // We never got a verdict from the server — a transient/network error, not a
        // bad link. The token may still be valid, so don't tell the user it expired.
        navigate('/login?error=network', { replace: true });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddPasskey() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.passkey.addPasskey({ name: deriveDeviceName() });
      if (result?.error) {
        // Stay on the card so they can retry or skip — silently continuing here
        // would leave them believing they have a passkey when they don't.
        setError(passkeyError(result.error, 'register'));
        return;
      }
      navigate(dest.current, { replace: true });
    } catch (err) {
      setError(passkeyError(err, 'register'));
    } finally {
      setBusy(false);
    }
  }

  if (view === 'offer-passkey') {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-pt-landing-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background: 'var(--color-pt-surface)',
            borderRadius: 20,
            border: '1px solid var(--color-pt-border)',
            padding: '40px 44px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-banner)',
            maxWidth: 400,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              background: 'var(--color-pt-accent-soft)',
              border: '1px solid var(--color-pt-accent-border)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--color-pt-accent-fg)',
            }}
          >
            <KeyRound size={22} strokeWidth={1.75} />
          </div>
          <h1
            style={{
              margin: '0 0 8px',
              color: 'var(--color-pt-text)',
              fontSize: 'var(--text-xl)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            Add a passkey?
          </h1>
          <p
            style={{
              margin: '0 0 24px',
              color: 'var(--color-pt-text-2)',
              fontSize: 'var(--text-md)',
              lineHeight: 1.6,
            }}
          >
            Skip the email next time. Use your fingerprint, face, or device PIN to sign in to
            PTScribe on this device.
          </p>
          {error && (
            <div
              style={{
                margin: '0 0 16px',
                padding: '12px 14px',
                background: 'var(--color-pt-amber-soft)',
                border: '1px solid var(--color-pt-amber-border)',
                borderRadius: 10,
                fontSize: 'var(--text-base)',
                color: 'var(--color-pt-amber-fg)',
                textAlign: 'left',
              }}
            >
              {error}
            </div>
          )}
          <button
            onClick={handleAddPasskey}
            disabled={busy}
            style={{
              width: '100%',
              padding: '14px',
              background: busy ? 'var(--color-pt-text-3)' : 'var(--color-pt-accent)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 12,
              fontSize: 'var(--text-md)',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              marginBottom: 12,
            }}
          >
            {busy ? 'Setting up…' : 'Set up passkey'}
          </button>
          <button
            onClick={() => navigate(dest.current, { replace: true })}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-pt-text-3)',
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-pt-landing-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-pt-slate)] border-t-[var(--color-pt-accent)]" />
    </div>
  );
}
