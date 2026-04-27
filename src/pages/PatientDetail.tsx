import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Mic, Pencil, Trash2, Calendar, MessageSquare, Plus, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import {
  Avatar,
  Eyebrow,
  Heatmap,
  PtButton,
  StatusBadge,
  SurfaceCard,
  type StatusTone,
} from '@/components/design';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { usePlans } from '@/contexts/PlansProvider';
import { useExercises } from '@/contexts/ExercisesProvider';
import { newId } from '@/utils/ids';
import { DAY_MS, fmtIsoDateOptional, isSameDay, parseIsoDate, relativeFromNow, startOfDay } from '@/utils/dates';
import { labelForType } from '@/utils/labels';
import type {
  Note,
  Patient,
  PatientStatus,
  PlanGoal,
  PlanOfCare,
  Prescription,
  Session,
  Sex,
} from '@/types';

type Tab = 'overview' | 'history' | 'measures' | 'hep' | 'documents' | 'billing';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'history', label: 'History' },
  { value: 'measures', label: 'Measures' },
  { value: 'hep', label: 'HEP' },
  { value: 'documents', label: 'Documents' },
  { value: 'billing', label: 'Billing' },
];

export function PatientDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getPatient, updatePatient, removePatient } = usePatients();
  const { forPatient: sessionsFor } = useSessions();
  const { forPatient: notesFor } = useNotes();
  const { activePlanForPatient, addPlan, updatePlan } = usePlans();
  const { exercises } = useExercises();

  const patient = getPatient(id);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [sameDaySessions, setSameDaySessions] = useState<Session[] | null>(null);

  const sessions = useMemo(
    () => (patient ? sessionsFor(patient.id) : []),
    [patient, sessionsFor]
  );
  const notes = useMemo(
    () => (patient ? notesFor(patient.id) : []),
    [patient, notesFor]
  );
  const plan = patient ? activePlanForPatient(patient.id) : undefined;

  if (!patient) {
    return (
      <div style={{ padding: 22 }}>
        <Link to="/patients">
          <PtButton variant="ghost">← Back to patients</PtButton>
        </Link>
        <SurfaceCard padding={20} style={{ marginTop: 14 }}>
          Patient not found.
        </SurfaceCard>
      </div>
    );
  }

  const age = ageFromDob(patient.dob);
  const status = derivePatientBadge(patient, sessions.length);
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const subtitle = [
    patient.primaryDiagnosis,
    patient.icd10,
    patient.referringProvider ? `Referred by ${patient.referringProvider}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function handleStartSession() {
    if (!patient) return;
    const today = Date.now();
    const todaySessions = sessions.filter(
      (s) => s.status !== 'finalized' && isSameDay(s.date, today),
    );
    if (todaySessions.length > 0) {
      setSameDaySessions(todaySessions);
    } else {
      navigate(`/sessions/new?patientId=${patient.id}`);
    }
  }

  function handleStartPlan() {
    if (!patient) return;
    const now = Date.now();
    const newPlan: PlanOfCare = {
      id: newId(),
      patientId: patient.id,
      startDate: now,
      goals: [],
      prescriptions: [],
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    addPlan(newPlan);
  }

  function handleDelete() {
    if (!patient) return;
    if (
      !confirm(
        `Remove ${patient.firstName} ${patient.lastName}? Sessions and notes are kept.`
      )
    )
      return;
    removePatient(patient.id);
    toast.success('Patient removed');
    navigate('/patients', { replace: true });
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        minHeight: '100%',
      }}
    >
      <PatientHeader
        patient={patient}
        age={age}
        fullName={fullName}
        subtitle={subtitle || 'No diagnosis on file'}
        status={status}
        tab={tab}
        onTab={setTab}
        onEdit={() => setEditing(true)}
        onStartSession={handleStartSession}
      />

      <div
        style={{
          padding: 22,
          background: 'var(--color-pt-surface-alt)',
          overflow: 'auto',
        }}
      >
        {tab === 'overview' && (
          <Overview
            patient={patient}
            sessions={sessions}
            notes={notes}
            plan={plan}
            onStartPlan={handleStartPlan}
            onUpdatePlan={(patch) => plan && updatePlan(plan.id, patch)}
            exercises={exercises}
            onDelete={handleDelete}
          />
        )}
        {tab !== 'overview' && (
          <SurfaceCard padding={40} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-pt-text-2)',
                marginBottom: 4,
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
              Tab placeholder — coming soon.
            </div>
          </SurfaceCard>
        )}
      </div>

      <EditPatientModal
        open={editing}
        patient={patient}
        onClose={() => setEditing(false)}
        onSave={(patch) => {
          updatePatient(patient.id, patch);
          setEditing(false);
        }}
      />

      <PatientSameDayModal
        sessions={sameDaySessions}
        patient={patient}
        onClose={() => setSameDaySessions(null)}
        onContinue={(sessionId) => navigate(`/sessions/${sessionId}`)}
        onCreateNew={() => {
          setSameDaySessions(null);
          navigate(`/sessions/new?patientId=${patient.id}`);
        }}
      />
    </div>
  );
}

function PatientHeader({
  patient,
  age,
  fullName,
  subtitle,
  status,
  tab,
  onTab,
  onEdit,
  onStartSession,
}: {
  patient: Patient;
  age: number | null;
  fullName: string;
  subtitle: string;
  status: { tone: StatusTone; label: string };
  tab: Tab;
  onTab: (t: Tab) => void;
  onEdit: () => void;
  onStartSession: () => void;
}) {
  const idLine = [
    `PT-${patient.id.slice(0, 5).toUpperCase()}`,
    age !== null ? `${age} yo` : null,
    patient.sex ? labelForSex(patient.sex) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      style={{
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '20px 22px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <Avatar name={fullName || '?'} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.3px',
                color: 'var(--color-pt-text)',
              }}
            >
              {fullName || 'Unnamed patient'}
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-pt-text-3)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {idLine}
            </span>
            <StatusBadge tone={status.tone} label={status.label} />
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-pt-text-2)',
              marginTop: 4,
            }}
          >
            {subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <PtButton variant="ghost" iconLeft={<MessageSquare size={14} strokeWidth={2} />}>
            Message
          </PtButton>
          <PtButton variant="ghost" iconLeft={<Calendar size={14} strokeWidth={2} />}>
            Schedule
          </PtButton>
          <PtButton variant="ghost" iconLeft={<Pencil size={14} strokeWidth={2} />} onClick={onEdit}>
            Edit
          </PtButton>
          <PtButton
            variant="primary"
            iconLeft={<Mic size={14} strokeWidth={2} />}
            onClick={onStartSession}
          >
            Start session
          </PtButton>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onTab(t.value)}
              style={{
                padding: '10px 0',
                border: 'none',
                background: 'transparent',
                borderBottom: `2px solid ${active ? 'var(--color-pt-accent)' : 'transparent'}`,
                color: active ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Overview({
  patient,
  sessions,
  notes,
  plan,
  onStartPlan,
  onUpdatePlan,
  exercises,
  onDelete,
}: {
  patient: Patient;
  sessions: Session[];
  notes: Note[];
  plan: PlanOfCare | undefined;
  onStartPlan: () => void;
  onUpdatePlan: (patch: Partial<PlanOfCare>) => void;
  exercises: ReturnType<typeof useExercises>['exercises'];
  onDelete: () => void;
}) {
  const [now] = useState(() => Date.now());
  const goalsMet = plan?.goals.filter((g) => g.met).length ?? 0;
  const totalGoals = plan?.goals.length ?? 0;
  const sessionsCount = sessions.length;
  const finalizedNotes = notes.filter((n) => n.finalized).length;
  const pendingNotes = notes.filter((n) => !n.finalized).length;

  const recentVisits = useMemo(
    () => [...sessions].sort((a, b) => b.date - a.date).slice(0, 5),
    [sessions]
  );

  // 14-day adherence: 1 if any session that day, scaled by count
  const adherence = useMemo(() => {
    const days = 14;
    const cells: number[] = Array.from({ length: days }, () => 0);
    const start = startOfDay(now) - (days - 1) * DAY_MS;
    for (const s of sessions) {
      const idx = Math.floor((startOfDay(s.date) - start) / DAY_MS);
      if (idx >= 0 && idx < days) cells[idx] = Math.min(1, cells[idx] + 0.4);
    }
    return cells.map((v) => Math.max(0.15, v));
  }, [sessions, now]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 360px',
        gap: 18,
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
        <SurfaceCard padding="16px 18px">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Eyebrow>Progress vs plan</Eyebrow>
            <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
              Last {Math.min(8, Math.max(2, Math.round(sessionsCount / 2)))} weeks
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 22,
              marginTop: 12,
            }}
          >
            <Metric
              label="Goals met"
              value={`${goalsMet}/${totalGoals || '—'}`}
              delta={totalGoals ? `${Math.round((goalsMet / totalGoals) * 100)}%` : '—'}
              tone={goalsMet > 0 ? 'good' : 'mute'}
              target={totalGoals ? 'set in plan' : 'no plan goals yet'}
              pct={totalGoals ? Math.round((goalsMet / totalGoals) * 100) : 0}
            />
            <Metric
              label="Sessions"
              value={String(sessionsCount)}
              delta={pendingNotes ? `${pendingNotes} pending` : 'all signed'}
              tone={pendingNotes ? 'warn' : 'good'}
              target={`${finalizedNotes} signed`}
              pct={
                sessionsCount > 0 ? Math.round((finalizedNotes / sessionsCount) * 100) : 0
              }
            />
            <Metric
              label="Days in care"
              value={daysInCare(patient, sessions, plan).toString()}
              delta={plan ? 'plan active' : 'no plan'}
              tone={plan ? 'good' : 'mute'}
              target={
                plan?.expectedDischargeDate
                  ? `discharge ${fmtIsoDateOptional(plan.expectedDischargeDate)}`
                  : 'open-ended'
              }
              pct={dischargePct(plan) ?? 0}
            />
          </div>
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--color-pt-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-pt-text)',
              }}
            >
              Recent visits
            </div>
            {sessions.length > recentVisits.length && (
              <button
                type="button"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-pt-accent-fg)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                View all {sessions.length} →
              </button>
            )}
          </div>
          {recentVisits.length === 0 ? (
            <div
              style={{
                padding: 24,
                fontSize: 13,
                color: 'var(--color-pt-text-3)',
                textAlign: 'center',
              }}
            >
              No sessions for this patient yet.
            </div>
          ) : (
            recentVisits.map((s, i) => {
              const note = notes.find((n) => n.sessionId === s.id);
              return (
                <VisitRow
                  key={s.id}
                  session={s}
                  note={note}
                  isLast={i === recentVisits.length - 1}
                />
              );
            })
          )}
        </SurfaceCard>

        <SurfaceCard padding="16px 18px">
          <Eyebrow>Plan of care</Eyebrow>
          {!plan ? (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)' }}>
                No active plan of care. Start one to set goals and prescribe exercises.
              </p>
              <PtButton variant="accent-soft" onClick={onStartPlan}>
                Start plan
              </PtButton>
            </div>
          ) : (
            <PlanEditor plan={plan} exercises={exercises} onChange={onUpdatePlan} />
          )}
        </SurfaceCard>

        <div>
          <button
            type="button"
            onClick={onDelete}
            className="transition-colors hover:bg-[var(--color-pt-surface-mut)]"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-pt-red)',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} strokeWidth={2} /> Remove patient
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <SurfaceCard padding="14px 16px">
          <Eyebrow>Active home program</Eyebrow>
          {plan && plan.prescriptions.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {plan.prescriptions.map((rx, i) => {
                const ex = exercises.find((e) => e.id === rx.exerciseId);
                const isNew = i === 0;
                return (
                  <ExRow
                    key={rx.id}
                    name={ex?.name ?? 'Unknown exercise'}
                    dosage={rx.dosage}
                    isNew={isNew}
                  />
                );
              })}
            </div>
          ) : (
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--color-pt-text-3)',
                marginTop: 8,
              }}
            >
              No exercises prescribed yet.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard padding="14px 16px">
          <Eyebrow>Adherence</Eyebrow>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginTop: 6,
            }}
          >
            <span
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: 'var(--color-pt-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {adherencePct(adherence)}%
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-pt-accent-fg)',
                fontWeight: 600,
              }}
            >
              last 14d
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Heatmap values={adherence} />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10.5,
              color: 'var(--color-pt-text-3)',
              marginTop: 6,
            }}
          >
            <span>2 wks ago</span>
            <span>Today</span>
          </div>
        </SurfaceCard>

        <SurfaceCard padding="14px 16px">
          <Eyebrow>Notes & flags</Eyebrow>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {patient.notes && <FlagItem tone="amber" text={patient.notes} />}
            {patient.referringProvider && (
              <FlagItem
                tone="mute"
                text={`Referred by ${patient.referringProvider}`}
              />
            )}
            {patient.icd10 && <FlagItem tone="mute" text={`ICD-10 ${patient.icd10}`} />}
            {!patient.notes && !patient.referringProvider && !patient.icd10 && (
              <p style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>
                No flags on file.
              </p>
            )}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

function VisitRow({
  session,
  note,
  isLast,
}: {
  session: Session;
  note: Note | undefined;
  isLast: boolean;
}) {
  const navigate = useNavigate();
  const dateLabel = new Date(session.date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const summary =
    session.transcript?.slice(0, 90).trim() || labelForType(session.type);
  const pendingSign = note && !note.finalized;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr auto auto',
        gap: 14,
        alignItems: 'center',
        padding: '12px 18px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-pt-border)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-pt-text-2)',
        }}
      >
        {dateLabel}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-pt-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={summary}
      >
        {summary}
      </div>
      {pendingSign && note ? (
        <button
          type="button"
          onClick={() => navigate(`/notes/${note.id}`)}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--color-pt-amber-border)',
            background: 'var(--color-pt-amber-soft)',
            color: 'var(--color-pt-amber-fg)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Review & sign
        </button>
      ) : note?.finalized ? (
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--color-pt-text-3)',
            fontWeight: 500,
          }}
        >
          Signed
        </span>
      ) : (
        <Link
          to={`/sessions/${session.id}`}
          style={{
            fontSize: 11.5,
            color: 'var(--color-pt-text-3)',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Open
        </Link>
      )}
      <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
        {relativeFromNow(session.date)}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
  tone,
  target,
  pct,
}: {
  label: string;
  value: string;
  delta: string;
  tone: 'good' | 'warn' | 'bad' | 'mute';
  target: string;
  pct: number;
}) {
  const deltaColor =
    tone === 'good'
      ? 'var(--color-pt-accent-fg)'
      : tone === 'warn'
        ? 'var(--color-pt-amber-fg)'
        : tone === 'bad'
          ? 'var(--color-pt-red)'
          : 'var(--color-pt-text-3)';
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>{label}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.3px',
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 11.5, color: deltaColor, fontWeight: 600 }}>
          {delta}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 4,
          borderRadius: 999,
          background: '#eef0f4',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--color-pt-accent)',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--color-pt-text-3)',
          marginTop: 4,
        }}
      >
        {target}
      </div>
    </div>
  );
}

function ExRow({
  name,
  dosage,
  isNew,
}: {
  name: string;
  dosage: string;
  isNew?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'var(--color-pt-surface-mut)',
          border: '1px solid var(--color-pt-border)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-pt-text-2)',
          fontSize: 14,
          fontWeight: 600,
        }}
        aria-hidden
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>{dosage}</div>
      </div>
      {isNew && (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'var(--color-pt-accent-soft)',
            color: 'var(--color-pt-accent-fg)',
            border: '1px solid var(--color-pt-accent-border)',
            letterSpacing: '0.6px',
          }}
        >
          NEW
        </span>
      )}
    </div>
  );
}

function FlagItem({ tone, text }: { tone: 'amber' | 'mute'; text: string }) {
  const colors =
    tone === 'amber'
      ? {
          bg: 'var(--color-pt-amber-soft)',
          bd: 'var(--color-pt-amber-border)',
          fg: 'var(--color-pt-amber-fg)',
          dot: '#c47a09',
        }
      : {
          bg: 'var(--color-pt-surface-mut)',
          bd: 'var(--color-pt-border)',
          fg: 'var(--color-pt-text-2)',
          dot: '#a4adbd',
        };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 9,
        background: colors.bg,
        border: `1px solid ${colors.bd}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: colors.dot,
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <div style={{ fontSize: 12, color: colors.fg, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

function PlanEditor({
  plan,
  exercises,
  onChange,
}: {
  plan: PlanOfCare;
  exercises: ReturnType<typeof useExercises>['exercises'];
  onChange: (patch: Partial<PlanOfCare>) => void;
}) {
  const [goalText, setGoalText] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [dosage, setDosage] = useState('');

  function addGoal() {
    if (!goalText.trim()) return;
    const g: PlanGoal = { id: newId(), text: goalText.trim(), met: false };
    onChange({ goals: [...plan.goals, g] });
    setGoalText('');
  }
  function toggleGoal(gid: string) {
    onChange({
      goals: plan.goals.map((g) => (g.id === gid ? { ...g, met: !g.met } : g)),
    });
  }
  function removeGoal(gid: string) {
    onChange({ goals: plan.goals.filter((g) => g.id !== gid) });
  }
  function addPrescription() {
    if (!exerciseId) return;
    const p: Prescription = {
      id: newId(),
      exerciseId,
      dosage: dosage.trim() || '3 sets x 10 reps',
    };
    onChange({ prescriptions: [...plan.prescriptions, p] });
    setExerciseId('');
    setDosage('');
  }
  function removePrescription(pid: string) {
    onChange({ prescriptions: plan.prescriptions.filter((p) => p.id !== pid) });
  }

  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-pt-text-2)',
          }}
        >
          Goals
        </div>
        <ul style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {plan.goals.length === 0 && (
            <li style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>
              No goals yet.
            </li>
          )}
          {plan.goals.map((g) => (
            <li key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input
                type="checkbox"
                checked={g.met}
                onChange={() => toggleGoal(g.id)}
                style={{ marginTop: 4 }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: g.met ? 'var(--color-pt-text-3)' : 'var(--color-pt-text)',
                  textDecoration: g.met ? 'line-through' : 'none',
                }}
              >
                {g.text}
              </span>
              <button
                type="button"
                onClick={() => removeGoal(g.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-pt-text-3)',
                  cursor: 'pointer',
                }}
                aria-label="Remove goal"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <TextInput
            placeholder="e.g., Return to overhead lifting pain-free in 6 weeks"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addGoal();
              }
            }}
          />
          <PtButton
            variant="accent-soft"
            onClick={addGoal}
            iconLeft={<Plus size={12} strokeWidth={2.4} />}
          >
            Add
          </PtButton>
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-pt-text-2)',
          }}
        >
          Prescriptions
        </div>
        <ul style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {plan.prescriptions.length === 0 && (
            <li style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>
              No exercises prescribed.
            </li>
          )}
          {plan.prescriptions.map((p) => {
            const ex = exercises.find((e) => e.id === p.exerciseId);
            return (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: 'var(--color-pt-text)' }}>
                    {ex?.name ?? 'Unknown exercise'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
                    {p.dosage}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePrescription(p.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-pt-text-3)',
                    cursor: 'pointer',
                  }}
                  aria-label="Remove prescription"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            );
          })}
        </ul>
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gap: 8,
            gridTemplateColumns: '1.4fr 1fr auto',
          }}
        >
          <Select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
            <option value="">Select exercise…</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <TextInput
            placeholder="3 x 10, daily"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
          />
          <PtButton
            variant="accent-soft"
            onClick={addPrescription}
            iconLeft={<Plus size={12} strokeWidth={2.4} />}
          >
            Add
          </PtButton>
        </div>
      </div>
    </div>
  );
}

function EditPatientModal({
  open,
  patient,
  onClose,
  onSave,
}: {
  open: boolean;
  patient: Patient;
  onClose: () => void;
  onSave: (patch: Partial<Patient>) => void;
}) {
  const [firstName, setFirstName] = useState(patient.firstName);
  const [lastName, setLastName] = useState(patient.lastName);
  const [dob, setDob] = useState(fmtIsoDateOptional(patient.dob));
  const [sex, setSex] = useState<Sex | ''>(patient.sex ?? '');
  const [mrn, setMrn] = useState(patient.mrn ?? '');
  const [diagnosis, setDiagnosis] = useState(patient.primaryDiagnosis ?? '');
  const [icd10, setIcd10] = useState(patient.icd10 ?? '');
  const [referring, setReferring] = useState(patient.referringProvider ?? '');
  const [status, setStatus] = useState<PatientStatus>(patient.status);
  const [notes, setNotes] = useState(patient.notes ?? '');

  function handleSave() {
    onSave({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dob: parseIsoDate(dob),
      sex: sex || undefined,
      mrn: mrn.trim() || undefined,
      primaryDiagnosis: diagnosis.trim() || undefined,
      icd10: icd10.trim() || undefined,
      referringProvider: referring.trim() || undefined,
      notes: notes.trim() || undefined,
      status,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit patient" size="lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label="Sex">
          <Select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
            <option value="">—</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
            <option value="X">Other</option>
          </Select>
        </Field>
        <Field label="MRN">
          <TextInput value={mrn} onChange={(e) => setMrn(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as PatientStatus)}>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="discharged">Discharged</option>
          </Select>
        </Field>
        <Field label="Primary diagnosis">
          <TextInput value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </Field>
        <Field label="ICD-10">
          <TextInput value={icd10} onChange={(e) => setIcd10(e.target.value)} />
        </Field>
        <Field label="Referring provider" className="sm:col-span-2">
          <TextInput value={referring} onChange={(e) => setReferring(e.target.value)} />
        </Field>
        <Field label="Internal notes" className="sm:col-span-2" hint="Visible only to you.">
          <textarea
            className="input min-h-24"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <PtButton variant="ghost" onClick={onClose}>
          Cancel
        </PtButton>
        <PtButton variant="primary" onClick={handleSave}>
          Save changes
        </PtButton>
      </div>
    </Modal>
  );
}

function ageFromDob(dob?: number): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - dob) / (365.25 * DAY_MS));
}

function labelForSex(s?: Sex): string {
  if (s === 'F') return 'F';
  if (s === 'M') return 'M';
  if (s === 'X') return 'X';
  return '';
}

function derivePatientBadge(
  p: Patient,
  sessionCount: number
): { tone: StatusTone; label: string } {
  if (p.status === 'discharged') return { tone: 'done', label: 'Discharged' };
  if (p.status === 'on_hold') return { tone: 'plateau', label: 'On hold' };
  if (sessionCount === 0) return { tone: 'new', label: 'New' };
  return { tone: 'on-track', label: 'On-track' };
}

function daysInCare(
  p: Patient,
  sessions: Session[],
  plan: PlanOfCare | undefined
): number {
  const start =
    plan?.startDate ??
    (sessions.length
      ? Math.min(...sessions.map((s) => s.date))
      : p.createdAt);
  return Math.max(0, Math.floor((Date.now() - start) / DAY_MS));
}

function dischargePct(plan: PlanOfCare | undefined): number | null {
  if (!plan?.expectedDischargeDate) return null;
  const total = plan.expectedDischargeDate - plan.startDate;
  if (total <= 0) return 0;
  const elapsed = Date.now() - plan.startDate;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

function adherencePct(cells: number[]): number {
  if (cells.length === 0) return 0;
  const avg = cells.reduce((a, b) => a + b, 0) / cells.length;
  return Math.round(avg * 100);
}

function PatientSameDayModal({
  sessions,
  patient,
  onClose,
  onContinue,
  onCreateNew,
}: {
  sessions: Session[] | null;
  patient: Patient;
  onClose: () => void;
  onContinue: (sessionId: string) => void;
  onCreateNew: () => void;
}) {
  if (!sessions) return null;
  const name = `${patient.firstName} ${patient.lastName}`;
  return (
    <Modal open onClose={onClose} title="Session already started today" size="sm">
      <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', margin: 0 }}>
        You have {sessions.length === 1 ? 'an open session' : `${sessions.length} open sessions`} for{' '}
        <strong>{name}</strong> today. Continue where you left off, or start fresh.
      </p>

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        {sessions.map((s) => {
          const time = new Date(s.date).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onContinue(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                border: '1px solid var(--color-pt-accent-border)',
                borderRadius: 10,
                background: 'var(--color-pt-accent-soft)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-accent-fg)' }}>
                  {labelForType(s.type)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', marginTop: 1 }}>
                  Started at {time}
                </div>
              </div>
              <ExternalLink size={14} color="var(--color-pt-accent)" strokeWidth={2} />
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <PtButton variant="ghost" onClick={onCreateNew}>
          Start new session anyway
        </PtButton>
        {sessions.length === 1 && (
          <PtButton variant="primary" onClick={() => onContinue(sessions[0].id)}>
            Continue session
          </PtButton>
        )}
      </div>
    </Modal>
  );
}
