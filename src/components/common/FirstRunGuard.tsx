import { useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { isDemoMode } from '@/lib/demoMode';
import { isTestUserSession } from '@/lib/profile/profileId';
import { DISCLOSURE_VERSION } from '@/types';

export function FirstRunGuard({ children }: { children: ReactNode }) {
  const { clinician } = useClinician();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const acknowledgedVersion = settings.firstRun.disclosureVersion ?? 0;
  const disclosureStale =
    typeof clinician.acknowledgedDisclosureAt !== 'number' ||
    acknowledgedVersion < DISCLOSURE_VERSION;
  // Test User (Admin Quick Login) is a fake dev-only account — skip onboarding
  // the same way demo mode does, so it never re-hits the setup wizard.
  const needsSetup =
    !isDemoMode() && !isTestUserSession() && (!clinician.name.trim() || disclosureStale);

  useEffect(() => {
    if (needsSetup && pathname !== '/setup') {
      navigate('/setup', { replace: true });
    }
  }, [needsSetup, pathname, navigate]);

  return <>{children}</>;
}
