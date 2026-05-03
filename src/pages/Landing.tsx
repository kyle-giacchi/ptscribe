import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    label: 'Record the session',
    desc: 'Hands-free audio captured in your browser. No app, no extra hardware.',
  },
  {
    num: '02',
    label: 'Transcripts in seconds',
    desc: 'Whisper AI turns the visit into text while you wrap up with the patient.',
  },
  {
    num: '03',
    label: 'SOAP note, ready to sign',
    desc: 'Claude drafts a structured note. You review, edit, and sign off.',
  },
];

const C = {
  bg: 'var(--color-pt-landing-bg)',
  text: 'var(--color-pt-text)',
  text2: 'var(--color-pt-text-2)',
  text3: 'var(--color-pt-text-3)',
  accent: 'var(--color-pt-accent)',
  accentHover: 'var(--color-pt-accent-fg)',
  accentFg: 'var(--color-pt-accent-fg)',
  accentSoft: 'var(--color-pt-accent-soft)',
  border: 'var(--color-pt-border)',
  borderStrong: 'var(--color-pt-border-strong)',
  surface: 'var(--color-pt-surface)',
  danger: 'var(--color-pt-red)',
} as const;

interface LandingProps {
  onSignIn?: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

export function Landing({ onSignIn }: LandingProps) {
  const navigate = useNavigate();
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existing = document.getElementById('ldg-styles');
    if (existing) return;
    const s = document.createElement('style');
    s.id = 'ldg-styles';
    s.textContent = `
      @keyframes ldg-up {
        from { opacity: 0; transform: translateY(22px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .ldg-u  { animation: ldg-up 0.7s cubic-bezier(0.22,1,0.36,1) both; }
      .ldg-u1 { animation-delay: 0.04s; }
      .ldg-u2 { animation-delay: 0.14s; }
      .ldg-u3 { animation-delay: 0.24s; }
      .ldg-u4 { animation-delay: 0.34s; }
      @media (prefers-reduced-motion: reduce) { .ldg-u { animation: none; } }
      #ldg-h1   { text-wrap: balance; }
      #ldg-demo:hover  { background: ${C.accentHover} !important; }
      #ldg-setup:hover { border-color: ${C.accentFg} !important; }
      @media (max-width: 600px) {
        #ldg-nav  { padding: 16px 24px !important; }
        #ldg-hero { padding: 52px 24px 44px !important; }
        #ldg-mid  { padding: 0 24px 64px !important; }
        #ldg-disc { padding: 0 24px 48px !important; }
        #ldg-foot { padding: 0 24px 40px !important; }
        #ldg-ctas { flex-direction: column !important; align-items: stretch !important; }
        #ldg-ctas > button { text-align: center !important; }
      }
    `;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  function handleDemo() {
    if (!onSignIn) {
      navigate('/patients');
      return;
    }
    setShowCode(true);
    setCode('');
    setCodeError(null);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSignIn) return;
    setBusy(true);
    setCodeError(null);
    const result = await onSignIn(code);
    setBusy(false);
    if (!result.ok) {
      setCodeError(result.error ?? 'Invalid code. Try again.');
      setCode('');
      inputRef.current?.focus();
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* ── NAV ──────────────────────────────────────────────── */}
      <nav
        id="ldg-nav"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 48px',
          maxWidth: 1040,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', flexShrink: 0 }}>P</div>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>PTScribe</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: C.text3, border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 10px', textTransform: 'uppercase' }}>Beta</span>
          <button onClick={() => navigate('/login')} style={{ all: 'unset', fontSize: 13.5, fontWeight: 600, color: C.text2, cursor: 'pointer' }}>Sign in</button>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section
        id="ldg-hero"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '72px 48px 64px',
          maxWidth: 1040,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Ambient teal bloom — adds warmth, not glassmorphism */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 75% 55% at 50% -5%, oklch(64% 0.12 185 / 0.13) 0%, transparent 68%)',
            pointerEvents: 'none',
          }}
        />

        <div
          className="ldg-u ldg-u1"
          style={{ position: 'relative', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: C.accentFg, textTransform: 'uppercase', marginBottom: 24 }}
        >
          For Physical Therapists
        </div>

        <h1
          id="ldg-h1"
          className="ldg-u ldg-u2"
          style={{
            position: 'relative',
            margin: '0 0 24px',
            fontSize: 'clamp(52px, 9vw, 104px)',
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: '-0.04em',
            color: C.text,
          }}
        >
          Less charting.
          <br />
          More{' '}
          <span style={{ color: C.accent }}>care.</span>
        </h1>

        <p
          className="ldg-u ldg-u3"
          style={{
            position: 'relative',
            margin: '0 0 44px',
            fontSize: 18,
            lineHeight: 1.6,
            color: C.text2,
            maxWidth: 460,
          }}
        >
          PTScribe drafts your notes while you treat — so you finish the day with your patients, not
          your paperwork.
        </p>

        {!showCode ? (
          <div
            className="ldg-u ldg-u4"
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}
          >
            <div id="ldg-ctas" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                id="ldg-demo"
                onClick={handleDemo}
                style={{ all: 'unset', padding: '15px 40px', background: C.accent, borderRadius: 12, cursor: 'pointer', fontSize: 15.5, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em', transition: 'background 0.15s', boxSizing: 'border-box' }}
              >
                Try a demo
              </button>
              <button
                id="ldg-setup"
                onClick={() => navigate('/login')}
                style={{ all: 'unset', padding: '15px 40px', border: `1.5px solid ${C.borderStrong}`, borderRadius: 12, cursor: 'pointer', fontSize: 15.5, fontWeight: 600, color: C.text, boxSizing: 'border-box', transition: 'border-color 0.15s' }}
              >
                Set up your account
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.text3 }}>
              <Lock size={11} color={C.text3} strokeWidth={2} />
              <span style={{ fontSize: 12 }}>Encrypted at rest · AI calls sent over TLS</span>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ position: 'relative', width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text2 }}>Enter the 6-digit demo code</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (codeError) setCodeError(null); }}
                placeholder="••••••"
                style={{ flex: 1, padding: '12px 14px', border: `1.5px solid ${codeError ? C.danger : C.border}`, borderRadius: 10, outline: 'none', fontSize: 20, letterSpacing: '0.3em', textAlign: 'center', color: C.text, boxSizing: 'border-box', background: C.surface }}
              />
              <button
                type="submit"
                disabled={code.length !== 6 || busy}
                style={{ padding: '12px 18px', background: code.length === 6 && !busy ? C.accent : 'var(--color-pt-slate-soft)', border: 'none', borderRadius: 10, cursor: code.length === 6 && !busy ? 'pointer' : 'default', color: code.length === 6 && !busy ? '#ffffff' : C.text3, fontWeight: 700, fontSize: 14, transition: 'background 0.15s' }}
              >
                {busy ? '…' : 'Unlock'}
              </button>
            </div>
            {codeError && <div style={{ fontSize: 12, color: C.danger }}>{codeError}</div>}
            <button
              type="button"
              onClick={() => { setShowCode(false); setCode(''); setCodeError(null); }}
              style={{ all: 'unset', fontSize: 12, color: C.text3, cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              ← Back
            </button>
          </form>
        )}
      </section>

      {/* ── STEPS ────────────────────────────────────────────── */}
      <div
        id="ldg-mid"
        style={{ maxWidth: 1040, width: '100%', margin: '0 auto', padding: '0 48px 80px', boxSizing: 'border-box' }}
      >
        <div
          id="ldg-steps"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            borderRadius: 16,
            overflow: 'hidden',
            border: `1px solid ${C.border}`,
            background: C.border,
            gap: 1,
          }}
        >
          {STEPS.map(({ num, label, desc }) => (
            <div
              key={num}
              style={{
                padding: '36px 32px',
                background: C.surface,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  lineHeight: 1,
                  color: C.accent,
                  letterSpacing: '-0.04em',
                  fontVariantNumeric: 'tabular-nums',
                  marginBottom: 6,
                }}
              >
                {num}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                {label}
              </div>
              <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DISCLOSURE ───────────────────────────────────────── */}
      <div
        id="ldg-disc"
        style={{ maxWidth: 1040, width: '100%', margin: '0 auto', padding: '0 48px 52px', boxSizing: 'border-box' }}
      >
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.65 }}>
            <strong style={{ color: C.text2, fontWeight: 600 }}>PTScribe is not HIPAA-certified.</strong>{' '}
            Treat anything you record as PHI and confirm BAA terms with Cloudflare and Anthropic before using real patient data. Full disclosure is shown during setup.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.65 }}>
            <strong style={{ color: C.text2, fontWeight: 600 }}>Patient consent required</strong> — obtain explicit verbal or written consent before recording any session.
          </p>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer
        id="ldg-foot"
        style={{ maxWidth: 1040, width: '100%', margin: '0 auto', padding: '0 48px 48px', boxSizing: 'border-box' }}
      >
        <div style={{ fontSize: 13, color: C.text3, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span>
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} style={{ all: 'unset', color: C.accent, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Sign in</button>
          </span>
          <span style={{ color: C.border }}>·</span>
          <a href="mailto:support@ptscribe.app" style={{ color: C.accent, fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>support@ptscribe.app</a>
        </div>
      </footer>
    </div>
  );
}
