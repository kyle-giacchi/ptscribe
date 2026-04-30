import { useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useSettings } from './SettingsProvider';
import { vault } from '@/lib/vault/vault';

/**
 * Auto-locks the vault after `settings.security.idleLockMinutes` of user
 * inactivity. The reset is best-effort; on lock the toast informs the
 * clinician and `VaultGate` will surface the passphrase prompt on the next
 * render cycle.
 */

const ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'touchstart',
  'pointerdown',
  'visibilitychange',
] as const;

export function IdleLockProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const minutes = settings.security.idleLockMinutes;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (minutes <= 0) return;
    const timeoutMs = minutes * 60 * 1000;

    function fire() {
      if (!vault.isUnlocked()) return;
      vault.lock();
      toast.message(
        `Vault locked after ${minutes} minute${minutes === 1 ? '' : 's'} of inactivity.`,
      );
    }

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fire, timeoutMs);
    }

    reset();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [minutes]);

  return <>{children}</>;
}
