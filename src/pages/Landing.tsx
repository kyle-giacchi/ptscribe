import { useEffect, useRef, useState } from 'react';
import { Play, Lock } from 'lucide-react';
import { Waveform } from '@/components/design';

const SOAP = [
  { key: 'S', text: 'Pt reports pain 3/10 with stair descent, improving wk-over-wk.' },
  { key: 'O', text: 'R knee flexion 128°, +7° vs prior visit. Quad MMT 4+/5.' },
  { key: 'A', text: 'Progressing as expected post R ACL reconstruction, Wk 8.' },
  { key: 'P', text: 'Add SL step-downs 3×10 to HEP. Re-eval plyo readiness in 2 wks.' },
];

interface LandingProps {
  onSignIn: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

export function Landing({ onSignIn }: LandingProps) {
  const [elapsed, setElapsed] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [mode, setMode] = useState<null | 'demo' | 'signup'>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inject keyframes + responsive styles
  useEffect(() => {
    const existing = document.getElementById('ldg-styles');
    if (existing) return;
    const s = document.createElement('style');
    s.id = 'ldg-styles';
    s.textContent = `
      @keyframes ldg-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(14,165,168,0.5); }
        70%  { box-shadow: 0 0 0 6px rgba(14,165,168,0); }
        100% { box-shadow: 0 0 0 0 rgba(14,165,168,0); }
      }
      @keyframes ldg-blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
      }
      @media (max-width: 740px) {
        #ldg-card  { grid-template-columns: 1fr !important; }
        #ldg-right { display: none !important; }
      }
    `;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  // Timer counting up
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // SOAP note reveal cycle: 0→1→2→3→4, hold, then reset
  useEffect(() => {
    let phase = 0;
    let holdCount = 0;
    const HOLD = 3; // ticks to hold at full before resetting
    const id = setInterval(() => {
      if (phase < 4) {
        phase++;
        setVisibleLines(phase);
      } else {
        holdCount++;
        if (holdCount >= HOLD) {
          phase = 0;
          holdCount = 0;
          setVisibleLines(0);
        }
      }
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function openMode(m: 'demo' | 'signup') {
    setMode(m);
    setCode('');
    setCodeError(null);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCodeError(null);
    const result = await onSignIn(code);
    setBusy(false);
    if (!result.ok) {
      setCodeError(result.error ?? 'Invalid code.');
      setCode('');
      inputRef.current?.focus();
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a2030',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Main card */}
      <div
        id="ldg-card"
        style={{
          width: '100%',
          maxWidth: 1060,
          background: '#ffffff',
          borderRadius: 20,
          display: 'grid',
          gridTemplateColumns: '1fr 1.22fr',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.2)',
        }}
      >
        {/* ── LEFT PANEL ─────────────────────────────────────── */}
        <div
          style={{
            padding: '40px 44px',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #e4e8ee',
            minHeight: 580,
            boxSizing: 'border-box',
          }}
        >
          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: '#0ea5a8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  flexShrink: 0,
                }}
              >
                P
              </div>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#1a2030',
                  letterSpacing: '-0.02em',
                }}
              >
                PTScribe
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#8893a5',
                border: '1px solid #e4e8ee',
                borderRadius: 20,
                padding: '3px 9px',
              }}
            >
              V0.1 · BETA
            </div>
          </div>

          {/* Headline block */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 0' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: '#0ea5a8',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              For Physical Therapists
            </div>
            <h1
              style={{
                margin: '0 0 20px 0',
                fontSize: 52,
                fontWeight: 900,
                lineHeight: 1.04,
                color: '#1a2030',
                letterSpacing: '-0.04em',
              }}
            >
              Less charting.
              <br />
              More care.
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 14.5,
                lineHeight: 1.7,
                color: '#5a6577',
                maxWidth: 340,
              }}
            >
              PTScribe drafts your notes while you treat — so you finish the day
              with your patients, not your paperwork.
            </p>
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === null ? (
              <>
                {/* Try a demo */}
                <button
                  onClick={() => openMode('demo')}
                  style={{
                    all: 'unset',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 16px',
                    background: '#0ea5a8',
                    borderRadius: 12,
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#0c9497')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#0ea5a8')}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: 'rgba(255,255,255,0.18)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Play size={12} fill="#fff" color="#fff" strokeWidth={0} />
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                    Try a demo
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    Demo Dr. → Demo Patient → live session
                  </span>
                </button>

                {/* Set up your account */}
                <button
                  onClick={() => openMode('signup')}
                  style={{
                    all: 'unset',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    border: '1.5px solid #e4e8ee',
                    borderRadius: 12,
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#9fdcdc')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e4e8ee')}
                >
                  <span style={{ fontSize: 14, color: '#1a2030', fontWeight: 500 }}>
                    Set up your account
                  </span>
                  <span style={{ fontSize: 12.5, color: '#8893a5' }}>Takes 30 seconds →</span>
                </button>
              </>
            ) : (
              <form
                onSubmit={handleSignIn}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#5a6577' }}>
                  {mode === 'demo'
                    ? 'Enter the 6-digit demo code'
                    : 'Enter your 6-digit access code'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    ref={inputRef}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      if (codeError) setCodeError(null);
                    }}
                    placeholder="••••••"
                    style={{
                      flex: 1,
                      padding: '11px 14px',
                      border: `1.5px solid ${codeError ? '#dc2942' : '#e4e8ee'}`,
                      borderRadius: 10,
                      outline: 'none',
                      fontSize: 20,
                      letterSpacing: '0.3em',
                      textAlign: 'center',
                      color: '#1a2030',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={code.length !== 6 || busy}
                    style={{
                      padding: '11px 18px',
                      background: code.length === 6 && !busy ? '#0ea5a8' : '#f1f3f7',
                      border: 'none',
                      borderRadius: 10,
                      cursor: code.length === 6 && !busy ? 'pointer' : 'default',
                      color: code.length === 6 && !busy ? '#fff' : '#8893a5',
                      fontWeight: 700,
                      fontSize: 14,
                      transition: 'background 0.15s',
                    }}
                  >
                    {busy ? '…' : 'Unlock'}
                  </button>
                </div>
                {codeError && (
                  <div style={{ fontSize: 12, color: '#dc2942' }}>{codeError}</div>
                )}
                <button
                  type="button"
                  onClick={() => { setMode(null); setCode(''); setCodeError(null); }}
                  style={{
                    all: 'unset',
                    fontSize: 12,
                    color: '#8893a5',
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  ← Back
                </button>
              </form>
            )}

            {/* HIPAA note */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingTop: 2,
              }}
            >
              <Lock size={11} color="#8893a5" strokeWidth={2} />
              <span style={{ fontSize: 11.5, color: '#8893a5' }}>
                HIPAA-aligned · audio never leaves your device unencrypted
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────── */}
        <div
          id="ldg-right"
          style={{
            background: 'linear-gradient(148deg, #f2fbfb 0%, #eaf8f7 55%, #f0fafa 100%)',
            padding: '32px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxSizing: 'border-box',
          }}
        >
          {/* Listening header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: '#fff',
                border: '1.5px solid #9fdcdc',
                borderRadius: 20,
                padding: '5px 12px 5px 9px',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#0ea5a8',
                  animation: 'ldg-pulse 2s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#0a6d70',
                  letterSpacing: '0.02em',
                }}
              >
                Listening
              </span>
            </div>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: '#5a6577',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.05em',
              }}
            >
              {fmt(elapsed)}
            </span>
          </div>

          {/* Waveform card */}
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: '16px 20px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: '#aab3bf',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Live Session
            </div>
            <Waveform micState="connected" height={64} />
          </div>

          {/* Draft note card */}
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: '16px 20px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
              flex: 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: '#aab3bf',
                  textTransform: 'uppercase',
                }}
              >
                Draft Note
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0a6d70',
                  background: '#e6f7f6',
                  border: '1px solid #9fdcdc',
                  borderRadius: 20,
                  padding: '2px 9px',
                  opacity: visibleLines > 0 ? 1 : 0,
                  transition: 'opacity 0.4s ease',
                }}
              >
                97% conf
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SOAP.map((line, i) => (
                <div
                  key={line.key}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    opacity: visibleLines > i ? 1 : 0,
                    transform: `translateY(${visibleLines > i ? 0 : 5}px)`,
                    transition: 'opacity 0.45s ease, transform 0.45s ease',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      borderRadius: 5,
                      background: '#e6f7f6',
                      border: '1px solid #9fdcdc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9.5,
                      fontWeight: 800,
                      color: '#0a6d70',
                      marginTop: 2,
                    }}
                  >
                    {line.key}
                  </div>
                  <span style={{ fontSize: 13, lineHeight: 1.55, color: '#1a2030' }}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview caption */}
          <div style={{ textAlign: 'center', fontSize: 12, color: '#8893a5', lineHeight: 1.5 }}>
            This is a preview — the demo gives you a fully interactive session.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 13,
          color: 'rgba(255,255,255,0.4)',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <span>
          Already have an account?{' '}
          <button
            onClick={() => openMode('signup')}
            style={{
              all: 'unset',
              color: '#0ea5a8',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Sign in
          </button>
        </span>
        <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
        <span>
          Need help?{' '}
          <a
            href="mailto:support@ptscribe.app"
            style={{ color: '#0ea5a8', fontWeight: 600, textDecoration: 'none' }}
          >
            support@ptscribe.app
          </a>
        </span>
      </div>
    </div>
  );
}
