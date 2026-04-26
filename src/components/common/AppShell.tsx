import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toaster } from '@/components/ui/Toaster';
import { duration, ease } from '@/lib/motion';

export function AppShell() {
  const location = useLocation();
  return (
    <div
      className="h-screen w-screen overflow-hidden p-3.5"
      style={{ background: 'var(--color-pt-bg)' }}
    >
      <div
        className="grid h-full w-full overflow-hidden"
        style={{
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
          borderRadius: '1rem',
          gridTemplateColumns: '220px 1fr',
          boxShadow:
            '0 12px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
        }}
      >
        <Sidebar />
        <div
          className="grid min-w-0 overflow-hidden"
          style={{ gridTemplateRows: 'auto 1fr' }}
        >
          <TopBar />
          <main
            className="overflow-auto"
            style={{ background: 'var(--color-pt-surface-alt)' }}
          >
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
          </main>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
