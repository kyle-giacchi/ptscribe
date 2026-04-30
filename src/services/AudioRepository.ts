import { AUDIO_DB } from '@/lib/storageKeys';
import { vault } from '@/lib/vault/vault';
import { isPlaintextAudio, isPtscEncrypted, PTSC_MAGIC } from '@/lib/audio/sniff';

const PTSC_TAG = new Uint8Array(PTSC_MAGIC);

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
 *   - `recording_chunks`  : durable per-chunk write-ahead log during recording.
 *
 * When the vault is unlocked, every Blob is round-tripped through AES-GCM
 * encryption before hitting IDB and decrypted on read. `saveRaw`/`loadRaw`
 * bypass that path and are migration-only.
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
  return IDBKeyRange.bound(`${sessionId}:`, `${sessionId};`, false, true);
}

const RECORDING_MIME = 'audio/webm';

function mimeKey(sessionId: string): string {
  return `mime:${sessionId}`;
}

/**
 * IndexedDB has gnarly cross-realm behavior with Blob (especially under
 * jsdom + fake-indexeddb in tests, where Blob loses its prototype after
 * structured clone). We normalize to ArrayBuffer at the storage boundary
 * and reconstruct Blobs on read. Encryption is byte-level either way.
 */
async function toBytes(
  value: Blob | ArrayBuffer | Uint8Array | undefined,
): Promise<Uint8Array | null> {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof (value as Blob).arrayBuffer === 'function') {
    return new Uint8Array(await (value as Blob).arrayBuffer());
  }
  // jsdom + fake-indexeddb path: a structured-cloned Blob may come back as a
  // plain object with internal slots inaccessible. Try to recover via ctor.
  try {
    return new Uint8Array(await new Blob([value as BlobPart]).arrayBuffer());
  } catch {
    return null;
  }
}

async function maybeEncrypt(blob: Blob): Promise<ArrayBuffer> {
  const bytes = (await toBytes(blob)) ?? new Uint8Array();
  if (vault.isUnlocked()) {
    const enc = await vault.encryptBlob(new Blob([bytes as BlobPart]));
    const encBytes = (await toBytes(enc))!;
    // Prefix PTSC tag so the read path can identify encrypted blobs explicitly.
    const tagged = new Uint8Array(PTSC_TAG.length + encBytes.length);
    tagged.set(PTSC_TAG, 0);
    tagged.set(encBytes, PTSC_TAG.length);
    return tagged.buffer as ArrayBuffer;
  }
  return bytes.buffer.slice(0) as ArrayBuffer;
}

async function maybeDecrypt(
  raw: Blob | ArrayBuffer | Uint8Array | undefined,
  mime: string,
): Promise<Blob | undefined> {
  const bytes = await toBytes(raw);
  if (!bytes) return undefined;
  if (!vault.isUnlocked()) return new Blob([bytes as BlobPart], { type: mime });
  // Fast path: PTSC tag means explicitly encrypted by this app.
  if (isPtscEncrypted(bytes)) {
    const payload = bytes.subarray(PTSC_TAG.length);
    return vault.decryptBlob(new Blob([payload as BlobPart]), mime);
  }
  // Fallback for legacy blobs without the tag.
  if (isPlaintextAudio(bytes)) {
    return new Blob([bytes as BlobPart], { type: mime });
  }
  return vault.decryptBlob(new Blob([bytes as BlobPart]), mime);
}

export const audioRepository = {
  async save(sessionId: string, blob: Blob): Promise<void> {
    const out = await maybeEncrypt(blob);
    await withStore<IDBValidKey>(AUDIO_DB.store, 'readwrite', (store) => store.put(out, sessionId));
  },

  async load(sessionId: string): Promise<Blob | null> {
    const stored = await withStore<Blob | ArrayBuffer | undefined>(
      AUDIO_DB.store,
      'readonly',
      (store) => store.get(sessionId) as IDBRequest<Blob | ArrayBuffer | undefined>,
    );
    const decoded = await maybeDecrypt(stored, RECORDING_MIME);
    return decoded ?? null;
  },

  /** Migration-only: write bytes without invoking the encryption path. */
  async saveRaw(sessionId: string, data: Blob | ArrayBuffer | Uint8Array): Promise<void> {
    const bytes = (await toBytes(data)) ?? new Uint8Array();
    await withStore<IDBValidKey>(AUDIO_DB.store, 'readwrite', (store) =>
      store.put(bytes.buffer.slice(0) as ArrayBuffer, sessionId),
    );
  },

  /** Migration-only: read the stored bytes without decryption, as a Blob. */
  async loadRaw(sessionId: string): Promise<Blob | null> {
    const stored = await withStore<Blob | ArrayBuffer | undefined>(
      AUDIO_DB.store,
      'readonly',
      (store) => store.get(sessionId) as IDBRequest<Blob | ArrayBuffer | undefined>,
    );
    const bytes = await toBytes(stored);
    if (!bytes) return null;
    return new Blob([bytes as BlobPart], { type: RECORDING_MIME });
  },

  async remove(sessionId: string): Promise<void> {
    await Promise.all([
      withStore<undefined>(
        AUDIO_DB.store,
        'readwrite',
        (store) => store.delete(sessionId) as IDBRequest<undefined>,
      ),
      this.clearChunks(sessionId),
    ]);
  },

  async listKeys(): Promise<string[]> {
    return withStore<string[]>(
      AUDIO_DB.store,
      'readonly',
      (store) => store.getAllKeys() as IDBRequest<string[]>,
    );
  },

  async clear(): Promise<void> {
    await Promise.all([
      withStore<undefined>(
        AUDIO_DB.store,
        'readwrite',
        (store) => store.clear() as IDBRequest<undefined>,
      ),
      withStore<undefined>(
        AUDIO_DB.chunkStore,
        'readwrite',
        (store) => store.clear() as IDBRequest<undefined>,
      ),
    ]);
  },

  async appendChunk(sessionId: string, index: number, blob: Blob): Promise<void> {
    const out = await maybeEncrypt(blob);
    await withStore<IDBValidKey>(AUDIO_DB.chunkStore, 'readwrite', (store) =>
      store.put(out, chunkKey(sessionId, index)),
    );
  },

  async loadChunks(sessionId: string): Promise<Blob[]> {
    const stored = await withStore<(Blob | ArrayBuffer)[]>(
      AUDIO_DB.chunkStore,
      'readonly',
      (store) => store.getAll(chunkRangeFor(sessionId)) as IDBRequest<(Blob | ArrayBuffer)[]>,
    );
    const results = await Promise.all(stored.map((item) => maybeDecrypt(item, RECORDING_MIME)));
    return results.filter((b): b is Blob => b !== null);
  },

  async hasChunks(sessionId: string): Promise<boolean> {
    const count = await withStore<number>(
      AUDIO_DB.chunkStore,
      'readonly',
      (store) => store.count(chunkRangeFor(sessionId)) as IDBRequest<number>,
    );
    return count > 0;
  },

  async saveChunkMime(sessionId: string, mimeType: string): Promise<void> {
    await withStore<IDBValidKey>(AUDIO_DB.chunkStore, 'readwrite', (store) =>
      store.put(mimeType, mimeKey(sessionId)),
    );
  },

  async loadChunkMime(sessionId: string): Promise<string> {
    const stored = await withStore<string | undefined>(
      AUDIO_DB.chunkStore,
      'readonly',
      (store) => store.get(mimeKey(sessionId)) as IDBRequest<string | undefined>,
    );
    return typeof stored === 'string' ? stored : RECORDING_MIME;
  },

  async clearChunks(sessionId: string): Promise<void> {
    await Promise.all([
      withStore<undefined>(
        AUDIO_DB.chunkStore,
        'readwrite',
        (store) => store.delete(chunkRangeFor(sessionId)) as IDBRequest<undefined>,
      ),
      withStore<undefined>(
        AUDIO_DB.chunkStore,
        'readwrite',
        (store) => store.delete(mimeKey(sessionId)) as IDBRequest<undefined>,
      ),
    ]);
  },
};
