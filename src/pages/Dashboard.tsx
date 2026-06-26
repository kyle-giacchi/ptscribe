import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Sun, Mic, ChevronRight, Inbox, Headphones, ClipboardCheck, Menu } from 'lucide-react';
import { Sidebar } from '@/components/common/Sidebar';
import { duration, ease } from '@/lib/motion';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { AudioCheck } from '@/components/audio/AudioCheck';
import {
  Avatar,
  Eyebrow,
  PtButton,
  StatCard,
  StatusBadge,
  StatusDot,
  SurfaceCard,
  type StatusTone,
} from '@/components/design';
import { shortLabelForType } from '@/utils/labels';
import { relativeFromNow } from '@/utils/dates';
import {
  UNASSIGNED_PATIENT_ID,
  type Note,
  type Session,
  type SessionStatus,
  type Patient,
} from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function Dashboard() {
  const { patients } = usePatients();
  const { sessions, addSession } = useSessions();
  const { notes } = useNotes();
  const { clinician } = useClinician();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sidebarOpen]);

  // Quick Record: create a draft session attached to the built-in Unassigned
  // patient and jump straight into recording. The user can reassign on the
  // session screen once the visit ends.
  function handleQuickRecord() {
    const now = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      patientId: UNASSIGNED_PATIENT_ID,
      type: 'follow_up',
      date: now,
      status: 'draft',
      clips: [],
      createdAt: now,
      updatedAt: now,
    };
    addSession(session);
    navigate(`/sessions/${session.id}?autoRecord=1`);
  }

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

  // Sessions that have a draft note — sorted oldest-first so the most overdue
  // appear at the top of the pending sign-off rail.
  const pendingSignOff = useMemo(() => {
    const draftNoteBySessionId = new Map<string, Note>();
    for (const n of notes) {
      if (!n.finalized) draftNoteBySessionId.set(n.sessionId, n);
    }
    return sessions
      .filter((s) => draftNoteBySessionId.has(s.id))
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [sessions, notes]);

  const greetingName = clinician.name?.split(' ')[0] || 'there';
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      className="dashboard-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: 'var(--dashboard-sidebar-cols, 220px 1fr)',
        minHeight: '100%',
      }}
    >
      {/* Desktop sidebar */}
      <Sidebar className="hidden md:grid" />

      {/* Page body */}
      <div className="min-w-0">
        {/* Mobile hamburger */}
        <div className="md:hidden" style={{ padding: '10px 16px 0' }}>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              border: '1px solid var(--color-pt-border)',
              background: 'var(--color-pt-surface)',
              color: 'var(--color-pt-text-2)',
            }}
          >
            <Menu size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          <div className="mx-auto max-w-[1400px] space-y-[18px]">
            {/* Hero strip */}
            <SurfaceCard padding="18px 22px">
              <div
                className="grid items-center"
                style={{ gridTemplateColumns: 'auto 1fr auto', gap: 18 }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: 'var(--color-pt-accent-soft)',
                    border: '1px solid var(--color-pt-accent-border)',
                    color: 'var(--color-pt-accent-fg)',
                  }}
                >
                  <Sun size={26} strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <div style={{ fontSize: 13, color: 'var(--color-pt-text-2)' }}>{dateStr}</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      letterSpacing: '-0.3px',
                      color: 'var(--color-pt-text)',
                      marginTop: 2,
                    }}
                  >
                    Good morning, {greetingName}.
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--color-pt-text-2)',
                      marginTop: 4,
                    }}
                  >
                    <strong style={{ color: 'var(--color-pt-text)' }}>
                      {todaysSessions.length}
                    </strong>{' '}
                    session{todaysSessions.length === 1 ? '' : 's'} on your schedule ·{' '}
                    <strong style={{ color: 'var(--color-pt-text)' }}>{draftNotes.length}</strong>{' '}
                    note
                    {draftNotes.length === 1 ? '' : 's'} awaiting sign-off
                  </div>
                </div>
                <div className="hidden items-center gap-2.5 md:flex">
                  <Link to="/notes" style={{ textDecoration: 'none' }}>
                    <PtButton variant="ghost" iconLeft={<Inbox size={14} strokeWidth={1.75} />}>
                      Open inbox
                    </PtButton>
                  </Link>
                  <Link to="/sessions/new" style={{ textDecoration: 'none' }}>
                    <PtButton variant="primary" iconLeft={<Mic size={14} strokeWidth={2} />}>
                      Start next session
                    </PtButton>
                  </Link>
                </div>
              </div>
            </SurfaceCard>

            {/* Pending sign-off rail — only shown when there are unfinalized notes */}
            {pendingSignOff.length > 0 && (
              <PendingSignOffRail sessions={pendingSignOff} patients={patients} notes={notes} />
            )}

            {/* Stat row */}
            <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
              <StatCard
                eyebrow="Sessions today"
                value={todaysSessions.length}
                trend={`${patients.filter((p) => p.status === 'active').length} active patients`}
                trendKind="neutral"
              />
              <StatCard
                eyebrow="Avg session length"
                value={avgDuration ? `${avgDuration}m` : '—'}
                trend={avgDuration ? 'Across recorded visits' : 'No data yet'}
                trendKind="neutral"
              />
              <StatCard
                eyebrow="Notes pending sign"
                value={draftNotes.length}
                trend={draftNotes.length === 0 ? 'You’re caught up' : 'Review queue'}
                trendKind={draftNotes.length === 0 ? 'good' : 'warn'}
              />
              <StatCard eyebrow="Audio drops (7d)" value={0} trend="Mic stable" trendKind="good" />
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[1fr_360px]">
              <ScheduleCard sessions={todaysSessions} patients={patients} />
              <div className="flex flex-col gap-3.5">
                <SignOffRail notes={draftNotes} patients={patients} />
                <AudioCheckRail />
                <QuickCaptureRail onQuickRecord={handleQuickRecord} />
              </div>
            </div>
          </div>

          {resumeModal &&
            (() => {
              const resumePatient = patients.find((p) => p.id === resumeModal.patientId);
              const resumePatientName = resumePatient
                ? `${resumePatient.firstName} ${resumePatient.lastName}`.trim()
                : 'Unknown patient';
              return (
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    margin: '-22px -22px 0',
                    padding: '10px 22px',
                    background: 'var(--color-pt-accent-soft)',
                    borderBottom: '1px solid var(--color-pt-accent-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13.5,
                      color: 'var(--color-pt-accent-fg)',
                      lineHeight: 1.4,
                    }}
                  >
                    <strong>Session in progress</strong> — unfinished session for{' '}
                    <strong>{resumePatientName}</strong> from{' '}
                    {relativeFromNow(resumeModal.updatedAt)}.
                  </div>
                  <div className="flex gap-2">
                    <PtButton
                      variant="primary"
                      style={{ fontSize: 12, padding: '5px 12px' }}
                      onClick={() => {
                        setResumeDismissed(true);
                        navigate(`/sessions/${resumeModal.id}?mode=quick`);
                      }}
                    >
                      Continue session
                    </PtButton>
                    <PtButton
                      variant="ghost"
                      style={{ fontSize: 12, padding: '5px 12px' }}
                      onClick={() => setResumeDismissed(true)}
                    >
                      Dismiss
                    </PtButton>
                  </div>
                </div>
              );
            })()}
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              className="absolute inset-0"
              style={{ background: 'var(--color-pt-overlay)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.quick, ease: ease.standard }}
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="absolute inset-y-0 left-0"
              style={{ width: 220, paddingLeft: 'env(safe-area-inset-left)' }}
              initial={{ x: -220 }}
              animate={{ x: 0 }}
              exit={{ x: -220 }}
              transition={{ duration: duration.base, ease: ease.enter }}
            >
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Pending Sign-Off Rail ───────────────────────────────────────────────────

const PENDING_RAIL_MAX = 5;

function PendingSignOffRail({
  sessions,
  patients,
  notes,
}: {
  sessions: Session[];
  patients: Patient[];
  notes: Note[];
}) {
  const navigate = useNavigate();
  const shown = sessions.slice(0, PENDING_RAIL_MAX);
  const overflow = sessions.length - shown.length;
  // Pinned at mount for the session-age tone classifier — a remount on
  // navigation re-pins it.
  const [now] = useState(() => Date.now());

  // Build a quick lookup: sessionId → note (only draft notes were passed in)
  const noteBySessionId = useMemo(() => {
    const map = new Map<string, Note>();
    for (const n of notes) {
      if (!n.finalized) map.set(n.sessionId, n);
    }
    return map;
  }, [notes]);

  return (
    <SurfaceCard>
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '13px 18px',
          borderBottom: '1px solid var(--color-pt-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: 'var(--color-pt-warn-soft, #fff8eb)',
              color: 'var(--color-pt-warn-fg, #b45309)',
            }}
          >
            <ClipboardCheck size={13} strokeWidth={2} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-pt-text)' }}>
            Pending sign-off
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 20,
              height: 18,
              padding: '0 6px',
              borderRadius: 999,
              background: 'var(--color-pt-warn-soft, #fff8eb)',
              color: 'var(--color-pt-warn-fg, #b45309)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {sessions.length}
          </span>
        </div>
        {overflow > 0 && (
          <Link
            to="/notes"
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--color-pt-accent-fg)',
              textDecoration: 'none',
            }}
          >
            View all {sessions.length} →
          </Link>
        )}
      </div>

      {/* Row list */}
      <ul>
        {shown.map((s, i) => {
          const patient = patients.find((p) => p.id === s.patientId);
          const patientName = patient
            ? `${patient.firstName} ${patient.lastName}`.trim()
            : 'Unknown patient';
          const note = noteBySessionId.get(s.id);
          const ageHours = note ? (now - note.updatedAt) / 3_600_000 : 0;
          const ageTone: StatusTone =
            ageHours > 48 ? 'flagged' : ageHours > 24 ? 'plateau' : 'on-track';

          return (
            <li key={s.id}>
              <div
                className="grid items-center"
                style={{
                  gridTemplateColumns: '32px 1fr auto auto',
                  gap: 12,
                  padding: '11px 18px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-pt-border)',
                }}
              >
                <Avatar name={patientName} size={32} />
                <div className="min-w-0">
                  <div
                    className="truncate"
                    style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-pt-text)' }}
                  >
                    {patientName}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', marginTop: 1 }}>
                    {new Date(s.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {relativeFromNow(s.createdAt)}
                  </div>
                </div>
                <StatusBadge tone={ageTone} label={ageLabel(ageHours)} />
                <PtButton
                  variant="ghost"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                >
                  Finish note
                </PtButton>
              </div>
            </li>
          );
        })}
      </ul>
    </SurfaceCard>
  );
}

function ScheduleCard({ sessions, patients }: { sessions: Session[]; patients: Patient[] }) {
  return (
    <SurfaceCard>
      <div
        className="flex items-center justify-between"
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-pt-border)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-pt-text)' }}>
          Today&rsquo;s schedule
        </div>
        <Link
          to="/patients"
          style={{
            fontSize: 11.5,
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
            fontSize: 13,
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
        <ul>
          {sessions.map((s, i) => {
            const patient = patients.find((p) => p.id === s.patientId);
            const isLive = s.status === 'recording';
            const tone: StatusTone = scheduleTone(s.status, i, sessions.length);
            return (
              <li key={s.id}>
                <Link
                  to={`/sessions/${s.id}`}
                  className="grid items-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
                  style={{
                    gridTemplateColumns: '70px 32px 1fr auto auto',
                    gap: 14,
                    padding: '12px 18px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--color-pt-border)',
                    textDecoration: 'none',
                    background: isLive ? 'var(--color-pt-accent-soft)' : 'transparent',
                  }}
                >
                  <div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-pt-text)',
                      }}
                    >
                      {new Date(s.date).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    {s.durationMin ? (
                      <div style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)' }}>
                        {s.durationMin}m
                      </div>
                    ) : null}
                  </div>
                  <Avatar
                    name={patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown'}
                    size={32}
                  />
                  <div className="min-w-0">
                    <div
                      className="truncate"
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: 'var(--color-pt-text)',
                      }}
                    >
                      {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}
                    </div>
                    <div
                      className="truncate"
                      style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}
                    >
                      {shortLabelForType(s.type)}
                      {patient?.primaryDiagnosis ? ` · ${patient.primaryDiagnosis}` : ''}
                    </div>
                  </div>
                  <StatusBadge tone={tone} label={labelForStatus(s.status)} />
                  <ChevronRight size={14} color="var(--color-pt-text-3)" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}

function scheduleTone(status: SessionStatus, i: number, total: number): StatusTone {
  if (status === 'finalized') return 'done';
  if (status === 'recording' || status === 'transcribing' || status === 'generating') return 'live';
  if (i === 0 || i === Math.min(1, total - 1)) return 'next';
  return 'upcoming';
}

function labelForStatus(s: SessionStatus): string {
  switch (s) {
    case 'finalized':
      return 'Signed';
    case 'ready':
      return 'Ready';
    case 'generating':
      return 'Drafting';
    case 'transcribing':
      return 'Transcribing';
    case 'recording':
      return 'Recording';
    case 'draft':
    default:
      return 'Draft';
  }
}

function SignOffRail({
  notes,
  patients,
}: {
  notes: ReturnType<typeof useNotes>['notes'];
  patients: Patient[];
}) {
  const [now] = useState(() => Date.now());
  return (
    <SurfaceCard padding="14px 16px">
      <Eyebrow>Needs your sign-off</Eyebrow>
      {notes.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-pt-text-2)',
            marginTop: 12,
          }}
        >
          You&rsquo;re caught up.
        </div>
      ) : (
        <ul style={{ marginTop: 10 }} className="flex flex-col gap-2.5">
          {notes.slice(0, 4).map((n) => {
            const patient = patients.find((p) => p.id === n.patientId);
            const ageHours = (now - n.updatedAt) / (1000 * 60 * 60);
            const tone: StatusTone =
              ageHours > 48 ? 'flagged' : ageHours > 24 ? 'plateau' : 'on-track';
            return (
              <li key={n.id}>
                <Link
                  to={`/sessions/${n.sessionId}`}
                  className="flex items-center gap-2.5 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 9,
                    border: '1px solid var(--color-pt-border)',
                    background: 'var(--color-pt-surface-mut)',
                    textDecoration: 'none',
                  }}
                >
                  <Avatar
                    name={patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown'}
                    size={28}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate"
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--color-pt-text)',
                      }}
                    >
                      {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
                      {n.format.toUpperCase()} · {new Date(n.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge tone={tone} label={ageLabel(ageHours)} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}

function ageLabel(hours: number): string {
  if (hours < 1) return 'now';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

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
    { label: 'Backup recorder', detail: 'Browser fallback ready', ok: true },
    { label: 'Cloud sync', detail: 'Local-only — disabled', ok: true },
  ];
  return (
    <SurfaceCard padding="14px 16px">
      <Eyebrow>Audio system check</Eyebrow>
      <ul style={{ marginTop: 10 }} className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2.5">
            <span
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: 'var(--color-pt-accent-soft)',
                color: 'var(--color-pt-accent-fg)',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--color-pt-text)',
                }}
              >
                {it.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>{it.detail}</div>
            </div>
          </li>
        ))}
      </ul>
      <PtButton
        variant="ghost"
        onClick={() => setCheckOpen(true)}
        iconLeft={<Mic size={14} />}
        style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
      >
        Test microphone
      </PtButton>
      <AudioCheck open={checkOpen} onClose={() => setCheckOpen(false)} />
    </SurfaceCard>
  );
}

function QuickCaptureRail({ onQuickRecord }: { onQuickRecord: () => void }) {
  return (
    <SurfaceCard
      padding="16px 18px"
      style={{
        background: 'var(--color-pt-accent-soft)',
        borderColor: 'var(--color-pt-accent-border)',
      }}
    >
      <Eyebrow>
        <span style={{ color: 'var(--color-pt-accent-fg)' }}>Quick capture</span>
      </Eyebrow>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-pt-accent-fg)',
          marginTop: 8,
          lineHeight: 1.5,
        }}
      >
        Tap record now — you can pick (or add) the patient after the visit.
      </div>
      <button
        type="button"
        onClick={onQuickRecord}
        className="mt-3 inline-flex items-center gap-2"
        style={{
          background: 'var(--color-pt-surface)',
          padding: '8px 14px',
          borderRadius: 999,
          color: 'var(--color-pt-accent-fg)',
          fontSize: 12.5,
          fontWeight: 600,
          border: '1px solid var(--color-pt-accent-border)',
          cursor: 'pointer',
        }}
      >
        <StatusDot color="var(--color-pt-accent)" pulse size={8} />
        Record now
      </button>
      <div
        className="mt-4 flex items-center gap-2"
        style={{ fontSize: 11, color: 'var(--color-pt-accent-fg)' }}
      >
        <Headphones size={12} strokeWidth={1.75} />
        Mic test available in settings
      </div>
    </SurfaceCard>
  );
}
