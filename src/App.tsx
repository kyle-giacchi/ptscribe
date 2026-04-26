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
import { FirstRunGuard } from '@/components/common/FirstRunGuard';
import { AppShell } from '@/components/common/AppShell';
import { Setup } from '@/pages/Setup';
import { Dashboard } from '@/pages/Dashboard';
import { Patients } from '@/pages/Patients';
import { PatientDetail } from '@/pages/PatientDetail';
import { NewSession } from '@/pages/NewSession';
import { SessionPage } from '@/pages/Session';
import { Notes } from '@/pages/Notes';
import { Templates } from '@/pages/Templates';
import { Exercises } from '@/pages/Exercises';
import { Settings } from '@/pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <AppDataProvider>
        <ClinicianProvider>
          <PatientsProvider>
            <SessionsProvider>
              <NotesProvider>
                <TemplatesProvider>
                  <ExercisesProvider>
                    <PlansProvider>
                      <SettingsProvider>
                        <FirstRunGuard>
                          <Routes>
                            <Route path="/setup" element={<Setup />} />
                            <Route element={<AppShell />}>
                              <Route index element={<Dashboard />} />
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
                        </FirstRunGuard>
                      </SettingsProvider>
                    </PlansProvider>
                  </ExercisesProvider>
                </TemplatesProvider>
              </NotesProvider>
            </SessionsProvider>
          </PatientsProvider>
        </ClinicianProvider>
      </AppDataProvider>
    </BrowserRouter>
  );
}
