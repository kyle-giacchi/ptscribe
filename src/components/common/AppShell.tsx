import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toaster } from '@/components/ui/Toaster';
import { duration, ease } from '@/lib/motion';

export function AppShell() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div
      className="h-[100dvh] w-[100dvw] overflow-hidden md:p-3.5"
      style={{ background: 'var(--color-pt-bg)' }}
    >
      <div
        className="app-shell-grid grid h-full w-full overflow-hidden md:rounded-2xl"
        style={{
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
          boxShadow: '0 12px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
        }}
      >
        <Sidebar className="hidden md:grid" />
        <div
          className="grid min-w-0 overflow-hidden"
          style={{ gridTemplateRows: 'auto 1fr' }}
        >
          <TopBar onMenuOpen={() => setSidebarOpen(true)} />
          <main
            className="overflow-auto"
            style={{
              background: 'var(--color-pt-surface-alt)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
            }}
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

      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              className="absolute inset-0"
              style={{ background: 'oklch(0.28 0.03 250 / 0.32)' }}
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
