import { AUDIO_DB } from '@/lib/storageKeys';

/**
 * IndexedDB-backed store for raw audio Blobs keyed by clip id.
 *
 * Audio recordings are too large for localStorage's ~5MB cap, so they live
 * outside `AppData` entirely. Each `SessionClip.id` is the key for that clip's
 * consolidated Blob; AudioRepository is the only place that ever touches the
 * IDB store. (Legacy v2 sessions migrated forward use `clipId === sessionId`,
 * so existing rows are reused without rewrite.)
 *
 * Two object stores live in this database:
 *   - `recordings`        : final consolidated Blob per clip (key = clipId)
 *   - `recording_chunks`  : durable per-chunk write-ahead log during recording,
 *                           keyed `${clipId}:${zero-padded index}` so a tab
 *                           crash mid-recording can be recovered from chunks.
 *                           Cleared after the consolidated Blob is saved.
 *
 * The repository API uses `sessionId` as the parameter name for backward
 * compatibility with legacy callers; for v3+ the value is always a clip id.
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
        if (!db.objectStoreNames.contains(AUDIO_DB.chunkStore)) {
          db.createObjectStore(AUDIO_DB.chunkStore);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('failed to open audio db'));
    });
  }
  return _dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
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

const CHUNK_INDEX_PAD = 6;

function chunkKey(sessionId: string, index: number): string {
  return `${sessionId}:${index.toString().padStart(CHUNK_INDEX_PAD, '0')}`;
}

function chunkRangeFor(sessionId: string): IDBKeyRange {
  // ':' is ASCII 58, ';' is 59 — bound captures every `${sessionId}:NNNNNN` key.
  return IDBKeyRange.bound(`${sessionId}:`, `${sessionId};`, false, true);
}

export const audioRepository = {
  async save(sessionId: string, blob: Blob): Promise<void> {
    await withStore<IDBValidKey>(AUDIO_DB.store, 'readwrite', (store) =>
      store.put(blob, sessionId),
    );
  },

  async load(sessionId: string): Promise<Blob | null> {
    const result = await withStore<Blob | undefined>(AUDIO_DB.store, 'readonly', (store) =>
      store.get(sessionId) as IDBRequest<Blob | undefined>,
    );
    return result ?? null;
  },

  async remove(sessionId: string): Promise<void> {
    await Promise.all([
      withStore<undefined>(AUDIO_DB.store, 'readwrite', (store) =>
        store.delete(sessionId) as IDBRequest<undefined>,
      ),
      this.clearChunks(sessionId),
    ]);
  },

  async listKeys(): Promise<string[]> {
    return withStore<string[]>(AUDIO_DB.store, 'readonly', (store) =>
      store.getAllKeys() as IDBRequest<string[]>,
    );
  },

  async clear(): Promise<void> {
    await Promise.all([
      withStore<undefined>(AUDIO_DB.store, 'readwrite', (store) =>
        store.clear() as IDBRequest<undefined>,
      ),
      withStore<undefined>(AUDIO_DB.chunkStore, 'readwrite', (store) =>
        store.clear() as IDBRequest<undefined>,
      ),
    ]);
  },

  async appendChunk(sessionId: string, index: number, blob: Blob): Promise<void> {
    await withStore<IDBValidKey>(AUDIO_DB.chunkStore, 'readwrite', (store) =>
      store.put(blob, chunkKey(sessionId, index)),
    );
  },

  async loadChunks(sessionId: string): Promise<Blob[]> {
    return withStore<Blob[]>(AUDIO_DB.chunkStore, 'readonly', (store) =>
      store.getAll(chunkRangeFor(sessionId)) as IDBRequest<Blob[]>,
    );
  },

  async hasChunks(sessionId: string): Promise<boolean> {
    const count = await withStore<number>(AUDIO_DB.chunkStore, 'readonly', (store) =>
      store.count(chunkRangeFor(sessionId)) as IDBRequest<number>,
    );
    return count > 0;
  },

  async clearChunks(sessionId: string): Promise<void> {
    await withStore<undefined>(AUDIO_DB.chunkStore, 'readwrite', (store) =>
      store.delete(chunkRangeFor(sessionId)) as IDBRequest<undefined>,
    );
  },
};
