import { pipeline, env } from '@huggingface/transformers';

// ── Model source routing ─────────────────────────────────────────────────────
// In dev (Vite, port 8080) there is no Worker running, so we fall back to
// HuggingFace directly and let the browser HTTP cache handle persistence.
// In production the Worker serves model files at /api/model/* from R2, which
// is same-origin — no tracking-protection blocks, no HuggingFace CDN dependency.
const IS_DEV = (import.meta as unknown as { env: { DEV: boolean } }).env.DEV;

const MODEL_HOST = IS_DEV
  ? 'https://huggingface.co'
  : `${self.location.origin}/api/model`;

env.remoteHost = MODEL_HOST;
// In production our IDB fetch interceptor below is the single cache layer.
// In dev, keep the browser HTTP cache so HuggingFace downloads persist.
env.useBrowserCache = IS_DEV;
env.allowLocalModels = false;

// ── IDB model cache (production only) ───────────────────────────────────────
// Caches downloaded model files across page loads and browser-cache evictions.
// Errors are always swallowed — a cache failure must never block model loading.

const IDB_NAME = 'ptscribe-model-cache';
const IDB_STORE = 'files';

type CacheEntry = { buffer: ArrayBuffer; contentType: string };

let _db: IDBDatabase | null = null;

async function openModelCacheDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => {
      _db = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const db = await openModelCacheDB();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function cachePut(key: string, entry: CacheEntry): Promise<void> {
  try {
    const db = await openModelCacheDB();
    await new Promise<void>((resolve) => {
      const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(entry, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}

// ── Fetch interceptor (production only) ─────────────────────────────────────
// Sits in front of all fetches made by transformers.js inside this worker.
// Requests to MODEL_HOST are served from IDB when available; on a miss the
// response is fetched from R2 and written to IDB fire-and-forget.

if (!IS_DEV) {
  const _originalFetch = globalThis.fetch.bind(globalThis);

  (globalThis as typeof globalThis).fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (!url.startsWith(MODEL_HOST)) {
      return _originalFetch(input, init);
    }

    const cached = await cacheGet(url);
    if (cached) {
      return new Response(cached.buffer, {
        status: 200,
        headers: { 'Content-Type': cached.contentType },
      });
    }

    const response = await _originalFetch(input, init);
    if (response.ok) {
      const contentType =
        response.headers.get('Content-Type') ?? 'application/octet-stream';
      const buffer = await response.arrayBuffer();
      // Fire-and-forget — never let a cache write delay the caller.
      cachePut(url, { buffer, contentType });
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': contentType },
      });
    }
    return response;
  };
}

// ── Worker message types ─────────────────────────────────────────────────────

type InMsg =
  | { id: number; type: 'transcribe'; audio: Float32Array; model: string }
  | { id: number; type: 'preload'; model: string };

type OutMsg =
  | { id: number; type: 'progress'; status: string; name?: string; loaded?: number; total?: number }
  | { id: number; type: 'result'; text: string }
  | { id: number; type: 'error'; error: string };

const post = (msg: OutMsg) => (self as unknown as Worker).postMessage(msg);

let currentPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;
let currentModel = '';

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  const { id, model } = msg;

  try {
    if (!currentPipeline || currentModel !== model) {
      currentPipeline = null;
      currentModel = '';
      currentPipeline = await pipeline('automatic-speech-recognition', model, {
        // onnxruntime-web 1.25.1 has a bug where the 'extended' graph optimizer
        // incorrectly applies TransposeDQWeightsForMatMulNBits to non-4-bit models
        // and crashes because the required scale tensor is absent. 'basic' skips it.
        session_options: { graphOptimizationLevel: 'basic' },
        progress_callback: (p: {
          status: string;
          name?: string;
          loaded?: number;
          total?: number;
        }) => {
          post({ id, type: 'progress', ...p });
        },
      });
      currentModel = model;
    }

    if (msg.type === 'preload') {
      post({ id, type: 'result', text: '' });
      return;
    }

    const audio = msg.audio;
    type ASROutput = { text: string } | Array<{ text: string }>;
    const raw = await (
      currentPipeline as unknown as (audio: Float32Array, opts: object) => Promise<ASROutput>
    )(audio, {
      sampling_rate: 16000,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const text = Array.isArray(raw) ? raw.map((r) => r.text).join(' ') : raw.text;
    post({ id, type: 'result', text: text.trim() });
  } catch (err) {
    post({ id, type: 'error', error: (err as Error).message ?? 'Unknown worker error' });
  }
};
