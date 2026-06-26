import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PtButton, SurfaceCard } from '@/components/design';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { usePlans } from '@/contexts/PlansProvider';
import { useExercises } from '@/contexts/ExercisesProvider';
import { isSameDay } from '@/utils/dates';
import { ageFromDob } from '@/utils/patients';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { PatientSameDayModal } from '@/components/patients/PatientSameDayModal';
import { derivePatientBadge } from '@/utils/patientMetrics';
import { PatientHeader, type Tab } from '@/components/patients/PatientHeader';
import { PatientOverview } from '@/components/patients/PatientOverview';
import type { PlanOfCare, Session } from '@/types';

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

  const sessions = useMemo(() => (patient ? sessionsFor(patient.id) : []), [patient, sessionsFor]);
  const notes = useMemo(() => (patient ? notesFor(patient.id) : []), [patient, notesFor]);
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
      id: crypto.randomUUID(),
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
        `Remove ${patient.firstName} ${patient.lastName}? All sessions, notes, plans, and audio recordings for this patient will be permanently deleted.`,
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
          <PatientOverview
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
