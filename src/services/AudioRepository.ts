import { AUDIO_DB } from '@/lib/storageKeys';

/**
 * IndexedDB-backed store for raw audio Blobs keyed by `sessionId`.
 *
 * Audio recordings are too large for localStorage's ~5MB cap, so they live
 * outside `AppData` entirely. The Session record stores `audioRef = sessionId`
 * and AudioRepository is the only place that ever touches the IDB store.
 */

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (!_dbPromise) {
    _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(AUDIO_DB.name, AUDIO_DB.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AUDIO_DB.store)) {
          db.createObjectStore(AUDIO_DB.store);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('failed to open audio db'));
    });
  }
  return _dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(AUDIO_DB.store, mode);
    const store = tx.objectStore(AUDIO_DB.store);
    const result = fn(store);
    if (result instanceof Promise) {
      result.then(resolve, reject);
    } else {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    }
    tx.onerror = () => reject(tx.error);
  });
}

export const audioRepository = {
  async save(sessionId: string, blob: Blob): Promise<void> {
    await withStore<IDBValidKey>('readwrite', (store) => store.put(blob, sessionId));
  },

  async load(sessionId: string): Promise<Blob | null> {
    const result = await withStore<Blob | undefined>('readonly', (store) =>
      store.get(sessionId) as IDBRequest<Blob | undefined>,
    );
    return result ?? null;
  },

  async remove(sessionId: string): Promise<void> {
    await withStore<undefined>('readwrite', (store) => store.delete(sessionId) as IDBRequest<undefined>);
  },

  async listKeys(): Promise<string[]> {
    return withStore<string[]>('readonly', (store) => store.getAllKeys() as IDBRequest<string[]>);
  },

  async clear(): Promise<void> {
    await withStore<undefined>('readwrite', (store) => store.clear() as IDBRequest<undefined>);
  },
};
