import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClinician } from '@/contexts/ClinicianProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { isDemoMode, DEMO_PATIENT_ID, DEMO_SESSION_ID } from '@/lib/demoMode';
import type { Patient, Session } from '@/types';

const DEMO_SESSION_PATH = `/sessions/${DEMO_SESSION_ID}`;

export function DemoBootstrap({ children }: { children: ReactNode }) {
  const demoMode = isDemoMode();
  const { clinician, setClinician } = useClinician();
  const { patients, addPatient } = usePatients();
  const { sessions, addSession } = useSessions();
  const { templates } = useTemplates();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const seededRef = useRef(false);

  useEffect(() => {
    if (!demoMode) return;

    if (!seededRef.current) {
      if (!clinician.name.trim()) {
        setClinician({ name: 'Demo Clinician', credentials: 'DPT' });
      }

      let demoPatient = patients.find((p) => p.id === DEMO_PATIENT_ID);
      if (!demoPatient) {
        const now = Date.now();
        const next: Patient = {
          id: DEMO_PATIENT_ID,
          firstName: 'Demo',
          lastName: 'Patient',
          primaryDiagnosis: 'Right shoulder pain — rotator cuff strain',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        addPatient(next);
        demoPatient = next;
      }

      if (!sessions.find((s) => s.id === DEMO_SESSION_ID)) {
        const now = Date.now();
        const soapTemplate = templates.find((t) => t.format === 'soap' && t.builtin);
        const next: Session = {
          id: DEMO_SESSION_ID,
          patientId: DEMO_PATIENT_ID,
          type: 'follow_up',
          date: now,
          status: 'draft',
          clips: [],
          templateId: soapTemplate?.id,
          createdAt: now,
          updatedAt: now,
        };
        addSession(next);
      }

      seededRef.current = true;
    }

    // Keep the demo user locked to the session — any navigation attempt bounces back.
    if (pathname !== DEMO_SESSION_PATH) {
      navigate(DEMO_SESSION_PATH, { replace: true });
    }
  }, [
    demoMode,
    clinician,
    patients,
    sessions,
    templates,
    setClinician,
    addPatient,
    addSession,
    navigate,
    pathname,
  ]);

  return <>{children}</>;
}
