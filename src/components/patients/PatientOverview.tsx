import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eyebrow, Heatmap, PtButton, StatusBadge, SurfaceCard } from '@/components/design';
import { DAY_MS, fmtIsoDateOptional, startOfDay } from '@/utils/dates';
import { labelForType } from '@/utils/labels';
import { daysInCare, dischargePct, adherencePct } from '@/utils/patientMetrics';
import { measureDef } from '@/lib/clinical/measures';
import { buildTrends, formatChange, formatValue } from '@/utils/measureTrend';
import { MeasureSparkline } from '@/components/patients/MeasureSparkline';
import type { Exercise, Measurement, Note, Patient, PlanOfCare, Session } from '@/types';

export function PatientOverview({
  patient,
  sessions,
  notes,
  plan,
  measurements,
  onStartPlan,
  exercises,
}: {
  patient: Patient;
  sessions: Session[];
  notes: Note[];
  plan: PlanOfCare | undefined;
  measurements: Measurement[];
  onStartPlan: () => void;
  /** Read-only here — prescriptions are edited on the Plan of care tab. */
  exercises: Exercise[];
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

  // buildTrends already sorts most-recently-measured first, so the top four are
  // the measures this clinician actually touched last.
  const topTrends = useMemo(() => buildTrends(measurements).slice(0, 4), [measurements]);

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
        gridTemplateColumns: '230px minmax(0, 1fr) 260px',
        gap: 16,
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <SurfaceCard padding="16px 18px">
          <Eyebrow>Progress vs plan</Eyebrow>
          <div style={{ display: 'grid', placeItems: 'center', margin: '14px 0 18px' }}>
            <GoalRing met={goalsMet} total={totalGoals} />
          </div>
          <BarMetric
            label="Sessions"
            value={String(sessionsCount)}
            segments={sessionsCount}
            filled={finalizedNotes}
            footLeft={`${sessionsCount} total`}
            footRight={pendingNotes ? `${pendingNotes} pending` : 'all signed'}
          />
          <div style={{ marginTop: 14 }}>
            <BarMetric
              label="Days in care"
              value={daysInCare(patient, sessions, plan).toString()}
              pct={dischargePct(plan) ?? 0}
              footLeft={`${daysInCare(patient, sessions, plan)} total`}
              footRight={
                plan?.expectedDischargeDate
                  ? `discharge ${fmtIsoDateOptional(plan.expectedDischargeDate)}`
                  : plan
                    ? 'plan active'
                    : 'no plan'
              }
            />
          </div>
        </SurfaceCard>
      </div>

      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
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
                fontSize: 'var(--text-md)',
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
                  fontSize: 'var(--text-sm)',
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
          {recentVisits.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: VISIT_COLS,
                gap: 14,
                padding: '8px 18px',
                borderBottom: '1px solid var(--color-pt-border)',
                fontSize: 'var(--text-2xs)',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-pt-text-3)',
              }}
            >
              <span>Date</span>
              <span>Visit</span>
              <span>Status</span>
              <span />
            </div>
          )}
          {recentVisits.length === 0 ? (
            <div
              style={{
                padding: 24,
                fontSize: 'var(--text-base)',
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

        {/* Latest objective measures. Editing lives on the Measures tab; this is
            the at-a-glance "is this patient getting better" answer. */}
        <SurfaceCard padding="16px 18px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow>Latest measures</Eyebrow>
            <Link
              to={`/patients/${patient.id}/measures`}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-pt-accent-fg)',
                textDecoration: 'none',
              }}
            >
              View all
            </Link>
          </div>
          {topTrends.length === 0 ? (
            <p
              style={{ marginTop: 10, fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)' }}
            >
              No measures recorded yet.
            </p>
          ) : (
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {topTrends.map((t) => {
                const def = measureDef(t.measureId);
                return (
                  <div
                    key={`${t.measureId}:${t.side ?? ''}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-2)' }}>
                      {t.label}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 600,
                        color: 'var(--color-pt-text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatValue(t.latest.value)}
                      {def.unit}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        minWidth: 40,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color:
                          t.direction === true
                            ? 'var(--color-pt-accent-fg)'
                            : t.direction === false
                              ? 'var(--color-pt-red)'
                              : 'var(--color-pt-text-3)',
                      }}
                    >
                      {formatChange(t.change) || '—'}
                    </span>
                    <MeasureSparkline trend={t} width={72} height={22} />
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard padding="16px 18px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow>Plan of care</Eyebrow>
            {plan && (
              <Link
                to={`/patients/${patient.id}/plan`}
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-pt-accent-fg)',
                  textDecoration: 'none',
                }}
              >
                Open plan
              </Link>
            )}
          </div>
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
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-pt-text-2)' }}>
                No active plan of care. Start one to set goals and prescribe exercises.
              </p>
              <PtButton variant="accent-soft" onClick={onStartPlan}>
                Start plan
              </PtButton>
            </div>
          ) : (
            <ul style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {plan.goals.length === 0 && (
                <li style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)' }}>
                  No goals set yet.
                </li>
              )}
              {plan.goals.slice(0, 4).map((g) => (
                <li
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: 'var(--text-sm)',
                    color: g.met ? 'var(--color-pt-text-3)' : 'var(--color-pt-text)',
                    textDecoration: g.met ? 'line-through' : 'none',
                  }}
                >
                  <span>{g.text}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-pt-text-3)',
                      flexShrink: 0,
                    }}
                  >
                    {fmtIsoDateOptional(g.targetDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>

      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <SurfaceCard padding="14px 16px">
          <Eyebrow>Active home program</Eyebrow>
          {plan && plan.prescriptions.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {plan.prescriptions.map((rx) => {
                const ex = exercises.find((e) => e.id === rx.exerciseId);
                return (
                  <ExRow key={rx.id} name={ex?.name ?? 'Unknown exercise'} dosage={rx.dosage} />
                );
              })}
            </div>
          ) : (
            <p
              style={{
                fontSize: 'var(--text-sm)',
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
                fontSize: 'var(--text-2xl)',
                fontWeight: 600,
                color: 'var(--color-pt-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {adherencePct(adherence)}%
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
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
              fontSize: 'var(--text-2xs)',
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
            {patient.notes && <PrivateNoteFlag text={patient.notes} />}
            {patient.referringProvider && (
              <FlagItem tone="mute" text={`Referred by ${patient.referringProvider}`} />
            )}
            {patient.icd10 && <FlagItem tone="mute" text={`ICD-10 ${patient.icd10}`} />}
            {!patient.notes && !patient.referringProvider && !patient.icd10 && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)' }}>
                No flags on file.
              </p>
            )}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

/** Shared by the visits header row and each VisitRow so columns line up. */
const VISIT_COLS = '110px minmax(0, 1fr) 70px 110px';

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
  const pendingSign = note && !note.finalized;

  const noteBadgeTone = note?.finalized ? 'on-track' : note ? 'next' : ('done' as const);
  const noteBadgeLabel = note?.finalized ? 'Final' : note ? 'Draft' : 'No Note';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: VISIT_COLS,
        gap: 14,
        alignItems: 'center',
        padding: '11px 18px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-pt-border)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-pt-text-2)',
        }}
      >
        {dateLabel}
      </div>
      <div
        style={{
          fontSize: 'var(--text-base)',
          color: 'var(--color-pt-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {labelForType(session.type)}
      </div>
      <StatusBadge tone={noteBadgeTone} label={noteBadgeLabel} />
      {pendingSign && note ? (
        <button
          type="button"
          onClick={() => navigate(`/sessions/${note.sessionId}?tab=review`)}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--color-pt-amber-border)',
            background: 'var(--color-pt-amber-soft)',
            color: 'var(--color-pt-amber-fg)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Review & sign
        </button>
      ) : note?.finalized ? (
        <span
          style={{
            fontSize: 'var(--text-xs)',
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
            fontSize: 'var(--text-xs)',
            color: 'var(--color-pt-text-3)',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Open
        </Link>
      )}
    </div>
  );
}

/** Goals-met donut. Inline SVG — no chart lib for one arc. */
function GoalRing({ met, total }: { met: number; total: number }) {
  const pct = total ? met / total : 0;
  const r = 56;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 140, height: 140 }}>
      <svg
        width={140}
        height={140}
        viewBox="0 0 140 140"
        role="img"
        aria-label={`${met} of ${total} goals met`}
      >
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="var(--color-pt-slate-soft)"
          strokeWidth="15"
        />
        {pct > 0 && (
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="var(--color-pt-accent)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={`${circ * pct} ${circ}`}
            transform="rotate(-90 70 70)"
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeContent: 'center',
          textAlign: 'center',
          gap: 1,
        }}
      >
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-3)' }}>Goals met</div>
        <div
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
          }}
        >
          {met}
          <span style={{ color: 'var(--color-pt-text-3)' }}>/{total || '—'}</span>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-3)' }}>
          {total ? `${Math.round(pct * 100)}%` : 'no goals'}
        </div>
      </div>
    </div>
  );
}

/**
 * Label + value over a bar. Pass `segments` for a per-session tick bar, or
 * `pct` for a continuous fill.
 */
function BarMetric({
  label,
  value,
  pct,
  segments,
  filled = 0,
  footLeft,
  footRight,
}: {
  label: string;
  value: string;
  pct?: number;
  segments?: number;
  filled?: number;
  footLeft: string;
  footRight: string;
}) {
  // More than a dozen ticks reads as noise — fall back to a continuous bar.
  const ticks = segments && segments > 0 && segments <= 12 ? segments : 0;
  const fillPct = ticks ? 0 : (pct ?? (segments ? Math.min(100, segments * 8) : 0));
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-2)' }}>{label}</span>
        <span
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 7 }}>
        {ticks ? (
          Array.from({ length: ticks }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: i < filled ? 'var(--color-pt-accent)' : 'var(--color-pt-slate-soft)',
              }}
            />
          ))
        ) : (
          <div
            style={{
              position: 'relative',
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: 'var(--color-pt-slate-soft)',
            }}
          >
            <div
              style={{
                width: `${fillPct}%`,
                height: '100%',
                borderRadius: 999,
                background: 'var(--color-pt-accent)',
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: -2,
                left: `calc(${fillPct}% - 5px)`,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--color-pt-accent)',
              }}
            />
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 6,
          fontSize: 'var(--text-2xs)',
          color: 'var(--color-pt-text-3)',
        }}
      >
        <span>{footLeft}</span>
        <span>{footRight}</span>
      </div>
    </div>
  );
}

function ExRow({ name, dosage }: { name: string; dosage: string }) {
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
          fontSize: 'var(--text-md)',
          fontWeight: 600,
        }}
        aria-hidden
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-3)' }}>{dosage}</div>
      </div>
    </div>
  );
}

/**
 * `patient.notes` is free text, which makes it the most likely place for the
 * sensitive narrative — psych history, substance use, housing, safety concerns.
 * The rest of this card is structured clinical metadata and stays visible; this
 * one is hidden until asked for, so the Overview tab can be open in a treatment
 * room without the note being readable from across it.
 */
function PrivateNoteFlag({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <FlagItem tone="amber" text={text} />;
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      style={{
        display: 'block',
        width: '100%',
        padding: 0,
        border: 'none',
        background: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      <FlagItem tone="amber" text="Clinical note on file — click to show" />
    </button>
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
      <div style={{ fontSize: 'var(--text-sm)', color: colors.fg, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}
