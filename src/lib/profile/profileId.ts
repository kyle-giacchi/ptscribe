import { isDemoMode } from '@/lib/demoMode';

/**
 * Profile identity (ADR-0007).
 *
 * A **Profile** is a cryptographically-isolated partition of all on-device data:
 * its own vault (passphrase + DEK), AppData, audio, and audit log live under a
 * namespace suffixed with the profile id. Storage keys are resolved through this
 * module's active id (see `storageKeys.ts` / `AudioRepository`).
 *
 * Identity is derived synchronously where possible:
 *   - demo build (`VITE_DEMO_MODE` on) → `test-user` if the marker is set, else `demo`
 *   - non-demo build → the authenticated BetterAuth user id, else `local`
 *
 * The `demo` and `test-user` profiles deliberately share the `DEMO_USER` *auth*
 * identity but never share storage — this fixes the old demo↔real data bleed.
 */

export const LOCAL_PROFILE_ID = 'local';
export const DEMO_PROFILE_ID = 'demo';
export const TEST_USER_PROFILE_ID = 'test-user';

// Persisted in localStorage (not sessionStorage) so a Test User session behaves
// like a real login: it survives reloads and new tabs until an explicit Log out.
const TEST_USER_KEY = 'ptscribe-test-user-session';

export function activateTestUserSession(): void {
  localStorage.setItem(TEST_USER_KEY, '1');
}

export function deactivateTestUserSession(): void {
  localStorage.removeItem(TEST_USER_KEY);
}

export function isTestUserSession(): boolean {
  return localStorage.getItem(TEST_USER_KEY) === '1';
}

/**
 * Pure resolution of the active profile id from build flag + test-user marker +
 * (in non-demo builds) the authenticated user id. Deterministic across reloads
 * for the same inputs, which is what makes the reload-on-change guard safe.
 */
export function resolveProfileId(userId?: string | null): string {
  if (isDemoMode()) {
    return isTestUserSession() ? TEST_USER_PROFILE_ID : DEMO_PROFILE_ID;
  }
  return userId && userId.length > 0 ? userId : LOCAL_PROFILE_ID;
}

// The active id is read at key-build time by storageKeys/AudioRepository/auditLog.
// Eagerly seeded with the synchronously-resolvable value so any storage touched
// before <ProfileResolver/> commits still lands in the right namespace (demo/test
// builds resolve fully here; non-demo authenticated waits for the gate).
let active = resolveProfileId(null);
let committed: string | null = null;

export function getActiveProfileId(): string {
  return active;
}

/** Direct setter — used by tests and boot code. Prefer `commitActiveProfile` in the app. */
export function setActiveProfileId(id: string): void {
  active = id;
}

/**
 * Commit the resolved profile for this page life. Returns `'changed'` when the
 * target differs from a profile already committed this page life — the caller
 * must then trigger a full `window.location.reload()`, the single bulletproof
 * teardown for a profile transition (ADR-0007). A full reload resets `committed`,
 * the in-memory vault DEK, and the cached IndexedDB handle.
 */
export function commitActiveProfile(target: string): 'ok' | 'changed' {
  if (committed === null) {
    committed = target;
    active = target;
    return 'ok';
  }
  if (committed !== target) return 'changed';
  active = target;
  return 'ok';
}

/** Test-only: reset module state between cases. */
export function __resetProfileState(): void {
  committed = null;
  active = resolveProfileId(null);
}
