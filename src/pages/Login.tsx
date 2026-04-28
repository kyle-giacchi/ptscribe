export function Login() {
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
        <h1 style={{ margin: '0 0 8px', color: '#1a2030', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
          Sign in to PTScribe
        </h1>
        <p style={{ margin: '0 0 32px', color: '#8893a5', fontSize: 14, lineHeight: 1.6 }}>
          Full sign-in coming soon.
        </p>
        <div
          style={{
            padding: '14px 20px',
            background: '#f1f3f7',
            borderRadius: 12,
            fontSize: 13,
            color: '#5a6577',
          }}
        >
          This page is a placeholder — authentication will be built here.
        </div>
      </div>
    </div>
  );
}
