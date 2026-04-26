import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  ArrowLeft,
  Mic,
  Pencil,
  Trash2,
  ChevronRight,
  Target,
  Dumbbell,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { usePlans } from '@/contexts/PlansProvider';
import { useExercises } from '@/contexts/ExercisesProvider';
import { newId } from '@/utils/ids';
import { fmtIsoDateOptional, parseIsoDate } from '@/utils/dates';
import { SessionTrends } from '@/components/patients/SessionTrends';
import type { Patient, PatientStatus, PlanGoal, PlanOfCare, Prescription, Sex } from '@/types';

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

  const sessions = useMemo(() => (patient ? sessionsFor(patient.id) : []), [patient, sessionsFor]);
  const notes = useMemo(() => (patient ? notesFor(patient.id) : []), [patient, notesFor]);
  const plan = patient ? activePlanForPatient(patient.id) : undefined;

  if (!patient) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to="/patients" className="btn btn-ghost w-fit">
          <ArrowLeft size={14} strokeWidth={2} /> Back to patients
        </Link>
        <div className="card">Patient not found.</div>
      </div>
    );
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
    if (!confirm(`Remove ${patient.firstName} ${patient.lastName}? Sessions and notes are kept.`)) return;
    removePatient(patient.id);
    toast.success('Patient removed');
    navigate('/patients', { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/patients" className="btn btn-ghost w-fit">
        <ArrowLeft size={14} strokeWidth={2} /> Patients
      </Link>

      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        subtitle={[patient.primaryDiagnosis, patient.icd10].filter(Boolean).join(' · ') || 'No diagnosis on file'}
        Icon={Users}
        actions={
          <>
            <Link to={`/sessions/new?patientId=${patient.id}`} className="btn btn-primary">
              <Mic size={14} strokeWidth={2} /> Start session
            </Link>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={2} /> Edit
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card space-y-3">
          <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
            Demographics
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <Info label="DOB">{fmtIsoDateOptional(patient.dob) || '—'}</Info>
            <Info label="Sex">{labelForSex(patient.sex)}</Info>
            <Info label="MRN">{patient.mrn || '—'}</Info>
            <Info label="Status">{patient.status}</Info>
            <Info label="Referring provider">{patient.referringProvider || '—'}</Info>
            <Info label="Created">{new Date(patient.createdAt).toLocaleDateString()}</Info>
          </dl>
          {patient.notes && (
            <div className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
              <div className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>Internal notes</div>
              <p className="mt-1 whitespace-pre-line">{patient.notes}</p>
            </div>
          )}
          <div className="pt-2">
            <button
              type="button"
              className="btn btn-ghost text-xs"
              style={{ color: 'var(--color-negative)' }}
              onClick={handleDelete}
            >
              <Trash2 size={12} strokeWidth={2} /> Remove patient
            </button>
          </div>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg flex items-center gap-2" style={{ color: 'var(--color-fg)' }}>
              <Target size={16} strokeWidth={1.75} /> Plan of care
            </h2>
            {!plan && (
              <button type="button" className="btn btn-secondary text-xs" onClick={handleStartPlan}>
                Start plan
              </button>
            )}
          </div>
          {!plan ? (
            <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
              No active plan of care. Start one to set goals and prescribe exercises.
            </p>
          ) : (
            <PlanEditor
              plan={plan}
              exercises={exercises}
              onChange={(patch) => updatePlan(plan.id, patch)}
            />
          )}
        </section>
      </div>

      <section className="card space-y-3">
        <h2
          className="flex items-center gap-2 font-display text-lg"
          style={{ color: 'var(--color-fg)' }}
        >
          <TrendingUp size={16} strokeWidth={1.75} /> Trends
        </h2>
        <SessionTrends sessions={sessions} />
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
            Session history
          </h2>
          <Link
            to={`/sessions/new?patientId=${patient.id}`}
            className="text-xs underline"
            style={{ color: 'var(--color-accent-deep)' }}
          >
            New session
          </Link>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
            No sessions for this patient yet.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border-soft)' }}>
            {sessions.map((s) => {
              const note = notes.find((n) => n.sessionId === s.id);
              return (
                <li key={s.id} className="py-2.5">
                  <Link
                    to={`/sessions/${s.id}`}
                    className="flex items-center justify-between gap-3 text-sm hover:opacity-80"
                  >
                    <div>
                      <div className="font-medium" style={{ color: 'var(--color-fg)' }}>
                        {labelForType(s.type)}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                        {new Date(s.date).toLocaleString()} · {s.status}
                        {note ? (note.finalized ? ' · Note finalized' : ' · Note draft') : ''}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--color-fg-subtle)' }} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EditPatientModal
        open={editing}
        patient={patient}
        onClose={() => setEditing(false)}
        onSave={(patch) => {
          updatePatient(patient.id, patch);
          setEditing(false);
        }}
      />
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
        {label}
      </dt>
      <dd className="mt-0.5" style={{ color: 'var(--color-fg)' }}>
        {children}
      </dd>
    </div>
  );
}

function labelForSex(s?: Sex): string {
  if (s === 'F') return 'Female';
  if (s === 'M') return 'Male';
  if (s === 'X') return 'Other';
  return '—';
}

function labelForType(t: string): string {
  switch (t) {
    case 'evaluation':
      return 'Initial Evaluation';
    case 'progress':
      return 'Progress note';
    case 'discharge':
      return 'Discharge';
    default:
      return 'Follow-up';
  }
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
    onChange({ goals: plan.goals.map((g) => (g.id === gid ? { ...g, met: !g.met } : g)) });
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
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-fg-subtle)' }}>
          Goals
        </div>
        <ul className="mt-2 space-y-1.5">
          {plan.goals.length === 0 && (
            <li style={{ color: 'var(--color-fg-muted)' }}>No goals yet.</li>
          )}
          {plan.goals.map((g) => (
            <li key={g.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={g.met}
                onChange={() => toggleGoal(g.id)}
                className="mt-1"
              />
              <span
                className="flex-1"
                style={{
                  color: g.met ? 'var(--color-fg-subtle)' : 'var(--color-fg)',
                  textDecoration: g.met ? 'line-through' : 'none',
                }}
              >
                {g.text}
              </span>
              <button
                type="button"
                className="text-xs"
                onClick={() => removeGoal(g.id)}
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
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
          <button type="button" className="btn btn-secondary" onClick={addGoal}>
            Add
          </button>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--color-fg-subtle)' }}>
          <Dumbbell size={12} /> Prescriptions
        </div>
        <ul className="mt-2 space-y-1.5">
          {plan.prescriptions.length === 0 && (
            <li style={{ color: 'var(--color-fg-muted)' }}>No exercises prescribed.</li>
          )}
          {plan.prescriptions.map((p) => {
            const ex = exercises.find((e) => e.id === p.exerciseId);
            return (
              <li key={p.id} className="flex items-start justify-between gap-2">
                <div>
                  <div style={{ color: 'var(--color-fg)' }}>{ex?.name ?? 'Unknown exercise'}</div>
                  <div className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                    {p.dosage}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs"
                  onClick={() => removePrescription(p.id)}
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
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
          <button type="button" className="btn btn-secondary" onClick={addPrescription}>
            Add
          </button>
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
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          Save changes
        </button>
      </div>
    </Modal>
  );
}
