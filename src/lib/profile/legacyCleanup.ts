import { LEGACY_UNSCOPED_KEYS, LEGACY_AUDIO_DB_NAME } from '@/lib/storageKeys';

const LEGACY_PURGE_FLAG = 'ptnotes.profilesMigrated';

/**
 * One-time removal of pre-ADR-0007 un-suffixed storage. PTScribe shipped Profiles
 * greenfield (no production users to migrate), so any un-suffixed `ptnotes.*`
 * localStorage keys or the legacy `ptnotes-audio` IndexedDB are orphans from a
 * prior dev/demo build and would only confuse. Idempotent via a device-global
 * flag.
 *
 * Deliberately never touches:
 *   - `ptscribe-model-cache` (app-global Whisper weights — see ADR-0002)
 *   - `ptnotes.gate` (the demo AppGate code — device-global by design)
 *   - any profile-scoped (`…:<profileId>`) key
 */
export function purgeLegacyUnscopedStorage(): void {
  try {
    if (localStorage.getItem(LEGACY_PURGE_FLAG) === '1') return;
    for (const key of LEGACY_UNSCOPED_KEYS) localStorage.removeItem(key);
    if (typeof indexedDB !== 'undefined') {
      try {
        indexedDB.deleteDatabase(LEGACY_AUDIO_DB_NAME);
      } catch {
        /* best-effort */
      }
    }
    localStorage.setItem(LEGACY_PURGE_FLAG, '1');
  } catch {
    /* best-effort — never block boot */
  }
}
