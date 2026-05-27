import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { authClient } from '@/lib/auth/client';

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

function deriveDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Macintosh|Mac OS/.test(ua)
      ? 'Mac'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Android/.test(ua)
          ? 'Android'
          : 'this device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${browser} on ${os}`;
}

type View = 'verifying' | 'offer-passkey';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<View>('verifying');
  const [busy, setBusy] = useState(false);
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
        if (typeof window.PublicKeyCredential !== 'undefined') {
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
    try {
      await authClient.passkey.addPasskey({ name: deriveDeviceName() });
    } catch {
      // Cancelled or unsupported — fall through and continue; they can add one later.
    } finally {
      navigate(dest.current, { replace: true });
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
              fontSize: 22,
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
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            Skip the email next time. Use your fingerprint, face, or device PIN to sign in to
            PTScribe on this device.
          </p>
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
              fontSize: 15,
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
              fontSize: 13,
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
