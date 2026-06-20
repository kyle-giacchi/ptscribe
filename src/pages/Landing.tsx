import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, ArrowUpRight, Scale, Network } from 'lucide-react';
import { whisperLoader } from '@/services/ai/client/localWhisper';
import { isDemoMode, DEMO_SESSION_ID } from '@/lib/demoMode';
import { CompareModal } from '@/components/landing/CompareModal';
import { HowItWorksModal } from '@/components/landing/HowItWorksModal';
import { HowItWorksModalV2 } from '@/components/landing/HowItWorksModalV2';

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
  {
    label: 'Subjective',
    body: 'Patient reports improvement in pain from 6/10 to 4/10 since last visit. Reports increased tolerance for prolonged standing.',
  },
  {
    label: 'Objective',
    body: 'ROM: shoulder flexion 165° (↑ from 150°). MMT: deltoid 4/5. No compensation patterns observed.',
  },
  {
    label: 'Assessment',
    body: 'Patient progressing toward discharge goals. Pain and ROM improving.',
  },
  { label: 'Plan', body: 'Continue HEP with theraband series. Follow-up in 1 week.' },
];

// Raw, unpolished transcript — what the AI reads before drafting the note.
// Conversational, with filler words and speaker labels (Nova-3 diarization).
const RAW_TRANSCRIPT: { speaker: 'Clinician' | 'Patient'; text: string }[] = [
  { speaker: 'Clinician', text: "Okay, so how's the shoulder been feeling since last week?" },
  {
    speaker: 'Patient',
    text: "Uh, better I think — the pain's maybe a four now? It was like a six before.",
  },
  { speaker: 'Clinician', text: "Good. And you're managing longer on your feet at work?" },
  {
    speaker: 'Patient',
    text: 'Yeah, I can do the whole shift now without, um, having to sit down.',
  },
  {
    speaker: 'Clinician',
    text: "Let's check the range — go ahead and raise it up for me... okay, that's about one sixty-five, nice.",
  },
];

function BrowserChrome({ url }: { url: string }) {
  return (
    <div
      style={{
        height: 40,
        background: '#252d3d',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#dc2942' }} />
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#c47a09' }} />
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#4caf72' }} />
      </div>
      <div
        style={{
          flex: 1,
          height: 22,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 999,
          margin: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: '#8893a5',
        }}
      >
        {url}
      </div>
    </div>
  );
}

function NoteRows({ darkBg }: { darkBg?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {NOTE_SECTIONS.map(({ label, body }) => (
        <div
          key={label}
          style={{
            borderBottom: darkBg ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e4e8ee',
            padding: '12px 0',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#8893a5',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: darkBg ? 13 : 12,
              color: darkBg ? 'rgba(255,255,255,0.82)' : '#1a2030',
              lineHeight: 1.6,
            }}
          >
            {body}
          </div>
        </div>
      ))}
    </div>
  );
}

function TranscriptRows() {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#8893a5',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Transcript
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {RAW_TRANSCRIPT.map(({ speaker, text }, i) => (
          <div key={i} style={{ display: 'flex', gap: 10 }}>
            <div
              style={{
                flexShrink: 0,
                width: 58,
                fontSize: 11,
                fontWeight: 700,
                color: speaker === 'Clinician' ? '#0a6d70' : '#6f5acc',
              }}
            >
              {speaker}
            </div>
            <div style={{ fontSize: 12.5, color: '#5a6577', lineHeight: 1.55 }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GithubMark({ size = 22, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden focusable="false">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}

export function Landing({ onSignIn }: LandingProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showCode, setShowCode] = useState(
    () => !!(location.state as { showCode?: boolean } | null)?.showCode,
  );
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [section6Visible, setSection6Visible] = useState(false);
  const [whyVisible, setWhyVisible] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [hiwOpen, setHiwOpen] = useState(false);
  const [hiwV2Open, setHiwV2Open] = useState(false); // TEMP: v2 exploration toggle

  const inputRef = useRef<HTMLInputElement>(null);
  const sentinel1 = useRef<HTMLDivElement>(null);
  const sentinel2 = useRef<HTMLDivElement>(null);
  const sentinel3 = useRef<HTMLDivElement>(null);
  const section6Ref = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLDivElement>(null);

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
    const sentinels = [sentinel1, sentinel2, sentinel3];
    let raf = 0;
    // Step = how many sentinels have scrolled at/above the viewport center line.
    // Rises 0→3 scrolling down, falls back symmetrically scrolling up (so the reel
    // rewinds band-by-band and Record reappears at the top of the reel).
    const recompute = () => {
      raf = 0;
      const mid = window.innerHeight / 2;
      let count = 0;
      for (const ref of sentinels) {
        if (ref.current && ref.current.getBoundingClientRect().top <= mid) count++;
      }
      setWorkflowStep(count);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(recompute);
    };
    recompute(); // initial state on mount
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!section6Ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSection6Visible(true);
      },
      { threshold: 0.5 },
    );
    obs.observe(section6Ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!whyRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setWhyVisible(true);
      },
      { threshold: 0.2 },
    );
    obs.observe(whyRef.current);
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: workflowStep === step ? 1 : 0,
    zIndex: workflowStep === step ? 1 : 0,
    transition: 'opacity 500ms ease-out',
    background: 'white',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse 80% 50% at 50% 0%, oklch(64% 0.12 185 / 0.13) 0%, transparent 65%), #f4f6f9',
        fontFamily:
          "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── NAV: The Floating Island ──────────────────────────── */}
      <nav
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: '#1a2030',
          borderRadius: 999,
          padding: '10px 10px 10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: '0 4px 16px rgba(26,32,48,0.18)',
          minWidth: 360,
          maxWidth: 600,
          width: 'calc(100% - 48px)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: '#0ea5a8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            P
          </div>
          <span
            style={{ fontSize: 15.5, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}
          >
            PTScribe
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 20,
              padding: '3px 10px',
            }}
          >
            Beta
          </span>
          <button
            className="ldg-nav-cta"
            onClick={handleDemo}
            style={{
              padding: '9px 20px',
              background: '#0ea5a8',
              borderRadius: 999,
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
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
          padding: '100px 48px 64px',
          maxWidth: 1040,
          width: '100%',
          margin: '0 auto',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="ldg-u ldg-u1"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#0a6d70',
            marginBottom: 24,
          }}
        >
          Voice Transcription & Note Generation for Physical Therapists
        </div>

        <h1
          id="ldg-h1"
          className="ldg-u ldg-u2"
          style={{
            margin: '0 0 24px',
            fontSize: 'clamp(52px, 9vw, 104px)',
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: '-0.04em',
            color: '#1a2030',
          }}
        >
          Better care,
          <br />
          less <span style={{ color: '#0ea5a8' }}>work.</span>
        </h1>

        <p
          className="ldg-u ldg-u3"
          style={{
            margin: '0 0 44px',
            fontSize: 18,
            lineHeight: 1.6,
            color: '#5a6577',
            maxWidth: 480,
          }}
        >
          PTScribe saves clinicians time and money by transcribing clinical sessions into structured
          notes — so you finish the day with your patients, not your paperwork.
        </p>

        {!showCode ? (
          <div
            className="ldg-u ldg-u4"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              width: '100%',
            }}
          >
            <div
              id="ldg-ctas"
              style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}
            >
              <button
                id="ldg-demo"
                onClick={handleDemo}
                style={{
                  padding: '15px 40px',
                  background: '#0ea5a8',
                  borderRadius: 12,
                  color: 'white',
                  fontSize: 15.5,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 150ms ease-out',
                  boxSizing: 'border-box',
                }}
              >
                Try Demo
              </button>
              <button
                id="ldg-setup"
                onClick={handleLogin}
                style={{
                  padding: '15px 40px',
                  border: '1.5px solid #d6dce5',
                  borderRadius: 12,
                  background: 'transparent',
                  color: '#1a2030',
                  fontSize: 15.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'border-color 150ms ease-out',
                  boxSizing: 'border-box',
                }}
              >
                Set up your account
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8893a5' }}>
              <Lock size={11} color="#8893a5" strokeWidth={2} />
              <span style={{ fontSize: 12 }}>
                Stored encrypted on your device · sent securely when AI is used
              </span>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{
              maxWidth: 300,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#5a6577' }}>
              Enter the 6-digit demo code
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
                  padding: '12px 14px',
                  border: `1.5px solid ${codeError ? '#dc2942' : '#e4e8ee'}`,
                  borderRadius: 10,
                  outline: 'none',
                  fontSize: 20,
                  letterSpacing: '0.3em',
                  textAlign: 'center',
                  color: '#1a2030',
                  boxSizing: 'border-box',
                  background: 'white',
                }}
              />
              <button
                type="submit"
                disabled={code.length !== 6 || busy}
                style={{
                  padding: '12px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: code.length === 6 && !busy ? '#0ea5a8' : '#f1f3f7',
                  color: code.length === 6 && !busy ? 'white' : '#8893a5',
                  fontWeight: 700,
                  fontSize: 14,
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
              onClick={() => {
                setShowCode(false);
                setCode('');
                setCodeError(null);
              }}
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
      </section>

      {/* ── SECTION 2: The Session Reel ──────────────────────── */}
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '0 24px 80px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            padding: '64px 48px',
            position: 'relative',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 40px)',
              fontWeight: 700,
              color: '#1a2030',
              letterSpacing: '-0.02em',
              textAlign: 'center',
              margin: '0 0 64px',
            }}
          >
            See how it works.
          </h2>

          <div
            style={{
              position: 'sticky',
              top: 120,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 40,
            }}
          >
            {/* Browser mockup */}
            <div
              style={{
                width: 680,
                maxWidth: '100%',
                background: '#1a2030',
                borderRadius: 16,
                boxShadow: '0 24px 64px rgba(26,32,48,0.24)',
                overflow: 'hidden',
              }}
            >
              <BrowserChrome url="ptscribe.app/session/sarah-m" />

              {/* Screen area */}
              <div style={{ minHeight: 480, background: '#f4f6f9', position: 'relative' }}>
                {/* Step 0: Record */}
                <div
                  style={{
                    ...screenStyle(0),
                    padding: 32,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 24,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1a2030' }}>
                    Sarah M. — Follow-up Visit
                  </div>
                  <div style={{ position: 'relative', width: 80, height: 80 }}>
                    <div
                      className="ldg-record-ring"
                      style={{ animationPlayState: workflowStep === 0 ? 'running' : 'paused' }}
                    />
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 999,
                        background: '#0ea5a8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 400,
                      color: '#8893a5',
                      fontVariantNumeric: 'tabular-nums',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    00:00
                  </div>
                  <div style={{ fontSize: 13, color: '#8893a5' }}>Tap to begin recording</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{ width: 4, height: 4, background: '#e4e8ee', borderRadius: 999 }}
                      />
                    ))}
                  </div>
                </div>

                {/* Step 1: Transcribing */}
                <div style={{ ...screenStyle(1), padding: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        background: '#dc2942',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{ width: 12, height: 12, background: 'white', borderRadius: 2 }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontVariantNumeric: 'tabular-nums',
                        color: '#1a2030',
                        fontWeight: 500,
                      }}
                    >
                      03:42
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 4,
                      alignItems: 'flex-end',
                      marginTop: 16,
                      height: 40,
                    }}
                  >
                    {[0, 80, 160, 240, 320].map((delay, i) => (
                      <div
                        key={i}
                        style={{
                          width: 5,
                          height: 32,
                          background: '#0ea5a8',
                          borderRadius: 999,
                          transformOrigin: 'bottom center',
                          animation: `ldg-wave 0.8s ease-in-out ${delay}ms infinite`,
                          animationPlayState: workflowStep === 1 ? 'running' : 'paused',
                          display: 'inline-block',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#8893a5',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        marginBottom: 8,
                      }}
                    >
                      Transcript
                    </div>
                    {[
                      'Patient reports pain level 4 out of 10 today, down from 6...',
                      'Range of motion improved approximately 15 degrees since last visit...',
                      'Tolerated all exercises without compensation patterns...',
                    ].map((text, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '8px 12px',
                          background: '#f4f6f9',
                          borderRadius: 8,
                          marginBottom: 6,
                          fontSize: 13,
                          color: '#1a2030',
                          lineHeight: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {text}
                        {i === 2 && (
                          <span
                            style={{ marginLeft: 2, animation: 'ldg-blink 1s step-start infinite' }}
                          >
                            ▌
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step 2: Generating */}
                <div style={{ ...screenStyle(2), padding: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6f5acc"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      style={{
                        animation: 'ldg-spin 1s linear infinite',
                        animationPlayState: workflowStep === 2 ? 'running' : 'paused',
                        flexShrink: 0,
                      }}
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span style={{ fontSize: 13, color: '#6f5acc', fontWeight: 600 }}>
                      Generating note from transcript...
                    </span>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <TranscriptRows />
                  </div>
                </div>

                {/* Step 3: Ready */}
                <div style={{ ...screenStyle(3), padding: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        background: '#e6f7f6',
                        color: '#0a6d70',
                        padding: '4px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Ready
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5a6577' }}>
                      Sarah M. — Follow-up
                    </div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <NoteRows />
                  </div>
                  <button
                    style={{
                      padding: '12px 20px',
                      background: '#0ea5a8',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 14,
                      fontWeight: 700,
                      width: '100%',
                      textAlign: 'center',
                      border: 'none',
                      cursor: 'pointer',
                      marginTop: 20,
                      display: 'block',
                    }}
                  >
                    Finalize Note →
                  </button>
                </div>
              </div>
            </div>

            {/* Sub-headline */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <h3
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#1a2030',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                {STEP_TITLES[workflowStep]}
              </h3>
              <p
                style={{
                  fontSize: 16,
                  color: '#5a6577',
                  maxWidth: 440,
                  textAlign: 'center',
                  margin: 0,
                }}
              >
                {STEP_DESCS[workflowStep]}
              </p>
            </div>
          </div>

          {/* Spacer with sentinels — evenly spaced ~850px bands (Record · Transcribe ·
              Generate · Ready). The trailing ~850px below sentinel3 is step 3's tail. */}
          <div style={{ height: 3400, position: 'relative' }}>
            <div
              ref={sentinel1}
              style={{ position: 'absolute', top: 850, height: 1, pointerEvents: 'none' }}
            />
            <div
              ref={sentinel2}
              style={{ position: 'absolute', top: 1700, height: 1, pointerEvents: 'none' }}
            />
            <div
              ref={sentinel3}
              style={{ position: 'absolute', top: 2550, height: 1, pointerEvents: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* ── SECTION 3: Why I Built This ──────────────────────── */}
      <div
        ref={whyRef}
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '80px 48px',
          boxSizing: 'border-box',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 680 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#0a6d70',
              marginBottom: 20,
              opacity: whyVisible ? 1 : 0,
              transform: whyVisible ? 'none' : 'translateY(18px)',
              transition:
                'opacity 600ms cubic-bezier(0.22,1,0.36,1), transform 600ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            Why I built this
          </div>
          <h2
            style={{
              fontSize: 'clamp(28px, 4.4vw, 46px)',
              fontWeight: 800,
              color: '#1a2030',
              letterSpacing: '-0.03em',
              lineHeight: 1.08,
              margin: '0 0 22px',
              opacity: whyVisible ? 1 : 0,
              transform: whyVisible ? 'none' : 'translateY(18px)',
              transition:
                'opacity 600ms cubic-bezier(0.22,1,0.36,1) 60ms, transform 600ms cubic-bezier(0.22,1,0.36,1) 60ms',
            }}
          >
            Better notes shouldn't cost an $1,800 subscription, or your patients' privacy.
          </h2>
          <p
            style={{
              fontSize: 18,
              color: '#5a6577',
              lineHeight: 1.65,
              margin: 0,
              maxWidth: 600,
              opacity: whyVisible ? 1 : 0,
              transform: whyVisible ? 'none' : 'translateY(18px)',
              transition:
                'opacity 600ms cubic-bezier(0.22,1,0.36,1) 120ms, transform 600ms cubic-bezier(0.22,1,0.36,1) 120ms',
            }}
          >
            PTScribe is an independent, open-source clinical scribe. It runs local-first, so every
            recording and note stays encrypted on your own device while the AI runs through a thin
            proxy that stores nothing. I built it in the open, so you can read the code, weigh it
            honestly against the paid tools, and see exactly how it works.
          </p>
        </div>

        {/* Three doors — source, comparison, architecture */}
        <div
          style={{
            marginTop: 44,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            width: '100%',
            maxWidth: 480,
            opacity: whyVisible ? 1 : 0,
            transform: whyVisible ? 'none' : 'translateY(18px)',
            transition:
              'opacity 600ms cubic-bezier(0.22,1,0.36,1) 180ms, transform 600ms cubic-bezier(0.22,1,0.36,1) 180ms',
          }}
        >
          {/* Read the source — external GitHub link */}
          <a
            href="https://github.com/kyle-giacchi/ptscribe"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              width: '100%',
              background: '#1a2030',
              borderRadius: 16,
              padding: '24px 24px 22px',
              border: '1px solid #1a2030',
              transition:
                'transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 16px 34px rgba(26,32,48,0.24)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <GithubMark size={22} color="#ffffff" />
              <ArrowUpRight size={18} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                  marginBottom: 6,
                }}
              >
                Read the source
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
                Every line is public. Audit the encryption, the proxy, all of it.
              </div>
            </div>
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 4,
                fontSize: 11.5,
                color: '#0ea5a8',
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                letterSpacing: '-0.01em',
              }}
            >
              github.com/kyle-giacchi/ptscribe
            </div>
          </a>

          {/* Compare to leading SaaS — opens CompareModal */}
          <button
            onClick={() => setCompareOpen(true)}
            style={{
              textAlign: 'left',
              fontFamily: 'inherit',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              width: '100%',
              background: '#ffffff',
              borderRadius: 16,
              padding: '24px 24px 22px',
              border: '1px solid #e4e8ee',
              cursor: 'pointer',
              transition:
                'transform 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms, box-shadow 220ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = '#0ea5a8';
              e.currentTarget.style.boxShadow = '0 16px 34px rgba(14,165,168,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.borderColor = '#e4e8ee';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Scale size={22} color="#0ea5a8" strokeWidth={1.75} />
              <span style={{ fontSize: 16, color: '#8893a5', fontWeight: 600, lineHeight: 1 }}>
                →
              </span>
            </div>
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#1a2030',
                  letterSpacing: '-0.01em',
                  marginBottom: 6,
                }}
              >
                Compare to leading SaaS
              </div>
              <div style={{ fontSize: 13, color: '#5a6577', lineHeight: 1.5 }}>
                An honest, feature-by-feature scorecard against the leading SaaS scribes.
              </div>
            </div>
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 4,
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0a6d70' }}>~$15/yr</span>
              <span style={{ fontSize: 12, color: '#8893a5' }}>vs</span>
              <span
                style={{
                  fontSize: 13,
                  color: '#8893a5',
                  textDecoration: 'line-through',
                  textDecorationColor: 'rgba(136,147,165,0.55)',
                }}
              >
                $1,800/yr
              </span>
            </div>
          </button>

          {/* Architecture, explained — opens HowItWorksModal */}
          <button
            onClick={() => setHiwOpen(true)}
            style={{
              textAlign: 'left',
              fontFamily: 'inherit',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              width: '100%',
              background: '#ffffff',
              borderRadius: 16,
              padding: '24px 24px 22px',
              border: '1px solid #e4e8ee',
              cursor: 'pointer',
              transition:
                'transform 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms, box-shadow 220ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = '#0ea5a8';
              e.currentTarget.style.boxShadow = '0 16px 34px rgba(14,165,168,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.borderColor = '#e4e8ee';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Network size={22} color="#0ea5a8" strokeWidth={1.75} />
              <span style={{ fontSize: 16, color: '#8893a5', fontWeight: 600, lineHeight: 1 }}>
                →
              </span>
            </div>
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#1a2030',
                  letterSpacing: '-0.01em',
                  marginBottom: 6,
                }}
              >
                Architecture, explained
              </div>
              <div style={{ fontSize: 13, color: '#5a6577', lineHeight: 1.5 }}>
                Why I built this — local-first, encrypted at rest, with the AI on a leash.
              </div>
            </div>
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 4,
                fontSize: 11.5,
                color: '#0a6d70',
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                letterSpacing: '-0.01em',
              }}
            >
              A 5-chapter builder's journal
            </div>
          </button>

          {/* TEMP — v2 exploration: opens the re-imagined HowItWorksModalV2 */}
          <button
            onClick={() => setHiwV2Open(true)}
            style={{
              textAlign: 'left',
              fontFamily: 'inherit',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              background: '#ffffff',
              borderRadius: 16,
              padding: '24px 24px 22px',
              border: '1px dashed #c47a09',
              cursor: 'pointer',
              transition:
                'transform 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms, box-shadow 220ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = '#c47a09';
              e.currentTarget.style.boxShadow = '0 16px 34px rgba(196,122,9,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.borderColor = '#c47a09';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Network size={22} color="#c47a09" strokeWidth={1.75} />
              <span
                style={{
                  fontSize: 10,
                  color: '#c47a09',
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  border: '1px solid #f1d79b',
                  borderRadius: 6,
                  padding: '3px 7px',
                }}
              >
                v2 · preview
              </span>
            </div>
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#1a2030',
                  letterSpacing: '-0.01em',
                  marginBottom: 6,
                }}
              >
                Architecture, explained — v2
              </div>
              <div style={{ fontSize: 13, color: '#5a6577', lineHeight: 1.5 }}>
                The re-imagined journal: progress-spine rail, hero chapter openers, accent
                threading.
              </div>
            </div>
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 4,
                fontSize: 11.5,
                color: '#c47a09',
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                letterSpacing: '-0.01em',
              }}
            >
              Refined builder's journal
            </div>
          </button>
        </div>
      </div>

      {/* ── SECTION 6: The Time Revelation ───────────────────── */}
      <div
        ref={section6Ref}
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '120px 48px',
          textAlign: 'center',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: '#0ea5a8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 40px',
            fontSize: 32,
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-0.02em',
            opacity: section6Visible ? 1 : 0,
            transform: section6Visible ? 'translateY(0)' : 'translateY(24px)',
            transition:
              'opacity 700ms cubic-bezier(0.22,1,0.36,1), transform 700ms cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          P
        </div>

        <h2
          style={{
            fontSize: 'clamp(28px, 5vw, 52px)',
            fontWeight: 900,
            color: '#1a2030',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: '0 0 48px',
            opacity: section6Visible ? 1 : 0,
            transform: section6Visible ? 'translateY(0)' : 'translateY(24px)',
            transition:
              'opacity 700ms cubic-bezier(0.22,1,0.36,1) 80ms, transform 700ms cubic-bezier(0.22,1,0.36,1) 80ms',
          }}
        >
          PTs spend 2–3 hours a day on notes.
          <br />
          That's time you're not billing —
          <br />
          and not living.
        </h2>

        <button
          id="ldg-s6-demo"
          onClick={handleDemo}
          style={{
            padding: '16px 48px',
            background: '#0ea5a8',
            borderRadius: 12,
            color: 'white',
            fontSize: 16,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            opacity: section6Visible ? 1 : 0,
            transform: section6Visible ? 'translateY(0)' : 'translateY(24px)',
            transition:
              'opacity 700ms cubic-bezier(0.22,1,0.36,1) 160ms, transform 700ms cubic-bezier(0.22,1,0.36,1) 160ms, background 150ms ease-out',
          }}
        >
          Try Demo
        </button>
      </div>

      {/* ── DISCLOSURE: The Honest Footnote ──────────────────── */}
      <div
        id="ldg-disc"
        style={{
          maxWidth: 1040,
          width: '100%',
          margin: '0 auto',
          padding: '0 48px 52px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            borderTop: '1px solid #e4e8ee',
            paddingTop: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: '#8893a5', lineHeight: 1.65 }}>
            <strong style={{ color: '#5a6577', fontWeight: 600 }}>
              PTScribe is not HIPAA-certified.
            </strong>{' '}
            Treat anything you record as PHI. PTScribe routes AI calls through Cloudflare and
            Anthropic — you'll need to obtain your own BAA with each provider before using real
            patient data. Full disclosure is shown during setup.
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
        style={{
          maxWidth: 1040,
          width: '100%',
          margin: '0 auto',
          padding: '0 48px 48px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: '#8893a5',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span>
            Already have an account?{' '}
            <button
              onClick={handleLogin}
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
        </div>
      </footer>

      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        onTryDemo={handleDemo}
      />
      <HowItWorksModal open={hiwOpen} onClose={() => setHiwOpen(false)} />
      <HowItWorksModalV2 open={hiwV2Open} onClose={() => setHiwV2Open(false)} />
    </div>
  );
}
