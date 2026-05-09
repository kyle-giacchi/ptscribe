import { useState, useEffect } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toaster } from '@/components/ui/Toaster';
import { duration, ease } from '@/lib/motion';
import { isDemoMode } from '@/lib/demoMode';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { labelForType } from '@/utils/labels';

export function AppShell() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const shellBox = {
    background: 'var(--color-pt-surface)',
  } as const;

  const mainStyle = {
    background: 'var(--color-pt-surface-alt)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
  } as const;

  const pageTransition = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: duration.quick, ease: ease.enter }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );

  if (isDemoMode()) {
    return (
      <div className="h-[100dvh] w-[100dvw] overflow-hidden">
        <div
          className="grid h-full w-full overflow-hidden"
          style={{ ...shellBox, gridTemplateRows: 'auto auto 1fr' }}
        >
          <DemoTopBar />
          <div
            style={{
              background: 'color-mix(in oklab, var(--color-caution) 12%, transparent)',
              borderBottom: '1px solid color-mix(in oklab, var(--color-caution) 25%, transparent)',
              padding: '5px 22px',
              fontSize: 11.5,
              color: 'var(--color-caution)',
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            Demo mode — data uses a shared passphrase embedded in the source code. Do not enter real
            patient information.
          </div>
          <main className="overflow-auto" style={mainStyle}>
            {pageTransition}
          </main>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-[100dvw] overflow-hidden">
      <div
        className="app-shell-grid grid h-full w-full overflow-hidden"
        style={shellBox}
      >
        <Sidebar className="hidden md:grid" />
        <div className="grid min-w-0 overflow-hidden" style={{ gridTemplateRows: 'auto 1fr' }}>
          <TopBar onMenuOpen={() => setSidebarOpen(true)} />
          <main className="overflow-auto" style={mainStyle}>
            {pageTransition}
          </main>
        </div>
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              className="absolute inset-0"
              style={{ background: 'var(--color-pt-overlay)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.quick, ease: ease.standard }}
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
            <motion.div
              className="absolute inset-y-0 left-0"
              style={{ width: 220 }}
              initial={{ x: -220 }}
              animate={{ x: 0 }}
              exit={{ x: -220 }}
              transition={{ duration: duration.base, ease: ease.enter }}
            >
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toaster />
    </div>
  );
}

function DemoTopBar() {
  const sessionMatch = useMatch('/sessions/:id');
  const { getSession } = useSessions();
  const { getPatient } = usePatients();

  const session = sessionMatch ? getSession(sessionMatch.params.id ?? '') : undefined;
  const patient = session ? getPatient(session.patientId) : undefined;

  return (
    <header
      className="flex items-center gap-3"
      style={{
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '12px 22px',
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.2px',
            color: 'var(--color-pt-text)',
          }}
        >
          {patient ? `${patient.firstName} ${patient.lastName}` : 'PTScribe'}
        </div>
        {session && (
          <div
            className="truncate"
            style={{ fontSize: 12, color: 'var(--color-pt-text-2)', marginTop: 1 }}
          >
            {labelForType(session.type)} · {new Date(session.date).toLocaleDateString()}
          </div>
        )}
      </div>
      <span
        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{
          background: 'color-mix(in oklab, var(--color-caution) 15%, transparent)',
          color: 'var(--color-caution)',
          border: '1px solid color-mix(in oklab, var(--color-caution) 30%, transparent)',
        }}
      >
        Demo
      </span>
    </header>
  );
}
