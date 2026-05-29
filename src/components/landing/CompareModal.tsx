import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onTryDemo?: () => void;
}

type BadgeVariant = 'ok' | 'wip' | 'planned' | 'yes' | 'no' | 'partial' | 'lead';

// ─── Module-level helpers (defined outside component to avoid remounting) ─────

function CmpBadge({ v, label }: { v: BadgeVariant; label: string }) {
  return <span className={`cmp-badge cmp-badge--${v}`}>{label}</span>;
}

function GrpHeader({
  num,
  title,
  count,
  lead,
}: {
  num: string;
  title: string;
  count: string;
  lead?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '10px 36px 4px' }}>
      <span style={{ fontSize: 11, color: '#8893a5', fontFamily: MONO, letterSpacing: '0.08em' }}>
        {num}
      </span>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 700,
          margin: 0,
          letterSpacing: '-0.005em',
          color: '#1a2030',
        }}
      >
        {title}
      </h3>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 11,
          fontFamily: MONO,
          color: lead ? '#0a6d70' : '#8893a5',
          background: lead ? '#e6f7f6' : '#f4f6f9',
          padding: '3px 9px',
          borderRadius: 999,
          border: `1px solid ${lead ? 'rgba(10,109,112,0.25)' : '#edf0f4'}`,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function Feat({ name, desc }: { name: string; desc?: string }) {
  return (
    <div>
      <div
        style={{ fontWeight: 500, fontSize: 13.5, color: '#1a2030', marginBottom: desc ? 3 : 0 }}
      >
        {name}
      </div>
      {desc && (
        <div style={{ color: '#8893a5', fontSize: 12, lineHeight: 1.45, maxWidth: '44ch' }}>
          {desc}
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = "'JetBrains Mono', ui-monospace, monospace";

const ROW_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr)',
  gap: 16,
};

function parityRow(): React.CSSProperties {
  return {
    ...ROW_GRID,
    padding: '7px 22px 7px 36px',
    borderTop: '1px solid rgba(26,32,48,0.05)',
    alignItems: 'center',
  };
}

function gapRow(): React.CSSProperties {
  return {
    ...ROW_GRID,
    padding: '10px 22px 10px 36px',
    borderTop: '1px solid rgba(26,32,48,0.05)',
    alignItems: 'flex-start',
  };
}

function leadRow(extra?: React.CSSProperties): React.CSSProperties {
  return {
    ...ROW_GRID,
    padding: '10px 22px 10px 36px',
    borderTop: '1px solid rgba(26,32,48,0.05)',
    alignItems: 'flex-start',
    background: 'linear-gradient(90deg, rgba(14,165,168,0.065), transparent 70%)',
    ...extra,
  };
}

// ─── Badge pseudo-element CSS ─────────────────────────────────────────────────

const BADGE_CSS = `
.cmp-badge {
  display: inline-flex; align-items: center; gap: 9px;
  font-size: 13px; font-weight: 500; color: #1a2030;
  white-space: nowrap; letter-spacing: -0.005em;
  font-family: 'Inter', ui-sans-serif, sans-serif;
}
.cmp-badge::before {
  content: ""; width: 14px; height: 14px; border-radius: 3px;
  background: #f1f3f7; border: 1px solid #e4e8ee;
  flex-shrink: 0; display: inline-block;
}
/* Shipped — solid teal fill */
.cmp-badge--ok { color: #0a6d70; }
.cmp-badge--ok::before { background: #0ea5a8; border-color: #0a6d70; }
/* In development — amber diagonal stripe */
.cmp-badge--wip { color: #7a4c04; }
.cmp-badge--wip::before {
  background: repeating-linear-gradient(-45deg, #c47a09 0 2px, #fdf3df 2px 4px);
  border-color: rgba(196,122,9,0.6);
}
/* Planned — dashed red border with × */
.cmp-badge--planned { color: #dc2942; font-weight: 600; }
.cmp-badge--planned::before {
  background:
    linear-gradient(45deg, transparent calc(50% - 1px), #dc2942 calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)),
    linear-gradient(-45deg, transparent calc(50% - 1px), #dc2942 calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)),
    white;
  border-color: #dc2942; border-style: dashed;
}
/* Competitor: Included — teal tint with check */
.cmp-badge--yes { color: #5a6577; }
.cmp-badge--yes::before {
  background-color: #e6f7f6;
  background-image:
    linear-gradient(45deg, transparent 45%, #0a6d70 45% 55%, transparent 55%),
    linear-gradient(-45deg, transparent 45%, #0a6d70 45% 55%, transparent 55%);
  background-size: 6px 1.6px, 9px 1.6px;
  background-position: 2.5px 8px, 5px 7px;
  background-repeat: no-repeat;
  border-color: rgba(10,109,112,0.45);
}
/* No — dim with horizontal dash */
.cmp-badge--no { color: #8893a5; }
.cmp-badge--no::before {
  background: #f1f3f7;
  background-image: linear-gradient(#8893a5, #8893a5);
  background-size: 7px 1.6px; background-position: center; background-repeat: no-repeat;
  border-color: #e4e8ee;
}
/* Partial / Cloud only — amber tint */
.cmp-badge--partial { color: #7a4c04; }
.cmp-badge--partial::before {
  background: radial-gradient(circle at 50% 75%, #fdf3df 4px, transparent 4.5px), #fdf3df;
  border-color: rgba(196,122,9,0.5);
}
/* Lead — strong teal with inset ring */
.cmp-badge--lead { color: #0a6d70; font-weight: 600; }
.cmp-badge--lead::before {
  background: #0a6d70; border-color: #0a6d70;
  box-shadow: inset 0 0 0 2px white, inset 0 0 0 3px #0a6d70;
}
/* Parity row compact check treatment */
.cmp-parity .cmp-badge--ok,
.cmp-parity .cmp-badge--yes {
  color: #0a6d70; font-size: 12.5px; gap: 7px;
}
.cmp-parity .cmp-badge--ok::before,
.cmp-parity .cmp-badge--yes::before {
  width: 12px; height: 12px;
  background-color: #e6f7f6;
  background-image:
    linear-gradient(45deg, transparent 45%, #0a6d70 45% 55%, transparent 55%),
    linear-gradient(-45deg, transparent 45%, #0a6d70 45% 55%, transparent 55%);
  background-size: 5px 1.4px, 7px 1.4px;
  background-position: 2px 6.5px, 4px 6px;
  background-repeat: no-repeat;
  border: 1px solid rgba(10,109,112,0.4); border-radius: 3px; box-shadow: none;
}
/* Scrollbar */
.cmp-scroll::-webkit-scrollbar { width: 8px; }
.cmp-scroll::-webkit-scrollbar-thumb {
  background: #d6dce5; border-radius: 4px; border: 2px solid white;
}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function CompareModal({ open, onClose, onTryDemo }: Props) {
  useEffect(() => {
    if (document.getElementById('cmp-modal-styles')) return;
    const s = document.createElement('style');
    s.id = 'cmp-modal-styles';
    s.textContent = BADGE_CSS;
    document.head.appendChild(s);
    return () => {
      document.getElementById('cmp-modal-styles')?.remove();
    };
  }, []);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cmp-title"
        >
          {/* Scrim */}
          <motion.div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(26,32,48,0.45)',
              backdropFilter: 'blur(2px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />

          {/* Panel — 4-row grid: head / col-headers / body / footer */}
          <motion.div
            style={{
              position: 'relative',
              width: 'min(1180px, calc(100vw - 48px))',
              height: 'min(780px, calc(100vh - 48px))',
              background: 'white',
              border: '1px solid #e4e8ee',
              borderRadius: 18,
              boxShadow: '0 30px 80px -20px rgba(26,32,48,0.28), 0 8px 24px rgba(26,32,48,0.08)',
              display: 'grid',
              gridTemplateRows: 'auto auto 1fr auto',
              overflow: 'hidden',
              fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ── Head ─────────────────────────────────────────────────── */}
            <header
              style={{
                padding: '22px 36px 16px',
                borderBottom: '1px solid #f0f2f6',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 24,
              }}
            >
              <div style={{ maxWidth: 700 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#8893a5',
                    marginBottom: 8,
                    fontFamily: MONO,
                  }}
                >
                  Honest comparison
                </div>
                <h2
                  id="cmp-title"
                  style={{
                    margin: '0 0 8px',
                    fontSize: 'clamp(20px, 2.2vw, 24px)',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: '-0.025em',
                    color: '#1a2030',
                  }}
                >
                  How does PTScribe stack up against a leading&nbsp;SaaS&nbsp;scribe?
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    color: '#5a6577',
                    lineHeight: 1.55,
                    maxWidth: 620,
                  }}
                >
                  PTScribe is purpose-built for physical therapists. Here's our honest scorecard —
                  what's shipped, what's in active development, and where we already lead.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close comparison"
                style={{
                  appearance: 'none',
                  background: '#f4f6f9',
                  border: '1px solid #e4e8ee',
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  cursor: 'pointer',
                  color: '#5a6577',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: 0,
                }}
              >
                <X size={16} />
              </button>
            </header>

            {/* ── Column headers ───────────────────────────────────────── */}
            <div
              style={{
                ...ROW_GRID,
                gap: 0,
                background: '#f4f6f9',
                borderBottom: '1px solid #e4e8ee',
              }}
            >
              <div
                style={{ padding: '14px 22px 14px 36px', display: 'flex', alignItems: 'center' }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: '#8893a5',
                  }}
                >
                  Feature
                </span>
              </div>
              <div style={{ padding: '14px 22px', borderLeft: '1px solid #edf0f4' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: '#0ea5a8',
                      color: 'white',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: MONO,
                      fontWeight: 700,
                      fontSize: 11,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    PT
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14.5, color: '#1a2030' }}>
                      PTScribe
                    </div>
                    <div
                      style={{ fontSize: 10.5, color: '#8893a5', marginTop: 1, fontFamily: MONO }}
                    >
                      PT-focused · pay per AI call
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '14px 22px', borderLeft: '1px solid #edf0f4' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: 'white',
                      color: '#5a6577',
                      border: '1px solid #e4e8ee',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: MONO,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    S
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14.5, color: '#1a2030' }}>
                      Leading SaaS scribe
                    </div>
                    <div
                      style={{ fontSize: 10.5, color: '#8893a5', marginTop: 1, fontFamily: MONO }}
                    >
                      paid SaaS · $150/user/mo
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ──────────────────────────────────────── */}
            <div className="cmp-scroll" style={{ overflowY: 'auto', paddingBottom: 12 }}>
              {/* ── 01: Transcription & capture ── */}
              <section style={{ paddingBottom: 8 }}>
                <GrpHeader num="01" title="Transcription & capture" count="3 / 5 at parity" />

                <div style={parityRow()} className="cmp-parity">
                  <Feat name="Live ambient recording" />
                  <CmpBadge v="ok" label="Shipped" />
                  <CmpBadge v="yes" label="Included" />
                </div>

                <div style={parityRow()} className="cmp-parity">
                  <Feat name="Speaker diarization (clinician vs. patient)" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CmpBadge v="ok" label="Shipped" />
                    <span style={{ fontSize: 11, color: '#8893a5', fontFamily: MONO }}>
                      cloud path
                    </span>
                  </div>
                  <CmpBadge v="yes" label="Included" />
                </div>

                <div style={parityRow()} className="cmp-parity">
                  <Feat name="Audio file upload (mp3, wav, m4a, webm)" />
                  <CmpBadge v="ok" label="Shipped" />
                  <CmpBadge v="yes" label="Included" />
                </div>

                <div style={leadRow()}>
                  <Feat
                    name="On-device local transcription"
                    desc="Audio and transcript never leave your device — no data sent to a cloud transcription provider. Uses on-device Whisper AI."
                  />
                  <CmpBadge v="lead" label="Yes · local Whisper" />
                  <CmpBadge v="partial" label="Cloud only" />
                </div>

                <div style={leadRow()}>
                  <Feat
                    name="On-device PII scrubbing"
                    desc="Detect and redact patient identifiers from the transcript before it reaches the AI — runs locally, no network call."
                  />
                  <CmpBadge v="lead" label="Yes · local NER" />
                  <CmpBadge v="no" label="Not offered" />
                </div>
              </section>

              {/* ── 02: Note generation ── */}
              <section
                style={{
                  borderTop: '1px solid #f0f2f6',
                  paddingTop: 10,
                  marginTop: 4,
                  paddingBottom: 8,
                }}
              >
                <GrpHeader num="02" title="Note generation" count="2 / 5 at parity" />

                <div style={parityRow()} className="cmp-parity">
                  <Feat name="PT templates (eval, follow-up, progress, discharge)" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CmpBadge v="ok" label="Shipped" />
                    <span style={{ fontSize: 11, color: '#8893a5', fontFamily: MONO }}>
                      PT-specific
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CmpBadge v="yes" label="Included" />
                    <span style={{ fontSize: 11, color: '#8893a5', fontFamily: MONO }}>
                      200+ templates
                    </span>
                  </div>
                </div>

                <div style={parityRow()} className="cmp-parity">
                  <Feat name="Custom templates & sections" />
                  <CmpBadge v="ok" label="Shipped" />
                  <CmpBadge v="yes" label="Included" />
                </div>

                <div style={leadRow()}>
                  <Feat
                    name="Tone modifiers & regenerate with clinician feedback"
                    desc="Steer the AI's tone and emphasis before generating, then re-run with a critique note to refine the draft — all without unlocking the transcript."
                  />
                  <CmpBadge v="lead" label="Yes" />
                  <CmpBadge v="no" label="No equivalent" />
                </div>

                <div style={gapRow()}>
                  <Feat
                    name="ICD-10 billing code suggestions"
                    desc="AI suggests ICD-10 and CPT codes from the finished note so you don't have to code from memory."
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      alignItems: 'flex-start',
                    }}
                  >
                    <CmpBadge v="wip" label="In development" />
                  </div>
                  <CmpBadge v="yes" label="Included" />
                </div>

                <div style={gapRow()}>
                  <Feat
                    name="Post-generation AI chat"
                    desc="Prompt the AI to generate referral letters, patient summaries, or make structural edits after the note is already drafted."
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      alignItems: 'flex-start',
                    }}
                  >
                    <CmpBadge v="planned" label="Planned" />
                  </div>
                  <CmpBadge v="yes" label="Included" />
                </div>
              </section>

              {/* ── 03: Workflow & integrations ── */}
              <section
                style={{
                  borderTop: '1px solid #f0f2f6',
                  paddingTop: 10,
                  marginTop: 4,
                  paddingBottom: 8,
                }}
              >
                <GrpHeader num="03" title="Workflow & integrations" count="1 / 4 at parity" />

                <div style={parityRow()} className="cmp-parity">
                  <Feat name="Patient charts with full session history" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CmpBadge v="ok" label="Shipped" />
                    <span style={{ fontSize: 11, color: '#8893a5', fontFamily: MONO }}>
                      + plan of care
                    </span>
                  </div>
                  <CmpBadge v="yes" label="Included" />
                </div>

                <div style={gapRow()}>
                  <Feat
                    name="Mobile app (iOS & Android)"
                    desc="Record at the bedside on your phone, review and finalize notes on your desk."
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      alignItems: 'flex-start',
                    }}
                  >
                    <CmpBadge v="wip" label="In development" />
                  </div>
                  <CmpBadge v="yes" label="iOS & Android" />
                </div>

                <div style={gapRow()}>
                  <Feat
                    name="EHR copy & integration"
                    desc="One-click note export and structured data push for popular rehab EMRs."
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      alignItems: 'flex-start',
                    }}
                  >
                    <CmpBadge v="wip" label="In development" />
                  </div>
                  <CmpBadge v="yes" label="Lite access" />
                </div>

                <div style={gapRow()}>
                  <Feat
                    name="Team & shared template library"
                    desc="Share custom note templates across your whole clinic — every PT uses the same structure."
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      alignItems: 'flex-start',
                    }}
                  >
                    <CmpBadge v="wip" label="In development" />
                  </div>
                  <CmpBadge v="yes" label="Included" />
                </div>
              </section>

              {/* ── 04: Trust, control & cost ── */}
              <section
                style={{
                  borderTop: '1px solid #f0f2f6',
                  paddingTop: 10,
                  marginTop: 4,
                  paddingBottom: 8,
                }}
              >
                <GrpHeader num="04" title="Trust, control & cost" count="where we lead" lead />

                <div style={leadRow()}>
                  <Feat
                    name="Clinician approves what the AI sees"
                    desc="The transcript is yours to review and edit first. The AI only summarizes what you explicitly approved — nothing sent automatically."
                  />
                  <CmpBadge v="lead" label="Yes · curated transcript" />
                  <CmpBadge v="no" label="Auto-generated" />
                </div>

                <div style={leadRow()}>
                  <Feat
                    name="All clinical data stays on your device"
                    desc="Patients, sessions, notes, and audio live in your browser's encrypted storage — never uploaded to our database."
                  />
                  <CmpBadge v="lead" label="Yes" />
                  <CmpBadge v="partial" label="Cloud hosted" />
                </div>

                <div style={leadRow()}>
                  <Feat
                    name="At-rest encryption (AES-GCM vault)"
                    desc="Every record is encrypted on your device with a key that lives only in RAM. Tab close evicts the key — no cloud backup needed."
                  />
                  <CmpBadge v="lead" label="Yes" />
                  <CmpBadge v="no" label="Not offered" />
                </div>

                {/* Cost callout row */}
                <div style={leadRow({ alignItems: 'center', paddingTop: 18, paddingBottom: 18 })}>
                  <Feat
                    name="Annual cost per clinician"
                    desc="What a working PT pays in a year at typical visit volume."
                  />

                  {/* PTScribe cost */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                      <span
                        style={{
                          fontSize: 38,
                          fontWeight: 700,
                          letterSpacing: '-0.03em',
                          lineHeight: 1,
                          color: '#0a6d70',
                        }}
                      >
                        ~$15
                      </span>
                      <span
                        style={{ fontSize: 14, fontWeight: 500, color: '#0a6d70', opacity: 0.75 }}
                      >
                        /yr
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#0a6d70',
                        letterSpacing: '-0.005em',
                      }}
                    >
                      Nearly free
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#8893a5',
                        fontFamily: MONO,
                        letterSpacing: '0.02em',
                      }}
                    >
                      pay-per-AI-call · cents per note
                    </div>
                  </div>

                  {/* Competitor cost */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                      <span
                        style={{
                          fontSize: 38,
                          fontWeight: 700,
                          letterSpacing: '-0.03em',
                          lineHeight: 1,
                          color: '#dc2942',
                          textDecoration: 'line-through',
                          textDecorationColor: 'rgba(220,41,66,0.4)',
                          textDecorationThickness: '2px',
                        }}
                      >
                        $1,800
                      </span>
                      <span
                        style={{ fontSize: 14, fontWeight: 500, color: '#dc2942', opacity: 0.7 }}
                      >
                        /yr
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#5a6577',
                        letterSpacing: '-0.005em',
                      }}
                    >
                      SaaS subscription
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#8893a5',
                        fontFamily: MONO,
                        letterSpacing: '0.02em',
                      }}
                    >
                      paid plan · $150/mo · per seat
                    </div>
                  </div>
                </div>
              </section>

              {/* Legend */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 22,
                  padding: '16px 36px 10px',
                  marginTop: 8,
                  borderTop: '1px dashed #edf0f4',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CmpBadge v="ok" label="Shipped" />
                  <span style={{ fontSize: 12, color: '#8893a5' }}>Available today.</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CmpBadge v="wip" label="In development" />
                  <span style={{ fontSize: 12, color: '#8893a5' }}>
                    Active build — coming soon.
                  </span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CmpBadge v="planned" label="Planned" />
                  <span style={{ fontSize: 12, color: '#8893a5' }}>On the roadmap.</span>
                </div>
              </div>
            </div>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <footer
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 24,
                padding: '16px 36px',
                borderTop: '1px solid #e4e8ee',
                background: '#f4f6f9',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: '#8893a5',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontFamily: MONO,
                  }}
                >
                  What's next
                </div>
                <div
                  style={{ fontSize: 15.5, fontWeight: 600, margin: '4px 0 3px', color: '#1a2030' }}
                >
                  PTScribe ships new features monthly.{' '}
                  <span style={{ color: '#0ea5a8' }}>Try it free today.</span>
                </div>
                <div style={{ fontSize: 12.5, color: '#5a6577', maxWidth: 520 }}>
                  ICD-10 coding, mobile, and EHR integration are in active development. Most PTs pay
                  under $25/year at normal visit volume.
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onTryDemo?.();
                }}
                style={{
                  padding: '11px 24px',
                  background: '#0ea5a8',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background 150ms ease-out',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#0a6d70')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#0ea5a8')}
              >
                Try Demo →
              </button>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
