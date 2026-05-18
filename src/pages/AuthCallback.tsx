import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      navigate('/login?error=missing-token', { replace: true });
      return;
    }

    authClient.magicLink
      .verify({ query: { token } })
      .then(({ error }) => {
        if (error) {
          navigate('/login?error=invalid-link', { replace: true });
        } else {
          navigate(safePath(searchParams.get('from')), { replace: true });
        }
      })
      .catch(() => {
        navigate('/login?error=invalid-link', { replace: true });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
