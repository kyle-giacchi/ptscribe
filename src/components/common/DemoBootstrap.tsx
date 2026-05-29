import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { isDemoMode, DEMO_PATIENT_ID, DEMO_SESSION_ID } from '@/lib/demoMode';
import { isTestUserSession } from '@/contexts/AuthContext';
import type { Patient, Session } from '@/types';

const DEMO_SESSION_PATH = `/sessions/${DEMO_SESSION_ID}`;
const SETUP_CHECK_PATH = '/setup-check';

type PromptState = 'checking' | 'show' | 'done';

export function DemoBootstrap({ children }: { children: ReactNode }) {
  const demoMode = isDemoMode();
  const { clinician, setClinician } = useClinician();
  const { patients, addPatient } = usePatients();
  const { sessions, addSession, removeSession } = useSessions();
  const { forSession, removeNote } = useNotes();
  const { templates } = useTemplates();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const setupCheckDone = Boolean(settings.firstRun.setupCheckDoneAt);
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

    // Test User = full real-app experience: seed only the clinician, then step
    // aside — no demo patient/session, no nav-lock, no continuity prompt, no
    // forced setup-check. (Distinct from the guided "Try Demo" walkthrough.)
    if (isTestUserSession()) return;

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
        // First-ever demo entry runs the "Checking your setup" pre-flight gate
        // before dropping the user into the session. Subsequent visits skip it.
        if (!setupCheckDone) {
          navigate(SETUP_CHECK_PATH, { replace: true });
        }
        setPromptState('done');
      }
      return;
    }

    if (promptState === 'show') return;

    // promptState === 'done' — keep the demo user locked to the session page.
    // Exceptions: /account so the profile dropdown link works, and /setup-check
    // until the first-run gate has been completed. (The Debug Menu is a drawer
    // now — it opens over any route, no navigation needed.)
    const onPendingSetupCheck = pathname === SETUP_CHECK_PATH && !setupCheckDone;
    if (pathname !== DEMO_SESSION_PATH && pathname !== '/account' && !onPendingSetupCheck) {
      navigate(DEMO_SESSION_PATH, { replace: true });
    }
  }, [
    demoMode,
    clinician,
    patients,
    sessions,
    templates,
    promptState,
    setupCheckDone,
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
