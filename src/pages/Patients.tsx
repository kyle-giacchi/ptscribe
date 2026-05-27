import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Upload } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import {
  Avatar,
  ComingSoonChip,
  Eyebrow,
  PtButton,
  SegmentedControl,
  StatusBadge,
  SurfaceCard,
  type StatusTone,
} from '@/components/design';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { newId } from '@/utils/ids';
import { parseIsoDate, fmtIsoDateOptional, relativeFromNow } from '@/utils/dates';
import { ageFromDob } from '@/utils/patients';
import { useToggle } from '@/hooks/useToggle';
import { useDebounce } from '@/hooks/useDebounce';
import type { Patient, Sex } from '@/types';

type StatusFilter = 'all' | 'on_track' | 'plateau' | 'flagged' | 'new';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'on_track', label: 'On-track' },
  { value: 'plateau', label: 'Plateau' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'new', label: 'New' },
];

const PATIENT_ROW_HEIGHT = 64;

interface PatientRowData {
  patient: Patient;
  sessionCount: number;
  lastVisit?: number;
  nextVisit?: number;
  displayStatus: StatusFilter;
  tone: StatusTone;
  badgeLabel: string;
}

function deriveStatus(
  p: Patient,
  sessionCount: number,
): {
  filter: StatusFilter;
  tone: StatusTone;
  label: string;
} {
  if (p.status === 'discharged') {
    return { filter: 'on_track', tone: 'done', label: 'Discharged' };
  }
  if (p.status === 'on_hold') {
    return { filter: 'plateau', tone: 'plateau', label: 'Plateau' };
  }
  if (sessionCount === 0) {
    return { filter: 'new', tone: 'new', label: 'New' };
  }
  return { filter: 'on_track', tone: 'on-track', label: 'On-track' };
}

function shortMrn(p: Patient): string {
  return p.mrn?.trim() || `PT-${p.id.slice(0, 5).toUpperCase()}`;
}

export function Patients() {
  const { patients, addPatient } = usePatients();
  const { sessions } = useSessions();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [open, openModal, closeModal] = useToggle();
  const [now] = useState(() => Date.now());
  const debouncedQuery = useDebounce(query, 250);

  const sessionStats = useMemo(() => {
    const map = new Map<string, { count: number; last?: number; next?: number }>();
    for (const s of sessions) {
      const cur = map.get(s.patientId) ?? { count: 0 };
      cur.count += 1;
      if (s.date <= now && (!cur.last || s.date > cur.last)) cur.last = s.date;
      if (s.date > now && (!cur.next || s.date < cur.next)) cur.next = s.date;
      map.set(s.patientId, cur);
    }
    return map;
  }, [sessions, now]);

  const rows: PatientRowData[] = useMemo(() => {
    return patients
      .map((patient) => {
        const stats = sessionStats.get(patient.id) ?? { count: 0 };
        const { filter: f, tone, label } = deriveStatus(patient, stats.count);
        return {
          patient,
          sessionCount: stats.count,
          lastVisit: stats.last,
          nextVisit: stats.next,
          displayStatus: f,
          tone,
          badgeLabel: label,
        };
      })
      .sort((a, b) => {
        const la = a.lastVisit ?? a.patient.updatedAt;
        const lb = b.lastVisit ?? b.patient.updatedAt;
        return lb - la;
      });
  }, [patients, sessionStats]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== 'all' && r.displayStatus !== filter) return false;
      if (!debouncedQuery) return true;
      const q = debouncedQuery.toLowerCase();
      const p = r.patient;
      return (
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        (p.mrn ?? '').toLowerCase().includes(q) ||
        shortMrn(p).toLowerCase().includes(q) ||
        (p.primaryDiagnosis ?? '').toLowerCase().includes(q) ||
        (p.icd10 ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, debouncedQuery]);

  const listRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => PATIENT_ROW_HEIGHT,
    overscan: 8,
  });

  const handleSelect = useCallback(
    (patientId: string) => navigate(`/patients/${patientId}`),
    [navigate],
  );

  return (
    <div style={{ padding: 22, display: 'grid', gap: 14, alignContent: 'start' }}>
      <Toolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        onAdd={() => openModal()}
      />

      {patients.length === 0 ? (
        <EmptyState onAdd={() => openModal()} />
      ) : (
        <SurfaceCard padding={0}>
          <TableHeader />
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '28px 18px',
                textAlign: 'center',
                color: 'var(--color-pt-text-3)',
                fontSize: 13,
              }}
            >
              No patients match this filter.
            </div>
          ) : (
            <div
              ref={listRef}
              style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto', overflowX: 'hidden' }}
            >
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={filtered[virtualRow.index].patient.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <PatientRow
                      data={filtered[virtualRow.index]}
                      isLast={virtualRow.index === filtered.length - 1}
                      onSelect={handleSelect}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </SurfaceCard>
      )}

      <AddPatientModal
        open={open}
        onClose={() => closeModal()}
        onSave={(patient) => {
          addPatient(patient);
          closeModal();
        }}
      />
    </div>
  );
}

function Toolbar({
  query,
  onQuery,
  filter,
  onFilter,
  onAdd,
}: {
  query: string;
  onQuery: (v: string) => void;
  filter: StatusFilter;
  onFilter: (v: StatusFilter) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-pt-text-3)',
          }}
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by name, ID, or diagnosis"
          style={{
            width: '100%',
            padding: '9px 12px 9px 32px',
            borderRadius: 9,
            border: '1px solid var(--color-pt-border)',
            fontSize: 13,
            color: 'var(--color-pt-text)',
            background: 'var(--color-pt-surface)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>
      <SegmentedControl items={STATUS_FILTERS} value={filter} onChange={onFilter} size="sm" />
      <div style={{ flex: 1 }} />
      <PtButton
        variant="ghost"
        iconLeft={<Upload size={14} strokeWidth={2} />}
        iconRight={<ComingSoonChip />}
        disabled
        title="Coming soon"
      >
        Import patient
      </PtButton>
      <PtButton variant="primary" iconLeft={<Plus size={14} strokeWidth={2.4} />} onClick={onAdd}>
        New patient
      </PtButton>
    </div>
  );
}

const COLS = '36px 1.6fr 1fr 1fr 1fr 1fr 120px';

const TableHeader = memo(function TableHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COLS,
        gap: 14,
        padding: '10px 18px',
        borderBottom: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
      }}
    >
      <span />
      <Eyebrow>Patient</Eyebrow>
      <Eyebrow>Diagnosis</Eyebrow>
      <Eyebrow>Last visit</Eyebrow>
      <Eyebrow>Next visit</Eyebrow>
      <Eyebrow>Progress</Eyebrow>
      <Eyebrow>Status</Eyebrow>
    </div>
  );
});

const PatientRow = memo(function PatientRow({
  data,
  isLast,
  onSelect,
}: {
  data: PatientRowData;
  isLast: boolean;
  onSelect: (patientId: string) => void;
}) {
  const { patient: p, sessionCount, lastVisit, nextVisit, tone, badgeLabel } = data;
  const age = ageFromDob(p.dob);
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  const handleClick = useCallback(() => onSelect(p.id), [onSelect, p.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="transition-colors hover:bg-[var(--color-pt-surface-mut)]"
      style={{
        display: 'grid',
        gridTemplateColumns: COLS,
        gap: 14,
        padding: '12px 18px',
        alignItems: 'center',
        borderBottom: isLast ? 'none' : '1px solid var(--color-pt-border)',
        cursor: 'pointer',
        background: 'transparent',
      }}
    >
      <Avatar name={fullName || '?'} size={32} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {fullName || 'Unnamed patient'}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--color-pt-text-3)',
            fontFamily: 'var(--font-mono)',
            marginTop: 1,
          }}
        >
          {shortMrn(p)}
          {age !== null ? ` · ${age} yo` : ''}
        </div>
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: 'var(--color-pt-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={p.primaryDiagnosis}
      >
        {p.primaryDiagnosis || '—'}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)' }}>
        {lastVisit ? relativeFromNow(lastVisit) : '—'}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)' }}>
        {nextVisit ? relativeFromNow(nextVisit) : '—'}
      </div>
      <ProgressCell count={sessionCount} />
      <StatusBadge tone={tone} label={badgeLabel} />
    </div>
  );
});

const ProgressCell = memo(function ProgressCell({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-pt-text-3)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Eval
      </span>
    );
  }
  const target = Math.max(8, Math.ceil(count / 4) * 4);
  const pct = Math.min(100, Math.round((count / target) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-pt-text)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {count}/{target}
      </span>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 999,
          background: 'var(--color-pt-slate-soft)',
          overflow: 'hidden',
          maxWidth: 80,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--color-pt-accent)',
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
});

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <SurfaceCard padding={28}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 999,
            background: 'var(--color-pt-accent-soft)',
            color: 'var(--color-pt-accent-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-hidden
        >
          <Plus size={20} strokeWidth={2} />
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--color-pt-text-2)' }}>
          No patients yet — add your first to start charting.
        </p>
        <PtButton variant="primary" onClick={onAdd} iconLeft={<Plus size={14} strokeWidth={2.4} />}>
          Add your first patient
        </PtButton>
      </div>
    </SurfaceCard>
  );
}

function AddPatientModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: Patient) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<Sex | ''>('');
  const [mrn, setMrn] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [icd10, setIcd10] = useState('');
  const [referring, setReferring] = useState('');

  function reset() {
    setFirstName('');
    setLastName('');
    setDob('');
    setSex('');
    setMrn('');
    setDiagnosis('');
    setIcd10('');
    setReferring('');
  }

  function handleSave() {
    const now = Date.now();
    const patient: Patient = {
      id: newId(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dob: parseIsoDate(dob),
      sex: sex || undefined,
      mrn: mrn.trim() || undefined,
      primaryDiagnosis: diagnosis.trim() || undefined,
      icd10: icd10.trim() || undefined,
      referringProvider: referring.trim() || undefined,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    onSave(patient);
    reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Add patient" size="lg">
      <FormSection title="Identity" hint="Required to create a chart.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <TextInput
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name">
            <TextInput
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Demographics" hint="Optional — used in note headers and PDFs.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date of birth" hint={fmtIsoDateOptional(parseIsoDate(dob)) || undefined}>
            <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field label="Sex">
            <Select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
              <option value="">—</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="X">Other / unspecified</option>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Clinical" hint="Optional — fill what you know now.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="MRN">
            <TextInput value={mrn} onChange={(e) => setMrn(e.target.value)} />
          </Field>
          <Field label="Referring provider">
            <TextInput value={referring} onChange={(e) => setReferring(e.target.value)} />
          </Field>
          <Field label="Primary diagnosis" className="sm:col-span-2">
            <TextInput
              placeholder="e.g., Right rotator cuff tendinopathy"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
          </Field>
          <Field label="ICD-10">
            <TextInput
              placeholder="M75.101"
              value={icd10}
              onChange={(e) => setIcd10(e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end gap-2 pt-2">
        <PtButton variant="ghost" onClick={handleClose}>
          Cancel
        </PtButton>
        <PtButton variant="primary" disabled={!canSave} onClick={handleSave}>
          Save patient
        </PtButton>
      </div>
    </Modal>
  );
}

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-pt-text-2)',
          }}
        >
          {title}
        </h3>
        {hint && <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}
