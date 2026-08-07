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
import { PatientHeader, parseTab, type Tab } from '@/components/patients/PatientHeader';
import { PatientOverview } from '@/components/patients/PatientOverview';
import { PatientVisits } from '@/components/patients/PatientVisits';
import { PatientMeasures } from '@/components/patients/PatientMeasures';
import { PatientCarePlan } from '@/components/patients/PatientCarePlan';
import { useMeasurements } from '@/contexts/MeasurementsProvider';
import type { PlanOfCare, Session } from '@/types';

export function PatientDetail() {
  const { id = '', tab: tabParam } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const { getPatient, updatePatient, removePatient } = usePatients();
  const { forPatient: sessionsFor } = useSessions();
  const { forPatient: notesFor } = useNotes();
  const { activePlanForPatient, addPlan, updatePlan } = usePlans();
  const { exercises } = useExercises();
  const { forPatient: measurementsFor, addMeasurement, removeMeasurement } = useMeasurements();

  const patient = getPatient(id);
  const [editing, setEditing] = useState(false);
  const tab = parseTab(tabParam);
  const [sameDaySessions, setSameDaySessions] = useState<Session[] | null>(null);

  const sessions = useMemo(() => (patient ? sessionsFor(patient.id) : []), [patient, sessionsFor]);
  const notes = useMemo(() => (patient ? notesFor(patient.id) : []), [patient, notesFor]);
  const measurements = useMemo(
    () => (patient ? measurementsFor(patient.id) : []),
    [patient, measurementsFor],
  );
  const plan = patient ? activePlanForPatient(patient.id) : undefined;

  function goToTab(next: Tab) {
    // `replace` so tab-hopping doesn't bury the page the clinician arrived from
    // under a dozen history entries.
    navigate(`/patients/${id}/${next}`, { replace: true });
  }

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
        onTab={goToTab}
        onEdit={() => setEditing(true)}
        onStartSession={handleStartSession}
        counts={{
          visits: sessions.length,
          measures: measurements.length,
          plan: plan?.goals.length ?? 0,
        }}
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
            measurements={measurements}
            onStartPlan={handleStartPlan}
            exercises={exercises}
          />
        )}
        {tab === 'visits' && <PatientVisits sessions={sessions} notes={notes} />}
        {tab === 'measures' && (
          <PatientMeasures
            patientId={patient.id}
            measurements={measurements}
            onAdd={addMeasurement}
            onRemove={removeMeasurement}
          />
        )}
        {tab === 'plan' && (
          <PatientCarePlan
            plan={plan}
            exercises={exercises}
            onStartPlan={handleStartPlan}
            onUpdatePlan={(patch) => plan && updatePlan(plan.id, patch)}
          />
        )}
      </div>

      <EditPatientModal
        open={editing}
        patient={patient}
        onClose={() => setEditing(false)}
        onDelete={handleDelete}
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
