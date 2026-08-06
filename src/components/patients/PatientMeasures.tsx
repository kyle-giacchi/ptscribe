import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { TextInput, Select } from '@/components/ui/Field';
import {
  MEASURE_CATALOG,
  MEASURE_KIND_LABELS,
  MEASURE_KIND_ORDER,
  measureDef,
} from '@/lib/clinical/measures';
import { buildTrends, formatChange, formatValue, type MeasureTrend } from '@/utils/measureTrend';
import { fmtIsoDate, fmtIsoDateOptional } from '@/utils/dates';
import { MeasureSparkline } from '@/components/patients/MeasureSparkline';
import type { Measurement, MeasureKind, Side } from '@/types';

/**
 * Objective measures over time — the tab that makes this a PT record rather than
 * a pile of narrative notes. Grouped by measure kind, each row showing baseline →
 * latest with a direction-aware delta and MCID flag.
 */
export function PatientMeasures({
  patientId,
  measurements,
  onAdd,
  onRemove,
}: {
  patientId: string;
  measurements: Measurement[];
  onAdd: (m: Measurement) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const trends = useMemo(() => buildTrends(measurements), [measurements]);

  const byKind = useMemo(() => {
    const groups = new Map<MeasureKind, MeasureTrend[]>();
    for (const t of trends) {
      const kind = measureDef(t.measureId).kind;
      const list = groups.get(kind);
      if (list) list.push(t);
      else groups.set(kind, [t]);
    }
    return groups;
  }, [trends]);

  return (
    <div style={{ maxWidth: 980, display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Eyebrow>
          {trends.length} {trends.length === 1 ? 'measure tracked' : 'measures tracked'}
        </Eyebrow>
        <PtButton
          variant={adding ? 'ghost' : 'accent-soft'}
          onClick={() => setAdding(!adding)}
          iconLeft={
            adding ? <X size={13} strokeWidth={2.2} /> : <Plus size={13} strokeWidth={2.4} />
          }
        >
          {adding ? 'Cancel' : 'Record measure'}
        </PtButton>
      </div>

      {adding && (
        <MeasureEntryForm
          patientId={patientId}
          onSubmit={(m) => {
            onAdd(m);
            setAdding(false);
          }}
        />
      )}

      {trends.length === 0 && !adding && (
        <SurfaceCard padding={40} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text-2)' }}>
            No measures recorded
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-pt-text-3)',
              marginTop: 4,
              maxWidth: 420,
              marginInline: 'auto',
              lineHeight: 1.5,
            }}
          >
            Record pain, range of motion, strength, or an outcome measure to start tracking progress
            across visits.
          </div>
        </SurfaceCard>
      )}

      {MEASURE_KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => (
        <SurfaceCard key={kind} padding={0}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-pt-border)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-pt-text)',
            }}
          >
            {MEASURE_KIND_LABELS[kind]}
          </div>
          {byKind.get(kind)?.map((trend, i, arr) => (
            <TrendRow
              key={`${trend.measureId}:${trend.side ?? ''}`}
              trend={trend}
              isLast={i === arr.length - 1}
              onRemove={onRemove}
            />
          ))}
        </SurfaceCard>
      ))}
    </div>
  );
}

function TrendRow({
  trend,
  isLast,
  onRemove,
}: {
  trend: MeasureTrend;
  isLast: boolean;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const def = measureDef(trend.measureId);
  const deltaColor =
    trend.direction === true
      ? 'var(--color-pt-accent-fg)'
      : trend.direction === false
        ? 'var(--color-pt-red)'
        : 'var(--color-pt-text-3)';

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-pt-border)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto 100px',
          gap: 16,
          alignItems: 'center',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-pt-text)' }}>
            {trend.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
            {trend.series.length} {trend.series.length === 1 ? 'reading' : 'readings'} · latest{' '}
            {fmtIsoDateOptional(trend.latest.takenAt)}
          </div>
        </div>

        {/* Baseline → latest, so the number the clinician quotes is right there. */}
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-pt-text-3)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {formatValue(trend.baseline.value)}
          {def.unit} →
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {formatValue(trend.latest.value)}
          <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)', fontWeight: 500 }}>
            {def.unit}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: deltaColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatChange(trend.change) || '—'}
          </span>
          {trend.meetsMcid && (
            <span
              title={`Change meets the published MCID of ${def.mcid}${def.unit}`}
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.6px',
                padding: '2px 6px',
                borderRadius: 4,
                background:
                  trend.direction === true
                    ? 'var(--color-pt-accent-soft)'
                    : 'var(--color-pt-amber-soft)',
                border: `1px solid ${
                  trend.direction === true
                    ? 'var(--color-pt-accent-border)'
                    : 'var(--color-pt-amber-border)'
                }`,
                color:
                  trend.direction === true
                    ? 'var(--color-pt-accent-fg)'
                    : 'var(--color-pt-amber-fg)',
              }}
            >
              MCID
            </span>
          )}
        </div>

        <MeasureSparkline trend={trend} />
      </button>

      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--color-pt-text-3)', textAlign: 'left' }}>
                <th style={{ fontWeight: 600, padding: '4px 0' }}>Date</th>
                <th style={{ fontWeight: 600, padding: '4px 0' }}>Value</th>
                <th style={{ fontWeight: 600, padding: '4px 0' }}>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...trend.series].reverse().map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--color-pt-border)' }}>
                  <td
                    style={{
                      padding: '6px 0',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-pt-text-2)',
                    }}
                  >
                    {fmtIsoDateOptional(m.takenAt)}
                  </td>
                  <td
                    style={{
                      padding: '6px 0',
                      color: 'var(--color-pt-text)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatValue(m.value)}
                    {def.unit}
                  </td>
                  <td style={{ padding: '6px 0', color: 'var(--color-pt-text-3)' }}>
                    {m.notes || '—'}
                  </td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => onRemove(m.id)}
                      aria-label={`Delete ${trend.label} reading from ${fmtIsoDateOptional(m.takenAt)}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-pt-text-3)',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MeasureEntryForm({
  patientId,
  sessionId,
  defaultDate,
  onSubmit,
}: {
  patientId: string;
  /** Set when recording during a visit — ties the reading to that session. */
  sessionId?: string;
  /** ISO `yyyy-mm-dd`. Defaults to today; a session passes the visit date. */
  defaultDate?: string;
  onSubmit: (m: Measurement) => void;
}) {
  const [measureId, setMeasureId] = useState('');
  const [side, setSide] = useState<Side | ''>('');
  const [value, setValue] = useState('');
  const [today] = useState(() => fmtIsoDate(Date.now()));
  const [date, setDate] = useState(() => defaultDate ?? today);
  const [notes, setNotes] = useState('');

  const def = measureId ? measureDef(measureId) : null;
  const numeric = Number(value);
  // Validate at the boundary: the range comes from the catalog, and a reversed
  // or mistyped value (a 1200° knee) would otherwise poison every trend downstream.
  const outOfRange = def !== null && value !== '' && (numeric < def.min || numeric > def.max);
  const missingSide = def?.bilateral === true && side === '';
  const valid =
    def !== null && value.trim() !== '' && Number.isFinite(numeric) && !outOfRange && !missingSide;

  function submit() {
    if (!valid || !def) return;
    const now = Date.now();
    // Parse the date input as local noon so a timezone shift can't move the
    // reading to the previous day.
    const takenAt = new Date(`${date}T12:00:00`).getTime();
    onSubmit({
      id: crypto.randomUUID(),
      patientId,
      sessionId,
      measureId: def.id,
      side: side === '' ? undefined : side,
      value: numeric,
      takenAt: Number.isFinite(takenAt) ? takenAt : now,
      notes: notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  return (
    <SurfaceCard padding="16px 18px">
      <Eyebrow>Record a measure</Eyebrow>
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1.2fr',
          gap: 10,
          alignItems: 'start',
        }}
      >
        <Select
          value={measureId}
          aria-label="Measure"
          onChange={(e) => {
            setMeasureId(e.target.value);
            setSide('');
            setValue('');
          }}
        >
          <option value="">Select measure…</option>
          {MEASURE_KIND_ORDER.map((kind) => (
            <optgroup key={kind} label={MEASURE_KIND_LABELS[kind]}>
              {MEASURE_CATALOG.filter((m) => m.kind === kind).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>

        <Select
          value={side}
          aria-label="Side"
          disabled={!def?.bilateral}
          onChange={(e) => setSide(e.target.value as Side | '')}
        >
          <option value="">{def?.bilateral ? 'Side…' : 'N/A'}</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </Select>

        <TextInput
          type="number"
          inputMode="decimal"
          aria-label="Value"
          placeholder={def ? `${def.min}–${def.max}${def.unit}` : 'Value'}
          value={value}
          disabled={!def}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />

        <TextInput
          type="date"
          aria-label="Date taken"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 10,
        }}
      >
        <TextInput
          placeholder="Optional note (e.g. 'seated, pain-limited')"
          aria-label="Note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <PtButton variant="primary" onClick={submit} disabled={!valid}>
          Save measure
        </PtButton>
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 11.5,
          color: outOfRange ? 'var(--color-pt-red)' : 'var(--color-pt-text-3)',
          minHeight: 16,
        }}
      >
        {outOfRange
          ? `Value must be between ${def.min} and ${def.max}${def.unit}.`
          : missingSide
            ? 'This measure is recorded per side — pick left or right.'
            : (def?.hint ?? '')}
      </div>
    </SurfaceCard>
  );
}
