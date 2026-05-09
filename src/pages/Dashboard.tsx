import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sun, Mic, ChevronRight, Inbox, Headphones } from 'lucide-react';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { useClinician } from '@/contexts/ClinicianProvider';
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
import { newId } from '@/utils/ids';
import { UNASSIGNED_PATIENT_ID, type Session, type SessionStatus, type Patient } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function Dashboard() {
  const { patients } = usePatients();
  const { sessions, addSession } = useSessions();
  const { notes } = useNotes();
  const { clinician } = useClinician();
  const navigate = useNavigate();

  // Quick Record: create a draft session attached to the built-in Unassigned
  // patient and jump straight into recording. The user can reassign on the
  // session screen once the visit ends.
  function handleQuickRecord() {
    const now = Date.now();
    const session: Session = {
      id: newId(),
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

  const greetingName = clinician.name?.split(' ')[0] || 'there';
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
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
                <strong style={{ color: 'var(--color-pt-text)' }}>{todaysSessions.length}</strong>{' '}
                session{todaysSessions.length === 1 ? '' : 's'} on your schedule ·{' '}
                <strong style={{ color: 'var(--color-pt-text)' }}>{draftNotes.length}</strong> note
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
    </div>
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
  const items = [
    { label: 'Microphone', detail: 'Default device · 48 kHz', ok: true },
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
