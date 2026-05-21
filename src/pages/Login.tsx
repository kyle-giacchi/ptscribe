import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { whisperLoader } from '@/services/ai/client/localWhisper';
import { MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { activateTestUserSession } from '@/contexts/AuthContext';

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

  useEffect(() => { void whisperLoader.ensureReady(); }, []);

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
        background: 'var(--color-pt-landing-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient teal bloom — matches Landing hero */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 75% 55% at 50% -5%, oklch(64% 0.12 185 / 0.13) 0%, transparent 68%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          background: 'var(--color-pt-surface)',
          borderRadius: 20,
          border: '1px solid var(--color-pt-border)',
          padding: '48px 56px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-banner)',
          maxWidth: 400,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--color-pt-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '0 auto 20px',
          }}
        >
          P
        </div>

        <h1
          style={{
            margin: '0 0 8px',
            color: 'var(--color-pt-text)',
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
              background: 'var(--color-pt-amber-soft)',
              border: '1px solid var(--color-pt-amber-border)',
              borderRadius: 10,
              fontSize: 13,
              color: 'var(--color-pt-amber-fg)',
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}

        {view === 'default' && (
          <>
            <p
              style={{ margin: '0 0 28px', color: 'var(--color-pt-text-2)', fontSize: 14, lineHeight: 1.6 }}
            >
              Sign in with your device passkey, or use a magic link sent to your email.
            </p>

            <button
              onClick={handlePasskey}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                background: loading ? 'var(--color-pt-text-3)' : 'var(--color-pt-accent)',
                color: '#ffffff',
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
                color: 'var(--color-pt-accent-fg)',
                border: '1.5px solid var(--color-pt-accent-border)',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Use magic link instead
            </button>

            <div
              style={{
                margin: '20px 0 4px',
                borderTop: '1px solid var(--color-pt-border)',
                paddingTop: 16,
              }}
            >
              <button
                onClick={() => {
                  activateTestUserSession();
                  navigate('/today', { replace: true });
                }}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: 'transparent',
                  color: 'var(--color-pt-text-3)',
                  border: '1px dashed var(--color-pt-border)',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.01em',
                }}
              >
                Login as Test User
              </button>
            </div>
          </>
        )}

        {view === 'magic-form' && (
          <>
            <p
              style={{ margin: '0 0 24px', color: 'var(--color-pt-text-2)', fontSize: 14, lineHeight: 1.6 }}
            >
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
                  border: '1.5px solid var(--color-pt-border)',
                  borderRadius: 10,
                  fontSize: 14,
                  color: 'var(--color-pt-text)',
                  background: 'var(--color-pt-surface)',
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
                  background: loading || !email ? 'var(--color-pt-text-3)' : 'var(--color-pt-accent)',
                  color: '#ffffff',
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
                color: 'var(--color-pt-text-3)',
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
              <MailCheck size={22} strokeWidth={1.75} />
            </div>
            <p style={{ margin: '0 0 8px', color: 'var(--color-pt-text)', fontSize: 15, fontWeight: 600 }}>
              Check your email
            </p>
            <p
              style={{ margin: '0 0 24px', color: 'var(--color-pt-text-2)', fontSize: 14, lineHeight: 1.6 }}
            >
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
                color: 'var(--color-pt-accent-fg)',
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
