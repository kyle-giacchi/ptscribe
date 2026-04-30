import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppDataProvider } from '@/contexts/AppDataProvider';
import { ClinicianProvider } from '@/contexts/ClinicianProvider';
import { PatientsProvider } from '@/contexts/PatientsProvider';
import { SessionsProvider } from '@/contexts/SessionsProvider';
import { NotesProvider } from '@/contexts/NotesProvider';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';
import { ExercisesProvider } from '@/contexts/ExercisesProvider';
import { PlansProvider } from '@/contexts/PlansProvider';
import { SettingsProvider } from '@/contexts/SettingsProvider';
import { IdleLockProvider } from '@/contexts/IdleLockProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { FirstRunGuard } from '@/components/common/FirstRunGuard';
import { DemoBootstrap } from '@/components/common/DemoBootstrap';
import { AppGate } from '@/components/common/AppGate';
import { VaultGate } from '@/components/vault/VaultGate';
import { AppShell } from '@/components/common/AppShell';
import { isDemoMode } from '@/lib/demoMode';
import { Setup } from '@/pages/Setup';
import { HomePage } from '@/pages/HomePage';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';

const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Patients = lazy(() => import('@/pages/Patients').then((m) => ({ default: m.Patients })));
const PatientDetail = lazy(() =>
  import('@/pages/PatientDetail').then((m) => ({ default: m.PatientDetail })),
);
const NewSession = lazy(() =>
  import('@/pages/NewSession').then((m) => ({ default: m.NewSession })),
);
const SessionPage = lazy(() => import('@/pages/Session').then((m) => ({ default: m.SessionPage })));
const Notes = lazy(() => import('@/pages/Notes').then((m) => ({ default: m.Notes })));
const Templates = lazy(() => import('@/pages/Templates').then((m) => ({ default: m.Templates })));
const Exercises = lazy(() => import('@/pages/Exercises').then((m) => ({ default: m.Exercises })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
    </div>
  );
}

function AppProviders() {
  return (
    <VaultGate>
      <AppDataProvider>
        <ClinicianProvider>
          <PatientsProvider>
            <SessionsProvider>
              <NotesProvider>
                <TemplatesProvider>
                  <ExercisesProvider>
                    <PlansProvider>
                      <SettingsProvider>
                        <IdleLockProvider>
                          <DemoBootstrap>
                            <FirstRunGuard>
                              <Suspense fallback={<PageLoader />}>
                                <Routes>
                                  <Route path="/setup" element={<Setup />} />
                                  <Route element={<AppShell />}>
                                    <Route path="/today" element={<Dashboard />} />
                                    <Route path="/patients" element={<Patients />} />
                                    <Route path="/patients/:id" element={<PatientDetail />} />
                                    <Route path="/sessions/new" element={<NewSession />} />
                                    <Route path="/sessions/:id" element={<SessionPage />} />
                                    <Route path="/notes" element={<Notes />} />
                                    <Route path="/templates" element={<Templates />} />
                                    <Route path="/exercises" element={<Exercises />} />
                                    <Route path="/settings" element={<Settings />} />
                                  </Route>
                                </Routes>
                              </Suspense>
                            </FirstRunGuard>
                          </DemoBootstrap>
                        </IdleLockProvider>
                      </SettingsProvider>
                    </PlansProvider>
                  </ExercisesProvider>
                </TemplatesProvider>
              </NotesProvider>
            </SessionsProvider>
          </PatientsProvider>
        </ClinicianProvider>
      </AppDataProvider>
    </VaultGate>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="*"
            element={
              isDemoMode() ? (
                <AppGate>
                  <AppProviders />
                </AppGate>
              ) : (
                <AppProviders />
              )
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
