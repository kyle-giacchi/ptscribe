import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

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
          PTScribe
        </h1>

        <p style={{ margin: '0 0 32px', color: '#8893a5', fontSize: 14, lineHeight: 1.6 }}>
          AI-powered session notes for physical therapists.
        </p>

        {isLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '16px 0',
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '2px solid #e2e8f0',
                borderTopColor: '#0ea5a8',
                animation: 'spin 0.7s linear infinite',
              }}
            />
          </div>
        ) : isAuthenticated ? (
          <button
            onClick={() => navigate('/patients')}
            style={{
              width: '100%',
              padding: '14px',
              background: '#0ea5a8',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Open PTScribe →
          </button>
        ) : (
          <>
            <button
              onClick={() => navigate('/patients')}
              style={{
                width: '100%',
                padding: '14px',
                background: '#0ea5a8',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 12,
              }}
            >
              Try it free
            </button>

            <button
              onClick={() => navigate('/login')}
              style={{
                width: '100%',
                padding: '14px',
                background: 'transparent',
                color: '#0ea5a8',
                border: '1.5px solid #0ea5a8',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </>
        )}

        <p
          style={{
            marginTop: 24,
            color: '#b0bac8',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          No account required · Your data stays on your device
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
