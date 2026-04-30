import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authClient } from '@/lib/auth/client';

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
          const from = searchParams.get('from') ?? '/';
          navigate(from, { replace: true });
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
        background: '#1a2030',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-teal-400" />
    </div>
  );
}
