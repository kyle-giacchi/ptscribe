import { useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useClinician } from '@/contexts/ClinicianProvider';
import { isDemoMode } from '@/lib/demoMode';

export function FirstRunGuard({ children }: { children: ReactNode }) {
  const { clinician } = useClinician();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const needsSetup = !isDemoMode() && !clinician.name.trim();

  useEffect(() => {
    if (needsSetup && pathname !== '/setup') {
      navigate('/setup', { replace: true });
    }
  }, [needsSetup, pathname, navigate]);

  return <>{children}</>;
}
