import { beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_VERSION,
  MODEL_CACHE_DB,
  cacheGet,
  cachePut,
  clearModelCache,
  ensureCacheVersion,
} from './modelCache';
import { audioRepository } from '@/services/AudioRepository';

const STORE = 'files';
const META_VERSION_KEY = '__cache_version__';

function makeEntry(byte: number) {
  const buffer = new Uint8Array([byte, byte, byte]).buffer;
  return { buffer, contentType: 'application/octet-stream' };
}

/** Raw IDB write that bypasses the module — used to seed a stale version stamp. */
function rawPut(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(MODEL_CACHE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    };
    open.onerror = () => reject(open.error);
  });
}

describe('modelCache', () => {
  beforeEach(async () => {
    await clearModelCache();
  });

  it('round-trips an entry through put/get', async () => {
    await cachePut('https://host/model.onnx', makeEntry(7));
    const got = await cacheGet('https://host/model.onnx');
    expect(got).not.toBeNull();
    expect(new Uint8Array(got!.buffer)).toEqual(new Uint8Array([7, 7, 7]));
    expect(got!.contentType).toBe('application/octet-stream');
  });

  it('returns null on a cache miss', async () => {
    expect(await cacheGet('https://host/absent.onnx')).toBeNull();
  });

  it('clearModelCache empties stored files', async () => {
    await cachePut('https://host/a.onnx', makeEntry(1));
    await clearModelCache();
    expect(await cacheGet('https://host/a.onnx')).toBeNull();
  });

  it('ensureCacheVersion stamps the current version and keeps matching entries', async () => {
    await rawPut(META_VERSION_KEY, CACHE_VERSION);
    await cachePut('https://host/keep.onnx', makeEntry(2));
    await ensureCacheVersion();
    // Version matched, so the cached file must survive.
    expect(await cacheGet('https://host/keep.onnx')).not.toBeNull();
  });

  it('ensureCacheVersion evicts everything when the stored version is stale', async () => {
    await rawPut(META_VERSION_KEY, CACHE_VERSION - 1);
    await cachePut('https://host/stale.onnx', makeEntry(3));
    await ensureCacheVersion();
    // Stale version → cache cleared; the file is gone.
    expect(await cacheGet('https://host/stale.onnx')).toBeNull();
    // ...and the current version is now stamped, so a second call is a no-op.
    await cachePut('https://host/fresh.onnx', makeEntry(4));
    await ensureCacheVersion();
    expect(await cacheGet('https://host/fresh.onnx')).not.toBeNull();
  });
});

describe('model cache survives reset paths (ADR-0002)', () => {
  beforeEach(async () => {
    await clearModelCache();
  });

  it('audioRepository.clear() does not touch the model cache', async () => {
    await cachePut('https://host/weights.onnx', makeEntry(9));
    // Erasing audio (the data-reset path) must leave the app-global model cache intact.
    await audioRepository.clear();
    const got = await cacheGet('https://host/weights.onnx');
    expect(got).not.toBeNull();
    expect(new Uint8Array(got!.buffer)).toEqual(new Uint8Array([9, 9, 9]));
  });
});
