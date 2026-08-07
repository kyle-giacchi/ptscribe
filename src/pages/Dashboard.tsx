import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mic, Check, AlertTriangle } from 'lucide-react';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { AudioCheck } from '@/components/audio/AudioCheck';
import { Eyebrow, PtButton, StatCard, SurfaceCard } from '@/components/design';
import { shortLabelForType } from '@/utils/labels';
import { relativeFromNow } from '@/utils/dates';
import { shortName } from '@/utils/patients';
import type { Note, Session, Patient } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const INBOX_MAX = 3;
/** Hero bottom padding — the inbox cancels it out before adding its own overhang. */
const HERO_PAD_BOTTOM = 22;
/** How far the Priority Inbox hangs below the hero's bottom edge. */
const OVERHANG_Y = 40;

export function Dashboard() {
  const { patients } = usePatients();
  const { sessions } = useSessions();
  const { notes } = useNotes();
  const { clinician } = useClinician();
  const navigate = useNavigate();

  // Resume-modal candidate is derived from sessions; `resumeDismissed` is set
  // by the user's "Not now"/"Resume" click, so we don't need an effect to
  // trigger the modal.
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const resumeModal = useMemo<Session | null>(() => {
    if (resumeDismissed) return null;
    return (
      sessions
        .filter((s) => s.status !== 'finalized' && s.clips.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    );
  }, [sessions, resumeDismissed]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const todaysSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.date >= today && s.date < today + DAY_MS)
        .sort((a, b) => a.date - b.date),
    [sessions, today],
  );

  const avgDuration = useMemo(() => {
    const finalized = sessions.filter((s) => s.durationMin && s.durationMin > 0);
    if (!finalized.length) return null;
    const sum = finalized.reduce((acc, s) => acc + (s.durationMin ?? 0), 0);
    return Math.round(sum / finalized.length);
  }, [sessions]);

  const draftNotes = useMemo(
    () => notes.filter((n) => !n.finalized).sort((a, b) => b.updatedAt - a.updatedAt),
    [notes],
  );

  // Priority Inbox — draft notes, oldest first so the most overdue sits on top.
  const priorityInbox = useMemo(
    () => notes.filter((n) => !n.finalized).sort((a, b) => a.updatedAt - b.updatedAt),
    [notes],
  );

  const greetingName = clinician.name?.split(' ')[0] || 'there';

  return (
    <div style={{ padding: 22 }}>
      {resumeModal && (
        <ResumeBanner
          session={resumeModal}
          patients={patients}
          onDismiss={() => setResumeDismissed(true)}
          onContinue={() => {
            setResumeDismissed(true);
            navigate(`/sessions/${resumeModal.id}?mode=quick`);
          }}
        />
      )}

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_300px]">
        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          <HeroPanel
            greetingName={greetingName}
            notes={priorityInbox}
            patients={patients}
            totalPending={draftNotes.length}
          />

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <StatCard
              eyebrow="Sessions today"
              value={<AccentValue>{todaysSessions.length}</AccentValue>}
              trend={`${patients.filter((p) => p.status === 'active').length} active patients`}
              trendKind="neutral"
            />
            <StatCard
              eyebrow="Avg session length"
              value={<AccentValue>{avgDuration ? `${avgDuration}m` : '—'}</AccentValue>}
              trend={avgDuration ? 'Across recorded visits' : 'No data yet'}
              trendKind="neutral"
            />
            <StatCard
              eyebrow="Notes pending sign"
              value={<AccentValue>{draftNotes.length}</AccentValue>}
              trend={draftNotes.length === 0 ? 'You’re caught up' : 'Review queue'}
              trendKind={draftNotes.length === 0 ? 'good' : 'warn'}
            />
          </div>

          <ScheduleCard sessions={todaysSessions} patients={patients} />
        </div>

        {/* ── Right rail ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3.5">
          <AudioCheckRail />
        </div>
      </div>
    </div>
  );
}

function AccentValue({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--color-pt-accent-fg)' }}>{children}</span>;
}

// ─── Hero + Priority Inbox ───────────────────────────────────────────────────

function HeroPanel({
  greetingName,
  notes,
  patients,
  totalPending,
}: {
  greetingName: string;
  notes: Note[];
  patients: Patient[];
  totalPending: number;
}) {
  const navigate = useNavigate();
  const shown = notes.slice(0, INBOX_MAX);
  const overlaps = shown.length > 0;

  return (
    // The inbox card hangs below the hero's bottom edge. The wrapper's
    // margin-bottom gives that overhang real flow space so the stat row below
    // never collides with it.
    <div style={{ marginBottom: overlaps ? OVERHANG_Y : 0 }}>
      <SurfaceCard
        padding={`26px 26px ${HERO_PAD_BOTTOM}px`}
        radius={18}
        bordered={false}
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--color-pt-accent) 24%, var(--color-pt-surface)) 0%, var(--color-pt-accent-soft) 62%)',
          overflow: 'visible',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            letterSpacing: '-0.5px',
            color: 'var(--color-pt-text)',
            lineHeight: 1.15,
          }}
        >
          Good morning, {greetingName}.
        </h1>

        <PtButton
          variant="primary"
          onClick={() => navigate('/sessions/new')}
          style={{
            marginTop: 16,
            padding: '11px 20px',
            fontSize: 'var(--text-md)',
            borderRadius: 10,
          }}
        >
          Start session
        </PtButton>

        {overlaps && (
          <SurfaceCard
            radius={12}
            style={{
              marginTop: 20,
              marginBottom: -(OVERHANG_Y + HERO_PAD_BOTTOM),
              boxShadow: '0 10px 26px rgba(26,32,48,0.13)',
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                background: 'var(--color-pt-accent-deep)',
                color: '#ffffff',
                padding: '9px 16px',
              }}
            >
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Priority inbox</span>
              {totalPending > shown.length && (
                <Link
                  to="/notes"
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: '#fff',
                    textDecoration: 'none',
                  }}
                >
                  View all {totalPending} →
                </Link>
              )}
            </div>
            <ul>
              {shown.map((n, i) => {
                const patient = patients.find((p) => p.id === n.patientId);
                const patientName = patient ? shortName(patient) : 'Unassigned patient';
                const patientFullName = patient
                  ? `${patient.firstName} ${patient.lastName}`.trim()
                  : 'Unassigned patient';
                return (
                  <li
                    key={n.id}
                    className="flex items-center gap-3"
                    style={{
                      padding: '11px 16px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--color-pt-border)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate"
                        title={patientFullName}
                        style={{
                          fontSize: 'var(--text-md)',
                          fontWeight: 600,
                          color: 'var(--color-pt-text)',
                        }}
                      >
                        {patientName}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--color-pt-text-3)',
                          marginTop: 2,
                        }}
                      >
                        {n.format.toUpperCase()} · {new Date(n.updatedAt).toLocaleDateString()} ·
                        Pending sign-off
                      </div>
                    </div>
                    <PtButton
                      variant="primary"
                      onClick={() => navigate(`/sessions/${n.sessionId}?tab=review`)}
                      style={{ padding: '8px 14px', fontSize: 'var(--text-sm)', flexShrink: 0 }}
                    >
                      Complete note
                    </PtButton>
                  </li>
                );
              })}
            </ul>
          </SurfaceCard>
        )}
      </SurfaceCard>
    </div>
  );
}

// ─── Today's schedule ────────────────────────────────────────────────────────

function ScheduleCard({ sessions, patients }: { sessions: Session[]; patients: Patient[] }) {
  return (
    <SurfaceCard>
      <div className="flex items-center justify-between" style={{ padding: '14px 18px 12px' }}>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-pt-text)' }}>
          Today&rsquo;s schedule
        </div>
        <Link
          to="/patients"
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--color-pt-accent-fg)',
            textDecoration: 'none',
          }}
        >
          View all patients →
        </Link>
      </div>
      {sessions.length === 0 ? (
        <div
          style={{
            padding: '40px 18px',
            textAlign: 'center',
            color: 'var(--color-pt-text-2)',
            fontSize: 'var(--text-base)',
          }}
        >
          No sessions on the calendar yet.{' '}
          <Link
            to="/sessions/new"
            style={{ color: 'var(--color-pt-accent-fg)', textDecoration: 'none' }}
          >
            Start one now →
          </Link>
        </div>
      ) : (
        <ul style={{ padding: '0 18px 18px' }} className="flex flex-col gap-2.5">
          {sessions.map((s) => {
            const patient = patients.find((p) => p.id === s.patientId);
            const patientName = patient ? shortName(patient) : 'Unassigned patient';
            const patientFullName = patient
              ? `${patient.firstName} ${patient.lastName}`.trim()
              : 'Unassigned patient';
            const isLive = s.status === 'recording';
            return (
              <li
                key={s.id}
                className="grid items-center"
                style={{ gridTemplateColumns: '84px 1fr', gap: 12 }}
              >
                <div
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 500,
                    color: 'var(--color-pt-text-2)',
                  }}
                >
                  {new Date(s.date).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
                <Link
                  to={`/sessions/${s.id}`}
                  title={`${shortLabelForType(s.type)} with ${patientFullName}`}
                  className="block truncate transition-colors hover:brightness-[0.97]"
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    borderLeft: '4px solid var(--color-pt-accent)',
                    background: isLive
                      ? 'var(--color-pt-accent-soft)'
                      : 'var(--color-pt-surface-mut)',
                    boxShadow: 'inset 0 0 0 1px var(--color-pt-border)',
                    color: 'var(--color-pt-text)',
                    fontSize: 'var(--text-md)',
                    textDecoration: 'none',
                  }}
                >
                  {shortLabelForType(s.type)} with {patientName}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}

// ─── Right rail ──────────────────────────────────────────────────────────────

function AudioCheckRail() {
  const { settings } = useSettings();
  const [checkOpen, setCheckOpen] = useState(false);
  const [micLabel, setMicLabel] = useState<string | null>(null);

  const preferredId = settings.audio.inputDeviceId;

  // Resolve a friendly label for the chosen mic. Labels are only available once
  // mic permission has been granted at least once; otherwise we show a generic name.
  useEffect(() => {
    // No stored device → micDetail shows "System default" and never reads micLabel,
    // so a stale label here is harmless (and resetting it synchronously trips the
    // no-setState-in-effect rule).
    if (!preferredId) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (cancelled) return;
        const match = all.find((d) => d.kind === 'audioinput' && d.deviceId === preferredId);
        setMicLabel(match?.label?.trim() || 'Selected microphone');
      })
      .catch(() => {
        /* permission not granted yet — keep the generic label */
      });
    return () => {
      cancelled = true;
    };
  }, [preferredId]);

  const micDetail = preferredId ? (micLabel ?? 'Selected microphone') : 'System default device';

  const items = [
    { label: 'Microphone', detail: micDetail, ok: true },
    {
      label: 'Transcription Service',
      detail: settings.ai.transcription.model || 'Not configured',
      ok: Boolean(settings.ai.transcription.model),
    },
    // Local-only is the intended posture, but it's a caveat rather than a green
    // light — clinicians should know nothing is syncing off-device.
    { label: 'Cloud sync', detail: 'Local-only — disabled', ok: false },
    {
      label: 'AI Note Generation',
      detail: settings.ai.generation.model || 'Not configured',
      ok: Boolean(settings.ai.generation.model),
    },
  ];

  return (
    <SurfaceCard padding="14px 16px">
      <Eyebrow>System checks</Eyebrow>
      <ul style={{ marginTop: 12 }} className="flex flex-col gap-3">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2.5">
            <span
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 20,
                height: 20,
                borderRadius: 999,
                background: it.ok ? 'var(--color-pt-accent)' : 'var(--color-pt-amber)',
                color: '#fff',
              }}
              aria-hidden
            >
              {it.ok ? (
                <Check size={12} strokeWidth={3} />
              ) : (
                <AlertTriangle size={11} strokeWidth={3} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  color: 'var(--color-pt-text)',
                }}
              >
                {it.label}
                <span className="sr-only">{it.ok ? ' — ok' : ' — attention'}</span>
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)' }}>
                {it.detail}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <PtButton
        variant="ghost"
        onClick={() => setCheckOpen(true)}
        iconLeft={<Mic size={14} />}
        style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
      >
        Test microphone
      </PtButton>
      <AudioCheck open={checkOpen} onClose={() => setCheckOpen(false)} />
    </SurfaceCard>
  );
}

// ─── Resume banner ───────────────────────────────────────────────────────────

function ResumeBanner({
  session,
  patients,
  onContinue,
  onDismiss,
}: {
  session: Session;
  patients: Patient[];
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const patient = patients.find((p) => p.id === session.patientId);
  const name = patient ? shortName(patient) : 'Unknown patient';
  const fullName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : 'Unknown patient';
  return (
    <div
      className="mx-auto mb-[18px] flex max-w-[1400px] flex-wrap items-center gap-3"
      style={{
        padding: '10px 16px',
        borderRadius: 12,
        background: 'var(--color-pt-accent-soft)',
        border: '1px solid var(--color-pt-accent-border)',
      }}
    >
      <div
        className="min-w-0 flex-1"
        style={{
          fontSize: 'var(--text-base)',
          color: 'var(--color-pt-accent-fg)',
          lineHeight: 1.4,
        }}
      >
        <strong>Session in progress</strong> — unfinished session for{' '}
        <strong title={fullName}>{name}</strong> from {relativeFromNow(session.updatedAt)}.
      </div>
      <div className="flex gap-2">
        <PtButton
          variant="primary"
          style={{ fontSize: 'var(--text-sm)', padding: '5px 12px' }}
          onClick={onContinue}
        >
          Continue session
        </PtButton>
        <PtButton
          variant="ghost"
          style={{ fontSize: 'var(--text-sm)', padding: '5px 12px' }}
          onClick={onDismiss}
        >
          Dismiss
        </PtButton>
      </div>
    </div>
  );
}
