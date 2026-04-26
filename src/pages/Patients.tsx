import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Command } from 'cmdk';
import { Users, Plus, Search, ChevronRight } from 'lucide-react';
import { duration, ease } from '@/lib/motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { newId } from '@/utils/ids';
import { parseIsoDate, fmtIsoDateOptional, relativeFromNow } from '@/utils/dates';
import type { Patient, PatientStatus, Sex } from '@/types';

const STATUS_LABEL: Record<PatientStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  discharged: 'Discharged',
};

type StatusFilter = 'all' | PatientStatus;
type SortKey = 'recent' | 'name' | 'added';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'discharged', label: 'Discharged' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently active' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'added', label: 'Recently added' },
];

export function Patients() {
  const { patients, addPatient } = usePatients();
  const { sessions } = useSessions();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [open, setOpen] = useState(false);

  const sessionStatsByPatient = useMemo(() => {
    const map = new Map<string, { count: number; lastDate: number }>();
    for (const s of sessions) {
      const cur = map.get(s.patientId) ?? { count: 0, lastDate: 0 };
      cur.count += 1;
      if (s.date > cur.lastDate) cur.lastDate = s.date;
      map.set(s.patientId, cur);
    }
    return map;
  }, [sessions]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: patients.length,
      active: 0,
      on_hold: 0,
      discharged: 0,
    };
    for (const p of patients) c[p.status] += 1;
    return c;
  }, [patients]);

  const filtered = useMemo(() => {
    return patients
      .filter((p) => (statusFilter === 'all' ? true : p.status === statusFilter))
      .sort((a, b) => {
        if (sort === 'name') {
          return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
        }
        if (sort === 'added') return b.createdAt - a.createdAt;
        // recent: last session, falling back to updatedAt
        const lastA = sessionStatsByPatient.get(a.id)?.lastDate ?? a.updatedAt;
        const lastB = sessionStatsByPatient.get(b.id)?.lastDate ?? b.updatedAt;
        return lastB - lastA;
      });
  }, [patients, statusFilter, sort, sessionStatsByPatient]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Patients"
        subtitle="Caseload, demographics, and recent activity."
        Icon={Users}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={14} strokeWidth={2} /> Add patient
          </button>
        }
      />

      <div className="card space-y-3">
        <StatusTabs value={statusFilter} onChange={setStatusFilter} counts={counts} />

        <Command
          label="Patient search"
          shouldFilter
          loop
          className="space-y-3"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div
              className="relative flex flex-1 items-center gap-2 rounded-lg border px-3"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface-2)',
              }}
            >
              <Search size={14} style={{ color: 'var(--color-fg-subtle)' }} />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search by name, MRN, or diagnosis…"
                className="h-10 w-full bg-transparent text-sm outline-none"
                style={{ color: 'var(--color-fg)' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  Clear
                </button>
              )}
            </div>
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="md:w-44"
              aria-label="Sort patients"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          {patients.length === 0 ? (
            <EmptyState onAdd={() => setOpen(true)} />
          ) : (
            <Command.List className="overflow-hidden">
              <Command.Empty
                className="rounded-lg border border-dashed py-10 text-center text-sm"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-fg-subtle)',
                }}
              >
                No patients match “{query}”.
              </Command.Empty>
              <motion.ul
                className="divide-y"
                style={{ borderColor: 'var(--color-border-soft)' }}
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.02 } } }}
              >
                {filtered.map((p) => (
                  <PatientItem
                    key={p.id}
                    patient={p}
                    sessionCount={sessionStatsByPatient.get(p.id)?.count ?? 0}
                    lastVisit={sessionStatsByPatient.get(p.id)?.lastDate}
                    onSelect={() => navigate(`/patients/${p.id}`)}
                  />
                ))}
              </motion.ul>
            </Command.List>
          )}
        </Command>
      </div>

      <AddPatientModal
        open={open}
        onClose={() => setOpen(false)}
        onSave={(patient) => {
          addPatient(patient);
          setOpen(false);
        }}
      />
    </div>
  );
}

function StatusTabs({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter by status"
      className="flex flex-wrap gap-1 rounded-lg border p-1"
      style={{
        borderColor: 'var(--color-border-soft)',
        background: 'var(--color-surface-2)',
      }}
    >
      {STATUS_TABS.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2"
            style={{
              background: active ? 'var(--color-surface)' : 'transparent',
              color: active ? 'var(--color-fg)' : 'var(--color-fg-muted)',
              boxShadow: active ? 'var(--shadow-sm)' : undefined,
            }}
          >
            {tab.label}
            <span
              className="rounded-full px-1.5 text-[10px] tabular-nums"
              style={{
                background: active
                  ? 'var(--color-accent-soft)'
                  : 'var(--color-surface)',
                color: active ? 'var(--color-accent-fg)' : 'var(--color-fg-subtle)',
              }}
            >
              {counts[tab.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PatientItem({
  patient,
  sessionCount,
  lastVisit,
  onSelect,
}: {
  patient: Patient;
  sessionCount: number;
  lastVisit: number | undefined;
  onSelect: () => void;
}) {
  const initials = initialsOf(patient);
  const value = `${patient.firstName} ${patient.lastName} ${patient.mrn ?? ''} ${
    patient.primaryDiagnosis ?? ''
  } ${patient.icd10 ?? ''}`;
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 4 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: duration.quick, ease: ease.enter },
        },
      }}
    >
      <Command.Item
        value={value}
        onSelect={onSelect}
        className="group flex cursor-pointer items-center gap-3 px-3 py-3 text-sm aria-selected:bg-[var(--color-accent-soft)]"
      >
        <Avatar initials={initials} status={patient.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium" style={{ color: 'var(--color-fg)' }}>
              {patient.lastName}, {patient.firstName}
            </span>
            <StatusPill status={patient.status} />
          </div>
          <div
            className="mt-0.5 truncate text-xs"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            {[
              patient.mrn ? `MRN ${patient.mrn}` : null,
              patient.primaryDiagnosis,
              `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="hidden text-xs tabular-nums sm:inline"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            {lastVisit ? relativeFromNow(lastVisit) : 'No visits'}
          </span>
          <ChevronRight
            size={14}
            className="transition-transform group-aria-selected:translate-x-0.5"
            style={{ color: 'var(--color-fg-subtle)' }}
          />
        </div>
      </Command.Item>
    </motion.li>
  );
}

function Avatar({
  initials,
  status,
}: {
  initials: string;
  status: PatientStatus;
}) {
  const ring =
    status === 'active'
      ? 'var(--color-positive)'
      : status === 'on_hold'
        ? 'var(--color-caution)'
        : 'var(--color-border)';
  return (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{
        background: 'var(--color-accent-soft)',
        color: 'var(--color-accent-fg)',
        boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 3px ${ring}`,
      }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

function StatusPill({ status }: { status: PatientStatus }) {
  const color =
    status === 'active'
      ? 'var(--color-positive)'
      : status === 'on_hold'
        ? 'var(--color-caution)'
        : 'var(--color-fg-subtle)';
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
      style={{ background: 'var(--color-surface-2)', color }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center text-sm"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-fg-muted)',
      }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background: 'var(--color-accent-soft)',
          color: 'var(--color-accent-fg)',
        }}
        aria-hidden
      >
        <Users size={20} strokeWidth={1.75} />
      </div>
      <p>No patients yet — add your first to start charting.</p>
      <button type="button" className="btn btn-primary" onClick={onAdd}>
        <Plus size={14} strokeWidth={2} /> Add your first patient
      </button>
    </div>
  );
}

function initialsOf(p: Patient): string {
  const a = p.firstName?.trim()[0] ?? '';
  const b = p.lastName?.trim()[0] ?? '';
  return `${a}${b}`.toUpperCase();
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
      <FormSection
        title="Identity"
        hint="Required to create a chart."
      >
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
          <Field
            label="Date of birth"
            hint={fmtIsoDateOptional(parseIsoDate(dob)) || undefined}
          >
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
            <TextInput
              value={referring}
              onChange={(e) => setReferring(e.target.value)}
            />
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
        <button type="button" className="btn btn-ghost" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSave}
          onClick={handleSave}
        >
          Save patient
        </button>
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
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          {title}
        </h3>
        {hint && (
          <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
