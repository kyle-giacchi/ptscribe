import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { whisperLoader } from '@/services/ai/client/localWhisper';
import { isDemoMode, DEMO_SESSION_ID } from '@/lib/demoMode';
import { CompareModal } from '@/components/landing/CompareModal';

interface LandingProps {
  onSignIn?: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

const STEP_TITLES = [
  'Record. Hands-free.',
  'Transcription in seconds.',
  'Your note, drafted.',
  'Ready to sign.',
];

const STEP_DESCS = [
  'No extra hardware — just your browser and a microphone.',
  'Whisper AI converts the session to text while you wrap up.',
  'Claude writes the SOAP structure from the transcript. You review, edit, and sign.',
  'Edit any section, then finalize. Your note stays on your device, encrypted.',
];

const NOTE_SECTIONS = [
  { label: 'Subjective', body: 'Patient reports improvement in pain from 6/10 to 4/10 since last visit. Reports increased tolerance for prolonged standing.' },
  { label: 'Objective', body: 'ROM: shoulder flexion 165° (↑ from 150°). MMT: deltoid 4/5. No compensation patterns observed.' },
  { label: 'Assessment', body: 'Patient progressing toward discharge goals. Pain and ROM improving.' },
  { label: 'Plan', body: 'Continue HEP with theraband series. Follow-up in 1 week.' },
];

function BrowserChrome({ url }: { url: string }) {
  return (
    <div style={{ height: 40, background: '#252d3d', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#dc2942' }} />
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#c47a09' }} />
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#4caf72' }} />
      </div>
      <div style={{ flex: 1, height: 22, background: 'rgba(255,255,255,0.08)', borderRadius: 999, margin: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#8893a5' }}>
        {url}
      </div>
    </div>
  );
}

function NoteRows({ darkBg }: { darkBg?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {NOTE_SECTIONS.map(({ label, body }) => (
        <div key={label} style={{ borderBottom: darkBg ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e4e8ee', padding: '12px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8893a5', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: darkBg ? 13 : 12, color: darkBg ? 'rgba(255,255,255,0.82)' : '#1a2030', lineHeight: 1.6 }}>{body}</div>
        </div>
      ))}
    </div>
  );
}

export function Landing({ onSignIn }: LandingProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showCode, setShowCode] = useState(() => !!(location.state as { showCode?: boolean } | null)?.showCode);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [section6Visible, setSection6Visible] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const sentinel1 = useRef<HTMLDivElement>(null);
  const sentinel2 = useRef<HTMLDivElement>(null);
  const sentinel3 = useRef<HTMLDivElement>(null);
  const cards5Ref = useRef<HTMLDivElement>(null);
  const section6Ref = useRef<HTMLDivElement>(null);

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

      @keyframes ldg-pulse-ring {
        0%   { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(1.5); opacity: 0; }
      }
      .ldg-record-ring {
        position: absolute; inset: -8px; border-radius: 999px;
        border: 2px solid #0ea5a8;
        animation: ldg-pulse-ring 1.5s cubic-bezier(0.22,1,0.36,1) infinite;
      }

      @keyframes ldg-wave {
        0%, 100% { transform: scaleY(0.3); }
        50%       { transform: scaleY(1); }
      }

      @keyframes ldg-blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
      }

      @keyframes ldg-spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      #ldg-h1 { text-wrap: balance; }
      #ldg-demo:hover      { background: #0a6d70 !important; }
      #ldg-setup:hover     { border-color: #0a6d70 !important; }
      .ldg-nav-cta:hover   { background: #0a6d70 !important; }
      #ldg-s6-demo:hover   { background: #0a6d70 !important; }

      @media (prefers-reduced-motion: reduce) { .ldg-u, .ldg-record-ring { animation: none; } }
      @media (max-width: 600px) {
        #ldg-hero { padding: 52px 24px 44px !important; }
        #ldg-disc { padding: 0 24px 48px !important; }
        #ldg-foot { padding: 0 24px 40px !important; }
        #ldg-ctas { flex-direction: column !important; align-items: stretch !important; }
        #ldg-ctas > button { text-align: center !important; }
      }
      @media (max-width: 768px) {
        .ldg-cards-grid { grid-template-columns: 1fr !important; }
      }
    `;
    document.head.appendChild(s);
    return () => document.getElementById('ldg-styles')?.remove();
  }, []);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    ([
      [sentinel1, 1],
      [sentinel2, 2],
      [sentinel3, 3],
    ] as [React.RefObject<HTMLDivElement>, number][]).forEach(([ref, step]) => {
      if (!ref.current) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setWorkflowStep(step); },
        { threshold: 0.5 }
      );
      obs.observe(ref.current);
      observers.push(obs);
    });
    return () => observers.forEach(o => o.disconnect());
  }, []);

  useEffect(() => {
    if (!cards5Ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setCardsVisible(true); },
      { threshold: 0.2 }
    );
    obs.observe(cards5Ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!section6Ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setSection6Visible(true); },
      { threshold: 0.5 }
    );
    obs.observe(section6Ref.current);
    return () => obs.disconnect();
  }, []);

  function handleDemo() {
    void whisperLoader.ensureReady().catch(() => {});
    if (!onSignIn) {
      // Deep-link target after the gate unlocks. In demo mode this must be the
      // demo session — not /today — so DemoBootstrap drops the user straight into
      // the session (and its "Welcome back" prompt) rather than flashing the
      // logged-in dashboard behind the prompt while its redirect is suspended.
      const target = isDemoMode() ? `/sessions/${DEMO_SESSION_ID}` : '/today';
      navigate(target, { state: { showCode: true } });
      return;
    }
    setShowCode(true);
    setCode('');
    setCodeError(null);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function handleLogin() {
    void whisperLoader.ensureReady().catch(() => {});
    navigate('/login');
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

  const screenStyle = (step: number): React.CSSProperties => ({
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: workflowStep === step ? 1 : 0,
    zIndex: workflowStep === step ? 1 : 0,
    transition: 'opacity 500ms ease-out',
    background: 'white',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 80% 50% at 50% 0%, oklch(64% 0.12 185 / 0.13) 0%, transparent 65%), #f4f6f9',
      fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── NAV: The Floating Island ──────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
        background: '#1a2030', borderRadius: 999, padding: '10px 10px 10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        boxShadow: '0 4px 16px rgba(26,32,48,0.18)',
        minWidth: 360, maxWidth: 600, width: 'calc(100% - 48px)', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: '#0ea5a8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em',
          }}>P</div>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>PTScribe</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 20, padding: '3px 10px',
          }}>Beta</span>
          <button
            className="ldg-nav-cta"
            onClick={handleDemo}
            style={{
              padding: '9px 20px', background: '#0ea5a8', borderRadius: 999,
              color: 'white', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
              transition: 'background 150ms ease-out',
            }}
          >
            Try Demo
          </button>
        </div>
      </nav>

      {/* ── HERO: The Quiet Promise ───────────────────────────── */}
      <section
        id="ldg-hero"
        style={{
          padding: '100px 48px 64px', maxWidth: 1040, width: '100%',
          margin: '0 auto', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div className="ldg-u ldg-u1" style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: '#0a6d70', marginBottom: 24,
        }}>
          For Physical Therapists
        </div>

        <h1
          id="ldg-h1"
          className="ldg-u ldg-u2"
          style={{
            margin: '0 0 24px',
            fontSize: 'clamp(52px, 9vw, 104px)', fontWeight: 900,
            lineHeight: 1.0, letterSpacing: '-0.04em', color: '#1a2030',
          }}
        >
          Better care,
          <br />
          less <span style={{ color: '#0ea5a8' }}>work.</span>
        </h1>

        <p
          className="ldg-u ldg-u3"
          style={{ margin: '0 0 44px', fontSize: 18, lineHeight: 1.6, color: '#5a6577', maxWidth: 480 }}
        >
          PTScribe writes your notes while you treat — so you finish the day with your patients, not your paperwork.
        </p>

        {!showCode ? (
          <div className="ldg-u ldg-u4" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
            <div id="ldg-ctas" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                id="ldg-demo"
                onClick={handleDemo}
                style={{
                  padding: '15px 40px', background: '#0ea5a8', borderRadius: 12,
                  color: 'white', fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em',
                  border: 'none', cursor: 'pointer', transition: 'background 150ms ease-out',
                  boxSizing: 'border-box',
                }}
              >
                Try Demo
              </button>
              <button
                id="ldg-setup"
                onClick={handleLogin}
                style={{
                  padding: '15px 40px', border: '1.5px solid #d6dce5', borderRadius: 12,
                  background: 'transparent', color: '#1a2030', fontSize: 15.5, fontWeight: 600,
                  cursor: 'pointer', transition: 'border-color 150ms ease-out',
                  boxSizing: 'border-box',
                }}
              >
                Set up your account
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8893a5' }}>
              <Lock size={11} color="#8893a5" strokeWidth={2} />
              <span style={{ fontSize: 12 }}>Encrypted at rest · AI calls sent over TLS</span>
            </div>
            <button
              onClick={() => setCompareOpen(true)}
              style={{
                all: 'unset', cursor: 'pointer',
                fontSize: 13, color: '#8893a5',
                borderBottom: '1px dashed rgba(136,147,165,0.5)',
                lineHeight: 1.4, paddingBottom: 1,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                transition: 'color 150ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#1a2030')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8893a5')}
            >
              How does PTScribe compare to Heidi Clinician? →
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ maxWidth: 300, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#5a6577' }}>Enter the 6-digit demo code</div>
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
                  flex: 1, padding: '12px 14px',
                  border: `1.5px solid ${codeError ? '#dc2942' : '#e4e8ee'}`,
                  borderRadius: 10, outline: 'none', fontSize: 20,
                  letterSpacing: '0.3em', textAlign: 'center', color: '#1a2030',
                  boxSizing: 'border-box', background: 'white',
                }}
              />
              <button
                type="submit"
                disabled={code.length !== 6 || busy}
                style={{
                  padding: '12px 18px', borderRadius: 10, border: 'none',
                  background: code.length === 6 && !busy ? '#0ea5a8' : '#f1f3f7',
                  color: code.length === 6 && !busy ? 'white' : '#8893a5',
                  fontWeight: 700, fontSize: 14,
                  cursor: code.length === 6 && !busy ? 'pointer' : 'default',
                  transition: 'background 150ms',
                }}
              >
                {busy ? '…' : 'Unlock'}
              </button>
            </div>
            {codeError && <div style={{ fontSize: 12, color: '#dc2942' }}>{codeError}</div>}
            <button
              type="button"
              onClick={() => { setShowCode(false); setCode(''); setCodeError(null); }}
              style={{ all: 'unset', fontSize: 12, color: '#8893a5', cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              ← Back
            </button>
          </form>
        )}
      </section>

      {/* ── SECTION 2: The Session Reel ──────────────────────── */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 24px 80px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ background: '#ffffff', borderRadius: 24, padding: '64px 48px', position: 'relative' }}>

          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, color: '#1a2030',
            letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 64px',
          }}>
            PTScribe turns every visit into a finished note.
          </h2>

          <div style={{ position: 'sticky', top: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>

            {/* Browser mockup */}
            <div style={{
              width: 680, maxWidth: '100%', background: '#1a2030', borderRadius: 16,
              boxShadow: '0 24px 64px rgba(26,32,48,0.24)', overflow: 'hidden',
            }}>
              <BrowserChrome url="ptscribe.app/session/sarah-m" />

              {/* Screen area */}
              <div style={{ minHeight: 480, background: '#f4f6f9', position: 'relative' }}>

                {/* Step 0: Record */}
                <div style={{ ...screenStyle(0), padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1a2030' }}>Sarah M. — Follow-up Visit</div>
                  <div style={{ position: 'relative', width: 80, height: 80 }}>
                    <div className="ldg-record-ring" />
                    <div style={{
                      width: 80, height: 80, borderRadius: 999, background: '#0ea5a8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </div>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 400, color: '#8893a5', fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', monospace" }}>00:00</div>
                  <div style={{ fontSize: 13, color: '#8893a5' }}>Tap to begin recording</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} style={{ width: 4, height: 4, background: '#e4e8ee', borderRadius: 999 }} />
                    ))}
                  </div>
                </div>

                {/* Step 1: Transcribing */}
                <div style={{ ...screenStyle(1), padding: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 999, background: '#dc2942', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 12, height: 12, background: 'white', borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: '#1a2030', fontWeight: 500 }}>03:42</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', marginTop: 16, height: 40 }}>
                    {[0, 80, 160, 240, 320].map((delay, i) => (
                      <div key={i} style={{
                        width: 5, height: 32, background: '#0ea5a8', borderRadius: 999,
                        transformOrigin: 'bottom center',
                        animation: `ldg-wave 0.8s ease-in-out ${delay}ms infinite`,
                        display: 'inline-block',
                      }} />
                    ))}
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#8893a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Transcript</div>
                    {[
                      'Patient reports pain level 4 out of 10 today, down from 6...',
                      'Range of motion improved approximately 15 degrees since last visit...',
                      'Tolerated all exercises without compensation patterns...',
                    ].map((text, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: '#f4f6f9', borderRadius: 8, marginBottom: 6, fontSize: 13, color: '#1a2030', lineHeight: 1.5, display: 'flex', alignItems: 'center' }}>
                        {text}
                        {i === 2 && <span style={{ marginLeft: 2, animation: 'ldg-blink 1s step-start infinite' }}>▌</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step 2: Generating */}
                <div style={{ ...screenStyle(2), padding: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6f5acc" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'ldg-spin 1s linear infinite', flexShrink: 0 }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span style={{ fontSize: 13, color: '#6f5acc', fontWeight: 600 }}>Generating note...</span>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <NoteRows />
                  </div>
                </div>

                {/* Step 3: Ready */}
                <div style={{ ...screenStyle(3), padding: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ background: '#e6f7f6', color: '#0a6d70', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>Ready</div>
                    <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5a6577' }}>Sarah M. — Follow-up</div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <NoteRows />
                  </div>
                  <button style={{ padding: '12px 20px', background: '#0ea5a8', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 700, width: '100%', textAlign: 'center', border: 'none', cursor: 'pointer', marginTop: 20, display: 'block' }}>
                    Finalize Note →
                  </button>
                </div>

              </div>
            </div>

            {/* Sub-headline */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 28, fontWeight: 700, color: '#1a2030', letterSpacing: '-0.02em', margin: 0 }}>
                {STEP_TITLES[workflowStep]}
              </h3>
              <p style={{ fontSize: 16, color: '#5a6577', maxWidth: 440, textAlign: 'center', margin: 0 }}>
                {STEP_DESCS[workflowStep]}
              </p>
            </div>

          </div>

          {/* Spacer with sentinels */}
          <div style={{ height: 4800, position: 'relative' }}>
            <div ref={sentinel1} style={{ position: 'absolute', top: 1200, height: 1, pointerEvents: 'none' }} />
            <div ref={sentinel2} style={{ position: 'absolute', top: 2400, height: 1, pointerEvents: 'none' }} />
            <div ref={sentinel3} style={{ position: 'absolute', top: 3600, height: 1, pointerEvents: 'none' }} />
          </div>

        </div>
      </div>

      {/* ── SECTION 3: The Clinical Compass ──────────────────── */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '80px 48px', boxSizing: 'border-box', width: '100%' }}>
        <h2 style={{
          fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, color: '#1a2030',
          letterSpacing: '-0.02em', margin: '0 0 12px',
        }}>
          Every visit type, covered.
        </h2>
        <p style={{ fontSize: 18, color: '#5a6577', lineHeight: 1.55, maxWidth: 560, margin: '0 0 40px' }}>
          From initial evaluations to discharge summaries — PTScribe handles them all.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Evaluation', bg: '#6f5acc' },
            { label: 'SOAP', bg: '#0ea5a8' },
            { label: 'Progress', bg: '#c47a09' },
            { label: 'Discharge', bg: '#7c8699' },
          ].map(({ label, bg }) => (
            <div key={label} style={{
              borderRadius: 999, padding: '10px 22px',
              background: bg, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'default',
            }}>
              {label}
            </div>
          ))}
        </div>

        {/* Dark note card */}
        <div style={{
          marginTop: 60, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto',
          background: '#1a2030', borderRadius: 20, padding: 32,
          boxShadow: '0 4px 16px rgba(26,32,48,0.10)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>SOAP Note — Follow-up</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: '#0ea5a8' }} />
              <span style={{ fontSize: 11, color: '#0ea5a8', fontWeight: 600 }}>Ready</span>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <NoteRows darkBg />
          </div>
          <button style={{
            padding: '10px 16px', background: '#0ea5a8', borderRadius: 8,
            color: 'white', fontSize: 13, fontWeight: 600, width: '100%',
            textAlign: 'center', border: 'none', cursor: 'pointer', marginTop: 20, display: 'block',
          }}>
            Finalize Note →
          </button>
        </div>

        <h3 style={{ fontSize: 22, fontWeight: 700, color: '#1a2030', textAlign: 'center', margin: '32px 0 0' }}>
          Every section, editable.
        </h3>
      </div>

      {/* ── SECTION 4: The Practice at a Glance ──────────────── */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 24px 80px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ background: '#f4f6f9', borderRadius: 24, padding: '64px 48px' }}>

          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, color: '#1a2030',
            letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 48px',
          }}>
            Seamless practice.
          </h2>

          <div style={{ width: 560, maxWidth: '100%', margin: '0 auto', background: '#1a2030', borderRadius: 16, boxShadow: '0 24px 64px rgba(26,32,48,0.24)', overflow: 'hidden' }}>
            <BrowserChrome url="ptscribe.app/today" />
            <div style={{ background: '#f4f6f9', padding: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1a2030' }}>Today's Sessions</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {['All', 'Draft', 'Ready', 'Finalized'].map((tab, i) => (
                  <div key={tab} style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 999, cursor: 'default',
                    background: i === 0 ? '#0ea5a8' : 'transparent',
                    color: i === 0 ? 'white' : '#5a6577',
                  }}>
                    {tab}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                {[
                  { dot: '#0ea5a8', name: 'Sarah M.', type: 'Follow-up', duration: '03:42', badge: 'Ready', badgeColor: '#0a6d70', badgeBg: '#e6f7f6' },
                  { dot: '#c47a09', name: 'James K.', type: 'Evaluation', duration: '01:12', badge: 'Draft', badgeColor: '#c47a09', badgeBg: '#fef3e2' },
                  { dot: '#4caf72', name: 'Linda T.', type: 'Progress', duration: '05:20', badge: 'Finalized', badgeColor: '#7c8699', badgeBg: '#f0f2f5' },
                ].map(({ dot, name, type, duration, badge, badgeColor, badgeBg }) => (
                  <div key={name} style={{ padding: '12px 0', borderBottom: '1px solid #e4e8ee', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1a2030' }}>{name}</div>
                    <div style={{ fontSize: 12, color: '#8893a5' }}>{type}</div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 12, color: '#8893a5', fontVariantNumeric: 'tabular-nums' }}>{duration}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: badgeColor, background: badgeBg, padding: '2px 8px', borderRadius: 999 }}>{badge}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 48, textAlign: 'center' }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#1a2030', margin: '0 0 12px' }}>Completely yours.</h3>
            <p style={{ fontSize: 16, color: '#5a6577', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
              Customize templates, rename sections, and add your clinical voice.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 5: The Three Promises ────────────────────── */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 24px 80px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ background: '#f4f6f9', borderRadius: 24, padding: '64px 48px' }}>

          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 700, color: '#1a2030',
            letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 12px',
          }}>
            The complete picture, on your terms.
          </h2>
          <p style={{ fontSize: 18, color: '#5a6577', textAlign: 'center', margin: '0 0 48px' }}>
            PTScribe keeps things simple — by design.
          </p>

          <div
            ref={cards5Ref}
            className="ldg-cards-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
          >
            {[
              { dot: '#6f5acc', title: 'On your device.', body: 'Everything encrypted locally. Zero servers store your notes — ever.', delay: 0 },
              { dot: '#0ea5a8', title: '90 seconds.', body: 'From recording to a signed SOAP note in under two minutes.', delay: 80 },
              { dot: '#c47a09', title: 'Any visit type.', body: 'Evaluation, SOAP, progress note, discharge — PTScribe handles all of them.', delay: 160 },
            ].map(({ dot, title, body, delay }) => (
              <div key={title} style={{
                background: '#1a2030', borderRadius: 16, padding: '28px 24px',
                display: 'flex', flexDirection: 'column', gap: 12,
                opacity: cardsVisible ? 1 : 0,
                transform: cardsVisible ? 'translateY(0)' : 'translateY(24px)',
                transition: `opacity 600ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 600ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: dot }} />
                <div style={{ fontSize: 20, fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>{title}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>{body}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── SECTION 6: The Time Revelation ───────────────────── */}
      <div
        ref={section6Ref}
        style={{
          maxWidth: 1040, margin: '0 auto', padding: '120px 48px',
          textAlign: 'center', boxSizing: 'border-box', width: '100%',
        }}
      >
        <div style={{
          width: 72, height: 72, borderRadius: 20, background: '#0ea5a8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 40px',
          fontSize: 32, fontWeight: 800, color: 'white', letterSpacing: '-0.02em',
          opacity: section6Visible ? 1 : 0,
          transform: section6Visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 700ms cubic-bezier(0.22,1,0.36,1), transform 700ms cubic-bezier(0.22,1,0.36,1)',
        }}>P</div>

        <h2 style={{
          fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, color: '#1a2030',
          letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 48px',
          opacity: section6Visible ? 1 : 0,
          transform: section6Visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 700ms cubic-bezier(0.22,1,0.36,1) 80ms, transform 700ms cubic-bezier(0.22,1,0.36,1) 80ms',
        }}>
          That note took 90 seconds.<br />Imagine a full week.
        </h2>

        <button
          id="ldg-s6-demo"
          onClick={handleDemo}
          style={{
            padding: '16px 48px', background: '#0ea5a8', borderRadius: 12,
            color: 'white', fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer',
            opacity: section6Visible ? 1 : 0,
            transform: section6Visible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 700ms cubic-bezier(0.22,1,0.36,1) 160ms, transform 700ms cubic-bezier(0.22,1,0.36,1) 160ms, background 150ms ease-out',
          }}
        >
          Try Demo
        </button>
      </div>

      {/* ── DISCLOSURE: The Honest Footnote ──────────────────── */}
      <div
        id="ldg-disc"
        style={{ maxWidth: 1040, width: '100%', margin: '0 auto', padding: '0 48px 52px', boxSizing: 'border-box' }}
      >
        <div style={{ borderTop: '1px solid #e4e8ee', paddingTop: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: '#8893a5', lineHeight: 1.65 }}>
            <strong style={{ color: '#5a6577', fontWeight: 600 }}>PTScribe is not HIPAA-certified.</strong>{' '}
            Treat anything you record as PHI and confirm BAA terms with Cloudflare and Anthropic before using real patient data. Full disclosure is shown during setup.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#8893a5', lineHeight: 1.65 }}>
            <strong style={{ color: '#5a6577', fontWeight: 600 }}>Patient consent required</strong>{' '}
            — obtain explicit verbal or written consent before recording any session.
          </p>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer
        id="ldg-foot"
        style={{ maxWidth: 1040, width: '100%', margin: '0 auto', padding: '0 48px 48px', boxSizing: 'border-box' }}
      >
        <div style={{ fontSize: 13, color: '#8893a5', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span>
            Already have an account?{' '}
            <button
              onClick={handleLogin}
              style={{ all: 'unset', color: '#0ea5a8', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              Sign in
            </button>
          </span>
          <span style={{ color: '#e4e8ee' }}>·</span>
          <a href="mailto:support@ptscribe.app" style={{ color: '#0ea5a8', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
            support@ptscribe.app
          </a>
        </div>
      </footer>

      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} onTryDemo={handleDemo} />
    </div>
  );
}
