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

export function isDemoMode(): boolean {
  const fromEnv = import.meta.env.VITE_DEMO_MODE;
  if (fromEnv === 'false' || fromEnv === '0') return false;
  if (fromEnv === 'true' || fromEnv === '1') return true;
  return true;
}

const DEMO_VAULT_PASSPHRASE = 'ptscribe-demo-mode/no-secrets-on-this-device';

export function getDemoPassphrase(): string {
  return DEMO_VAULT_PASSPHRASE;
}

export const DEMO_PATIENT_ID = 'demo-patient';
export const DEMO_SESSION_ID = 'demo-session';
