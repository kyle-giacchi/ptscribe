import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PatientPicker } from '@/components/new-session/PatientPicker';
import { AddPatientModal } from '@/components/patients/AddPatientModal';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useTemplateCatalog } from '@/hooks/useTemplateCatalog';
import { isSameDay } from '@/utils/dates';
import { UNASSIGNED_PATIENT_ID } from '@/types';
import type { Patient, Session, SessionType } from '@/types';

/** Every session starts as a follow-up; the type is changed on the session screen. */
const DEFAULT_TYPE: SessionType = 'follow_up';
const DEFAULT_FORMAT = 'soap';

export function NewSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { patients, addPatient } = usePatients();
  const { sessions, addSession } = useSessions();
  const { all: allTemplates, defaultTemplateId: orgDefaultTemplateId } = useTemplateCatalog();

  const [addingPatient, setAddingPatient] = useState(false);
  const [query, setQuery] = useState('');
  // Pinned at mount — the same-day filter only needs today's date once per
  // visit to this page; remount on navigation re-pins it.
  const [now] = useState(() => Date.now());

  const templateId = useMemo(() => {
    const pool = allTemplates.filter((t) => t.format === DEFAULT_FORMAT);
    return pool.find((t) => t.id === orgDefaultTemplateId)?.id ?? pool[0]?.id;
  }, [allTemplates, orgDefaultTemplateId]);

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((p) => p.status !== 'discharged')
      .filter((p) => {
        if (!q) return true;
        const haystack = [
          `${p.firstName} ${p.lastName}`,
          `${p.lastName}, ${p.firstName}`,
          p.mrn ?? '',
          p.dob ? new Date(p.dob).toISOString().slice(0, 10) : '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
  }, [patients, query]);

  // Suggested = patients with a session today; if the day is empty, the most
  // recently seen patients instead so the picker is never a blank slate.
  const suggestedPatients = useMemo<Patient[]>(() => {
    const lastSeen = new Map<string, number>();
    for (const s of sessions) {
      if (s.patientId === UNASSIGNED_PATIENT_ID) continue;
      lastSeen.set(s.patientId, Math.max(lastSeen.get(s.patientId) ?? 0, s.date));
    }
    const active = patients.filter((p) => p.status !== 'discharged' && lastSeen.has(p.id));
    const today = active.filter((p) => isSameDay(lastSeen.get(p.id) as number, now));
    const pool = today.length > 0 ? today : active;
    return pool
      .sort((a, b) => (lastSeen.get(b.id) as number) - (lastSeen.get(a.id) as number))
      .slice(0, 3);
  }, [patients, sessions, now]);

  // Guards the ?patientId= deep link against StrictMode's double effect run —
  // two sessions for one navigation would be silent data duplication.
  const startedRef = useRef(false);

  function startSession(patientId: string) {
    if (startedRef.current) return;
    startedRef.current = true;
    const createdAt = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      patientId,
      type: DEFAULT_TYPE,
      date: createdAt,
      status: 'draft',
      clips: [],
      templateId,
      createdAt,
      updatedAt: createdAt,
    };
    addSession(session);
    navigate(`/sessions/${session.id}`, { replace: true });
  }

  // Deep link from a patient chart — skip the picker entirely.
  const deepLinkPatientId = params.get('patientId');
  useEffect(() => {
    if (deepLinkPatientId) startSession(deepLinkPatientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPatientId]);

  function handleAddPatient(patient: Patient) {
    addPatient(patient);
    setAddingPatient(false);
    startSession(patient.id);
  }

  if (deepLinkPatientId) return null;

  return (
    <div
      style={{ padding: '20px 22px', display: 'grid', gap: 14, maxWidth: 760, margin: '0 auto' }}
    >
      <PatientPicker
        results={filteredPatients}
        suggested={suggestedPatients}
        query={query}
        onQuery={setQuery}
        onSelect={startSession}
        onNewPatient={() => setAddingPatient(true)}
      />
      <AddPatientModal
        open={addingPatient}
        onClose={() => setAddingPatient(false)}
        onSave={handleAddPatient}
      />
    </div>
  );
}
