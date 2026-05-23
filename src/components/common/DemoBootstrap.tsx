import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { isDemoMode, DEMO_PATIENT_ID, DEMO_SESSION_ID } from '@/lib/demoMode';
import type { Patient, Session } from '@/types';

const DEMO_SESSION_PATH = `/sessions/${DEMO_SESSION_ID}`;

type PromptState = 'checking' | 'show' | 'done';

export function DemoBootstrap({ children }: { children: ReactNode }) {
  const demoMode = isDemoMode();
  const { clinician, setClinician } = useClinician();
  const { patients, addPatient } = usePatients();
  const { sessions, addSession, removeSession } = useSessions();
  const { forSession, removeNote } = useNotes();
  const { templates } = useTemplates();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [promptState, setPromptState] = useState<PromptState>('checking');
  // Prevents re-showing the prompt after "Start fresh" removes the session
  const justResetRef = useRef(false);

  // Runs once after vault unlock — request persistent storage so IDB model
  // caches survive browser eviction pressure.
  useEffect(() => {
    void navigator.storage?.persist?.();
  }, []);

  useEffect(() => {
    if (!demoMode) return;

    // Seed clinician + patient regardless of prompt state.
    if (!clinician.name.trim()) {
      setClinician({ name: 'Demo Clinician', credentials: 'DPT' });
    }
    if (!patients.find((p) => p.id === DEMO_PATIENT_ID)) {
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
    }

    const existingSession = sessions.find((s) => s.id === DEMO_SESSION_ID);

    if (promptState === 'checking') {
      if (existingSession && !justResetRef.current) {
        // Returning user — ask whether to continue or start fresh.
        setPromptState('show');
      } else {
        // No session (first visit or after a fresh-start reset) — seed and go.
        justResetRef.current = false;
        if (!existingSession) {
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
        setPromptState('done');
      }
      return;
    }

    if (promptState === 'show') return;

    // promptState === 'done' — keep the demo user locked to the session page.
    // Exception: allow /account so the profile dropdown link works. (The Debug
    // Menu is a drawer now — it opens over any route, no navigation needed.)
    if (pathname !== DEMO_SESSION_PATH && pathname !== '/account') {
      navigate(DEMO_SESSION_PATH, { replace: true });
    }
  }, [
    demoMode,
    clinician,
    patients,
    sessions,
    templates,
    promptState,
    setClinician,
    addPatient,
    addSession,
    navigate,
    pathname,
  ]);

  function handleContinue() {
    setPromptState('done');
  }

  function handleStartFresh() {
    const demoNote = forSession(DEMO_SESSION_ID);
    if (demoNote) removeNote(demoNote.id);
    removeSession(DEMO_SESSION_ID);
    justResetRef.current = true;
    setPromptState('checking');
  }

  return (
    <>
      {children}
      {demoMode && promptState === 'show' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 24,
          }}
        >
          <SurfaceCard padding={24} style={{ maxWidth: 380, width: '100%' }}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div>
                <Eyebrow>Demo Mode</Eyebrow>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--color-pt-text)',
                    marginTop: 4,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Welcome back
                </div>
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 14,
                    color: 'var(--color-pt-text-2)',
                    lineHeight: 1.5,
                  }}
                >
                  You have a previous demo session. Pick up where you left off, or wipe it and start
                  with a clean slate.
                </p>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <PtButton variant="primary" onClick={handleContinue}>
                  Continue session
                </PtButton>
                <PtButton variant="ghost" onClick={handleStartFresh}>
                  Start fresh
                </PtButton>
              </div>
            </div>
          </SurfaceCard>
        </div>
      )}
    </>
  );
}
