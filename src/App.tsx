import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AppDataProvider } from '@/contexts/AppDataProvider';
import { ClinicianProvider } from '@/contexts/ClinicianProvider';
import { PatientsProvider } from '@/contexts/PatientsProvider';
import { SessionsProvider } from '@/contexts/SessionsProvider';
import { NotesProvider } from '@/contexts/NotesProvider';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';
import { ExercisesProvider } from '@/contexts/ExercisesProvider';
import { PlansProvider } from '@/contexts/PlansProvider';
import { SettingsProvider } from '@/contexts/SettingsProvider';
import { ConfigSyncProvider } from '@/contexts/ConfigSyncProvider';
import { OrgConfigProvider } from '@/contexts/OrgConfigProvider';
import { NotificationsProvider } from '@/contexts/NotificationsProvider';
import { DebugDrawerProvider } from '@/contexts/DebugDrawerProvider';
import { GlobalDebugDrawer } from '@/components/sessions/GlobalDebugDrawer';
import { AuthProvider } from '@/contexts/AuthContext';
import { FirstRunGuard } from '@/components/common/FirstRunGuard';
import { DemoBootstrap } from '@/components/common/DemoBootstrap';
import { AppGate } from '@/components/common/AppGate';
import { ProfileResolver } from '@/components/common/ProfileResolver';
import { VaultGate } from '@/components/vault/VaultGate';
import { AppShell } from '@/components/common/AppShell';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { isDemoMode } from '@/lib/demoMode';
import { Setup } from '@/pages/Setup';
import { CheckingRequirements } from '@/pages/CheckingRequirements';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';
import { OrgNew } from '@/pages/OrgNew';

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
const UserSettings = lazy(() =>
  import('@/pages/UserSettings').then((m) => ({ default: m.UserSettings })),
);
const OrgSettings = lazy(() =>
  import('@/pages/OrgSettings').then((m) => ({ default: m.OrgSettings })),
);

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
    </div>
  );
}

function AppProviders() {
  return (
    <ProfileResolver>
      <NotificationsProvider>
        <VaultGate>
          <AppDataProvider>
            <ConfigSyncProvider>
              <OrgConfigProvider>
                <ClinicianProvider>
                  <PatientsProvider>
                    <SessionsProvider>
                      <NotesProvider>
                        <TemplatesProvider>
                          <ExercisesProvider>
                            <PlansProvider>
                              <SettingsProvider>
                                <DebugDrawerProvider>
                                  <DemoBootstrap>
                                    <FirstRunGuard>
                                      <Suspense fallback={<PageLoader />}>
                                        <Routes>
                                          <Route path="/setup" element={<Setup />} />
                                          <Route
                                            path="/setup-check"
                                            element={<CheckingRequirements />}
                                          />
                                          <Route element={<AppShell />}>
                                            <Route path="/today" element={<Dashboard />} />
                                            <Route path="/patients" element={<Patients />} />
                                            <Route
                                              path="/patients/:id"
                                              element={<PatientDetail />}
                                            />
                                            <Route path="/sessions/new" element={<NewSession />} />
                                            <Route path="/sessions/:id" element={<SessionPage />} />
                                            <Route path="/notes" element={<Notes />} />
                                            <Route path="/templates" element={<Templates />} />
                                            <Route path="/exercises" element={<Exercises />} />
                                            <Route path="/settings" element={<Settings />} />
                                            <Route path="/account" element={<UserSettings />} />
                                            <Route path="/org" element={<OrgSettings />} />
                                          </Route>
                                          <Route
                                            path="*"
                                            element={
                                              <div
                                                style={{
                                                  display: 'flex',
                                                  flexDirection: 'column',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  height: '100%',
                                                  gap: 12,
                                                  color: 'var(--color-fg)',
                                                  fontSize: 15,
                                                }}
                                              >
                                                <span style={{ fontSize: 32, lineHeight: 1 }}>
                                                  404
                                                </span>
                                                <span>Page not found</span>
                                                <Link
                                                  to="/today"
                                                  style={{
                                                    color: 'var(--color-accent)',
                                                    fontSize: 14,
                                                  }}
                                                >
                                                  Go to dashboard
                                                </Link>
                                              </div>
                                            }
                                          />
                                        </Routes>
                                      </Suspense>
                                    </FirstRunGuard>
                                  </DemoBootstrap>
                                  <GlobalDebugDrawer />
                                </DebugDrawerProvider>
                              </SettingsProvider>
                            </PlansProvider>
                          </ExercisesProvider>
                        </TemplatesProvider>
                      </NotesProvider>
                    </SessionsProvider>
                  </PatientsProvider>
                </ClinicianProvider>
              </OrgConfigProvider>
            </ConfigSyncProvider>
          </AppDataProvider>
        </VaultGate>
      </NotificationsProvider>
    </ProfileResolver>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/org/new" element={<OrgNew />} />
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
    </ErrorBoundary>
  );
}
