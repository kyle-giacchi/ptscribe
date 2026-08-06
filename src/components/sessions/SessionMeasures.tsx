import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { TextInput } from '@/components/ui/Field';
import { MeasureEntryForm } from '@/components/patients/PatientMeasures';
import { measureDef } from '@/lib/clinical/measures';
import { buildTrends, formatChange, formatValue, type MeasureTrend } from '@/utils/measureTrend';
import { fmtIsoDate, fmtIsoDateOptional } from '@/utils/dates';
import type { Measurement } from '@/types';

/**
 * Objective measures captured *during* the visit rather than retyped afterwards.
 *
 * Every measure this patient already tracks gets a prefilled row showing the last
 * reading, so recording today's is one number. Readings saved here carry
 * `sessionId` — the link that makes a note and its measures the same visit.
 */
export function SessionMeasures({
  patientId,
  sessionId,
  sessionDate,
  measurements,
  onAdd,
  onRemove,
  readOnly = false,
}: {
  patientId: string;
  sessionId: string;
  /** Visit date — what a reading recorded here is dated. */
  sessionDate: number;
  /** Every measurement for this patient, not just this visit. */
  measurements: Measurement[];
  onAdd: (m: Measurement) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const trends = useMemo(() => buildTrends(measurements), [measurements]);
  const recordedCount = measurements.filter((m) => m.sessionId === sessionId).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <Eyebrow>
          {recordedCount === 0 ? 'No measures this visit' : `${recordedCount} recorded this visit`}
        </Eyebrow>
        {!readOnly && (
          <PtButton
            variant={adding ? 'ghost' : 'accent-soft'}
            onClick={() => setAdding(!adding)}
            iconLeft={
              adding ? <X size={13} strokeWidth={2.2} /> : <Plus size={13} strokeWidth={2.4} />
            }
          >
            {adding ? 'Cancel' : trends.length > 0 ? 'Another measure' : 'Record measure'}
          </PtButton>
        )}
      </div>

      {adding && (
        <MeasureEntryForm
          patientId={patientId}
          sessionId={sessionId}
          defaultDate={fmtIsoDate(sessionDate)}
          onSubmit={(m) => {
            onAdd(m);
            setAdding(false);
          }}
        />
      )}

      {trends.length === 0 ? (
        !adding && (
          <SurfaceCard padding={28} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)', lineHeight: 1.5 }}>
              Nothing tracked for this patient yet. Record pain, range of motion, or an outcome
              measure here and it lands on their Measures tab.
            </div>
          </SurfaceCard>
        )
      ) : (
        <SurfaceCard padding={0}>
          {trends.map((trend, i) => (
            <QuickRow
              key={`${trend.measureId}:${trend.side ?? ''}`}
              trend={trend}
              patientId={patientId}
              sessionId={sessionId}
              sessionDate={sessionDate}
              isLast={i === trends.length - 1}
              readOnly={readOnly}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ))}
        </SurfaceCard>
      )}
    </div>
  );
}

/**
 * Split a trend into the reading already logged against this visit and the one
 * before it. `previous` must exclude today's reading or the delta collapses to
 * zero the moment a value is entered.
 */
export function visitReadings(
  trend: MeasureTrend,
  sessionId: string,
): { recorded: Measurement | undefined; previous: Measurement | undefined } {
  const recorded = trend.series.find((m) => m.sessionId === sessionId);
  return {
    recorded,
    previous: [...trend.series].reverse().find((m) => m.id !== recorded?.id),
  };
}

function QuickRow({
  trend,
  patientId,
  sessionId,
  sessionDate,
  isLast,
  readOnly,
  onAdd,
  onRemove,
}: {
  trend: MeasureTrend;
  patientId: string;
  sessionId: string;
  sessionDate: number;
  isLast: boolean;
  readOnly: boolean;
  onAdd: (m: Measurement) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const def = measureDef(trend.measureId);

  const { recorded, previous } = visitReadings(trend, sessionId);

  const numeric = Number(draft);
  const outOfRange =
    draft !== '' && (!Number.isFinite(numeric) || numeric < def.min || numeric > def.max);
  const valid = draft.trim() !== '' && !outOfRange;

  function commit() {
    if (!valid) return;
    const now = Date.now();
    onAdd({
      id: crypto.randomUUID(),
      patientId,
      sessionId,
      measureId: trend.measureId,
      side: trend.side,
      value: numeric,
      takenAt: sessionDate,
      createdAt: now,
      updatedAt: now,
    });
    setDraft('');
  }

  const delta = recorded && previous ? recorded.value - previous.value : null;
  const better = delta === null || delta === 0 ? null : def.higherIsBetter === delta > 0;
  const showDelta = recorded !== undefined && delta !== null && delta !== 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 110px',
        gap: 12,
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-pt-border)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-pt-text)' }}>
          {trend.label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
          {outOfRange
            ? `Must be ${def.min}–${def.max}${def.unit}`
            : previous
              ? `Last ${formatValue(previous.value)}${def.unit} · ${fmtIsoDateOptional(previous.takenAt)}`
              : 'First reading'}
        </div>
      </div>

      {showDelta && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color:
              better === true
                ? 'var(--color-pt-accent-fg)'
                : better === false
                  ? 'var(--color-pt-red)'
                  : 'var(--color-pt-text-3)',
          }}
        >
          {formatChange(delta)}
        </span>
      )}

      {recorded ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-pt-text)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatValue(recorded.value)}
            <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)', fontWeight: 500 }}>
              {def.unit}
            </span>
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onRemove(recorded.id)}
              aria-label={`Remove ${trend.label} reading from this visit`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-pt-text-3)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ) : (
        <TextInput
          type="number"
          inputMode="decimal"
          aria-label={`${trend.label} today`}
          placeholder={def.unit || '—'}
          value={draft}
          disabled={readOnly}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
      )}
    </div>
  );
}
