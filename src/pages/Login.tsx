import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { authClient } from '@/lib/auth/client';

type View = 'default' | 'magic-form' | 'magic-sent';

const errorMessages: Record<string, string> = {
  'missing-token': 'The magic link was incomplete. Please request a new one.',
  'invalid-link': 'This magic link is invalid or has expired. Please request a new one.',
};

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<View>('default');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(
    errorMessages[searchParams.get('error') ?? ''] ?? null,
  );
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

  async function handlePasskey() {
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        setError(result.error.message ?? 'Passkey sign-in failed. Try again or use a magic link.');
      } else {
        navigate(from, { replace: true });
      }
    } catch {
      setError('Passkey sign-in failed. Try again or use a magic link.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: `/auth/callback?from=${encodeURIComponent(from)}`,
      });
      if (result?.error) {
        setError(result.error.message ?? 'Could not send magic link. Please try again.');
      } else {
        setView('magic-sent');
      }
    } catch {
      setError('Could not send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a2030',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: '48px 56px',
          textAlign: 'center',
          boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
          maxWidth: 400,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: '#0ea5a8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 18,
            fontWeight: 800,
            margin: '0 auto 20px',
          }}
        >
          P
        </div>

        <h1
          style={{
            margin: '0 0 8px',
            color: '#1a2030',
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.03em',
          }}
        >
          Sign in to PTScribe
        </h1>

        {error && (
          <div
            style={{
              margin: '16px 0',
              padding: '12px 16px',
              background: '#fff7ed',
              border: '1px solid #f59e0b',
              borderRadius: 10,
              fontSize: 13,
              color: '#92400e',
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}

        {view === 'default' && (
          <>
            <p style={{ margin: '0 0 28px', color: '#8893a5', fontSize: 14, lineHeight: 1.6 }}>
              Sign in with your device passkey, or use a magic link sent to your email.
            </p>

            <button
              onClick={handlePasskey}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                background: loading ? '#94a3b8' : '#0ea5a8',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: 12,
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in with Passkey'}
            </button>

            <button
              onClick={() => {
                setError(null);
                setView('magic-form');
              }}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                background: 'transparent',
                color: '#0ea5a8',
                border: '1.5px solid #0ea5a8',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Use magic link instead
            </button>
          </>
        )}

        {view === 'magic-form' && (
          <>
            <p style={{ margin: '0 0 24px', color: '#8893a5', fontSize: 14, lineHeight: 1.6 }}>
              Enter your email and we&apos;ll send you a sign-in link.
            </p>

            <form onSubmit={handleMagicLink}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%',
                  padding: '13px 14px',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 10,
                  fontSize: 14,
                  color: '#1a2030',
                  marginBottom: 12,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />

              <button
                type="submit"
                disabled={loading || !email}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading || !email ? '#94a3b8' : '#0ea5a8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loading || !email ? 'not-allowed' : 'pointer',
                  marginBottom: 12,
                }}
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>

            <button
              onClick={() => {
                setError(null);
                setView('default');
              }}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                color: '#8893a5',
                fontSize: 13,
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              ← Back
            </button>
          </>
        )}

        {view === 'magic-sent' && (
          <>
            <div
              style={{
                width: 48,
                height: 48,
                background: '#f0fdf4',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 22,
              }}
            >
              ✉️
            </div>
            <p style={{ margin: '0 0 8px', color: '#1a2030', fontSize: 15, fontWeight: 600 }}>
              Check your email
            </p>
            <p style={{ margin: '0 0 24px', color: '#8893a5', fontSize: 14, lineHeight: 1.6 }}>
              We sent a sign-in link to <strong>{email}</strong>. Click the link to continue.
            </p>
            <button
              onClick={() => {
                setView('default');
                setEmail('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#0ea5a8',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Use a different method
            </button>
          </>
        )}
      </div>
    </div>
  );
}
