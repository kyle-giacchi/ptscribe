import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Users, Plus, Search, ChevronRight } from 'lucide-react';
import { duration, ease } from '@/lib/motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { newId } from '@/utils/ids';
import { parseIsoDate, fmtIsoDateOptional } from '@/utils/dates';
import type { Patient, PatientStatus, Sex } from '@/types';

const STATUS_LABEL: Record<PatientStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  discharged: 'Discharged',
};

export function Patients() {
  const { patients, addPatient } = usePatients();
  const { sessions } = useSessions();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PatientStatus>('all');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((p) => (statusFilter === 'all' ? true : p.status === statusFilter))
      .filter((p) => {
        if (!q) return true;
        const hay = `${p.firstName} ${p.lastName} ${p.mrn ?? ''} ${p.primaryDiagnosis ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [patients, query, statusFilter]);

  const sessionCountByPatient = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) map.set(s.patientId, (map.get(s.patientId) ?? 0) + 1);
    return map;
  }, [sessions]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
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

      <div className="card flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-fg-subtle)' }}
          />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, MRN, or diagnosis"
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | PatientStatus)}
          className="md:w-44"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="discharged">Discharged</option>
        </Select>
      </div>

      <div className="card p-0">
        {filtered.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <p>{patients.length === 0 ? 'No patients yet.' : 'No patients match that search.'}</p>
            {patients.length === 0 && (
              <button type="button" className="btn btn-primary mt-2" onClick={() => setOpen(true)}>
                <Plus size={14} strokeWidth={2} /> Add your first patient
              </button>
            )}
          </div>
        ) : (
          <motion.ul
            className="divide-y"
            style={{ borderColor: 'var(--color-border-soft)' }}
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.025 } } }}
          >
            {filtered.map((p) => (
              <motion.li
                key={p.id}
                variants={{
                  hidden: { opacity: 0, y: 4 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: duration.quick, ease: ease.enter },
                  },
                }}
              >
                <Link
                  to={`/patients/${p.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-[var(--color-surface-2)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: 'var(--color-fg)' }}>
                        {p.firstName} {p.lastName}
                      </span>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                      {[
                        p.mrn ? `MRN ${p.mrn}` : null,
                        p.primaryDiagnosis,
                        `${sessionCountByPatient.get(p.id) ?? 0} sessions`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--color-fg-subtle)' }} />
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
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

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Add patient" size="lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </Field>
        <Field label="Last name">
          <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Date of birth" hint="Optional">
          <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label="Sex" hint="Optional">
          <Select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
            <option value="">—</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
            <option value="X">Other / unspecified</option>
          </Select>
        </Field>
        <Field label="MRN" hint="Optional">
          <TextInput value={mrn} onChange={(e) => setMrn(e.target.value)} />
        </Field>
        <Field label="Referring provider" hint="Optional">
          <TextInput value={referring} onChange={(e) => setReferring(e.target.value)} />
        </Field>
        <Field label="Primary diagnosis" hint="Optional">
          <TextInput
            placeholder="e.g., Right rotator cuff tendinopathy"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
          />
        </Field>
        <Field label="ICD-10" hint="Optional">
          <TextInput placeholder="M75.101" value={icd10} onChange={(e) => setIcd10(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
          Save patient
        </button>
      </div>
      {fmtIsoDateOptional(parseIsoDate(dob)) && (
        <p className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
          DOB stored as {fmtIsoDateOptional(parseIsoDate(dob))}.
        </p>
      )}
    </Modal>
  );
}
