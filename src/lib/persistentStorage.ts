/**
 * Request durable (eviction-resistant) storage for this origin.
 *
 * This is the only defense against the browser evicting the cached Whisper
 * weights from IndexedDB under storage pressure (see ADR-0002). It is requested
 * for *every* user — demo, unauthenticated, and authenticated alike — because
 * demo is the default mode and the persistence goal applies to all of them.
 *
 * The request is silent in Chromium (granted via engagement / PWA-install
 * heuristics, no prompt) and idempotent: if durability is already granted we
 * skip the call. Any failure is swallowed — persistence is best-effort and must
 * never block startup.
 *
 * @returns the resulting persisted state, or `null` if the API is unavailable.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = navigator.storage;
  if (!storage?.persist) return null;
  try {
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}
