/**
 * Demo mode toggle.
 *
 * When ON:
 *  - VaultGate auto-unlocks with a derived passphrase (encryption still runs
 *    end-to-end, just invisibly to the user)
 *  - First-run wizard is bypassed (a default clinician is filled in)
 *  - A "Demo Patient" + draft session are seeded once and the user is dropped
 *    straight into the Session page, ready to record
 *
 * Trust model: the demo passphrase is derivable from the JS bundle, so an
 * attacker with the bundle could decrypt local data on the same device.
 * Acceptable for the demo (the data IS demo data on the user's own device);
 * NOT acceptable for a real "bring your own data" build — flip this off then.
 *
 * Default is ON because this whole branch is a hosted testing build. Override
 * at build time with `VITE_DEMO_MODE=false` to ship a passphrase-required UI.
 */

/**
 * Dev-only runtime override for the build flag.
 *
 * A local `VITE_DEMO_MODE=false` build (the one the "Admin Quick Login (dev)"
 * shortcut is built for) otherwise has no way to reach the guided demo at all —
 * `isDemoMode()` is false, so the catch-all route goes through RequireAuth
 * instead of AppGate and "Try Demo" lands in the logged-in app. This lets the
 * one dev server serve both entry modes without a restart.
 *
 * sessionStorage, not localStorage: it dies with the tab, and `import.meta.env.DEV`
 * keeps it out of any built bundle entirely.
 */
const FORCE_DEMO_KEY = 'ptscribe-force-demo';

export function forceDemoMode(): void {
  try {
    sessionStorage.setItem(FORCE_DEMO_KEY, '1');
  } catch {
    /* ignore — falls back to the build flag */
  }
}

export function clearForcedDemoMode(): void {
  try {
    sessionStorage.removeItem(FORCE_DEMO_KEY);
  } catch {
    /* ignore */
  }
}

function isDemoModeForced(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem(FORCE_DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function isDemoMode(): boolean {
  if (isDemoModeForced()) return true;
  const fromEnv = import.meta.env.VITE_DEMO_MODE;
  if (fromEnv === 'false' || fromEnv === '0') return false;
  if (fromEnv === 'true' || fromEnv === '1') return true;
  return true;
}

export const DEMO_VAULT_PASSPHRASE = 'ptscribe-demo-mode/no-secrets-on-this-device';

export const DEMO_PATIENT_ID = 'demo-patient';
export const DEMO_SESSION_ID = 'demo-session';
