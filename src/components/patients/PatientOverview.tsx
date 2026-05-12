import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Eyebrow, Heatmap, PtButton, StatusBadge, SurfaceCard } from '@/components/design';
import { DAY_MS, fmtIsoDateOptional, relativeFromNow, startOfDay } from '@/utils/dates';
import { labelForType } from '@/utils/labels';
import { daysInCare, dischargePct, adherencePct } from '@/utils/patientMetrics';
import { PlanEditor } from '@/components/patients/PlanEditor';
import type { Exercise, Note, Patient, PlanOfCare, Session } from '@/types';

export function PatientOverview({
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
  exercises: Exercise[];
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
    [sessions],
  );

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
              pct={sessionsCount > 0 ? Math.round((finalizedNotes / sessionsCount) * 100) : 0}
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
              <FlagItem tone="mute" text={`Referred by ${patient.referringProvider}`} />
            )}
            {patient.icd10 && <FlagItem tone="mute" text={`ICD-10 ${patient.icd10}`} />}
            {!patient.notes && !patient.referringProvider && !patient.icd10 && (
              <p style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>No flags on file.</p>
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
  const summary = session.transcript?.slice(0, 90).trim() || labelForType(session.type);
  const pendingSign = note && !note.finalized;

  const noteBadgeTone = note?.finalized ? 'on-track' : note ? 'next' : ('done' as const);
  const noteBadgeLabel = note?.finalized ? 'Final' : note ? 'Draft' : 'No Note';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr auto auto auto',
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
      <StatusBadge tone={noteBadgeTone} label={noteBadgeLabel} />
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
        <span style={{ fontSize: 11.5, color: deltaColor, fontWeight: 600 }}>{delta}</span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 4,
          borderRadius: 999,
          background: 'var(--color-pt-slate-soft)',
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

function ExRow({ name, dosage, isNew }: { name: string; dosage: string; isNew?: boolean }) {
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
          dot: 'var(--color-pt-amber)',
        }
      : {
          bg: 'var(--color-pt-surface-mut)',
          bd: 'var(--color-pt-border)',
          fg: 'var(--color-pt-text-2)',
          dot: 'var(--color-pt-slate)',
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
