// Shared IndexedDB cache for downloaded model files.
//
// Imported by BOTH the Whisper worker (read/write during download) and the main
// thread (clear for self-heal + the Settings "Clear & re-download" control), so
// it must only use APIs available in both contexts — `indexedDB` is global in
// window and worker scopes alike. See ADR-0002 and docs/invariants.md.
//
// This is the *sole* cache layer for the model weights: the Workbox SW matches
// `/api/model/*` as NetworkOnly, so nothing else stores them. Errors are always
// swallowed — a cache failure must never block model loading.

export const MODEL_CACHE_DB = 'ptscribe-model-cache';
const STORE = 'files';

// Reserved key (never collides with file URLs, which start with the model host).
const META_VERSION_KEY = '__cache_version__';

/** Bump to evict all cached model files on a deliberate model swap. */
export const CACHE_VERSION = 1;

export type CacheEntry = { buffer: ArrayBuffer; contentType: string };

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(MODEL_CACHE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      _db = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function cacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cachePut(key: string, entry: CacheEntry): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}

/**
 * Empty the cache. Uses `store.clear()` rather than `deleteDatabase` so it works
 * even while another context (the worker) holds an open handle to the same DB.
 */
export async function clearModelCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}

/**
 * Clear the cache if the persisted version differs from {@link CACHE_VERSION},
 * then stamp the current version. Call once before serving cached files so a
 * model swap can't return stale weights. Resolves even on error (best-effort).
 */
export async function ensureCacheVersion(): Promise<void> {
  try {
    const db = await openDB();
    const stored = await new Promise<number | undefined>((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(META_VERSION_KEY);
      req.onsuccess = () => resolve(req.result as number | undefined);
      req.onerror = () => resolve(undefined);
    });
    if (stored === CACHE_VERSION) return;
    await clearModelCache();
    await new Promise<void>((resolve) => {
      const req = db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .put(CACHE_VERSION, META_VERSION_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}
