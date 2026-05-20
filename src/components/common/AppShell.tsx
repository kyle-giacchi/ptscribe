import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { GlobalTopNav } from './GlobalTopNav';
import { Toaster } from '@/components/ui/Toaster';
import { OfflineIndicator } from './OfflineIndicator';
import { duration, ease } from '@/lib/motion';
import { isDemoMode } from '@/lib/demoMode';

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const shellBox = { background: 'var(--color-pt-surface)' } as const;
  const mainStyle = {
    background: 'var(--color-pt-surface-alt)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
  } as const;

  return (
    <div className="h-[100dvh] w-[100dvw] overflow-hidden">
      <OfflineIndicator />
      <div
        className="grid h-full w-full overflow-hidden"
        style={{ ...shellBox, gridTemplateRows: isDemoMode() ? 'auto auto 1fr' : 'auto 1fr' }}
      >
        <GlobalTopNav />
        {isDemoMode() && (
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
        )}
        <main ref={mainRef} className="overflow-auto" style={mainStyle}>
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
      <Toaster />
    </div>
  );
}
