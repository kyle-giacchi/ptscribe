import { pipeline, env } from '@huggingface/transformers';

// ── Model source routing ─────────────────────────────────────────────────────
// Mirrors whisper.worker.ts: R2 (via /api/model/*) is primary; HuggingFace is
// the fallback when R2 is unseeded or unreachable (e.g. local dev without wrangler).
// Xenova/bert-base-NER has ONNX exports on HuggingFace, so dev always works.

const HF_HOST = 'https://huggingface.co';
const MODEL_HOST = `${self.location.origin}/api/model`;

env.remoteHost = MODEL_HOST;
env.useBrowserCache = false; // IDB interceptor owns all caching
env.allowLocalModels = false;

// ── IDB model cache ──────────────────────────────────────────────────────────

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
    const entry = await new Promise<CacheEntry | null>((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry) ?? null);
      req.onerror = () => resolve(null);
    });
    if (!entry) return null;
    // Reject poisoned entries: HTML SPA-fallback bodies, or buffers too small
    // to be the file they claim (heuristic: anything > 1 KB is plausibly real;
    // tokenizer.json and onnx files are all >> 1 KB).
    if (entry.contentType.startsWith('text/html')) return null;
    if (entry.buffer.byteLength < 1024 && !key.endsWith('.json')) return null;
    return entry;
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

// ── Fetch interceptor (dev + production) ────────────────────────────────────

{
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

    let response = await _originalFetch(input, init);

    // If R2 fails (unseeded or wrangler not running), fall back to HuggingFace.
    if (!response.ok) {
      const hfPath = url.slice(MODEL_HOST.length + 1);
      response = await _originalFetch(`${HF_HOST}/${hfPath}`, init);
    }

    if (response.ok) {
      const contentType =
        response.headers.get('Content-Type') ?? 'application/octet-stream';
      const buffer = await response.arrayBuffer();
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
  | { id: number; type: 'preload'; model: string }
  | { id: number; type: 'scrub'; text: string; model: string };

type OutMsg =
  | { id: number; type: 'progress'; status: string; name?: string; loaded?: number; total?: number }
  | { id: number; type: 'result'; scrubbed: string; entityCount: number }
  | { id: number; type: 'error'; error: string };

const post = (msg: OutMsg) => (self as unknown as Worker).postMessage(msg);

type Entity = {
  entity_group: string;
  score: number;
  word: string;
  start: number;
  end: number;
};

function buildScrubbed(
  text: string,
  entities: Entity[],
): { scrubbed: string; entityCount: number } {
  // Sort by position, then drop overlapping spans (keep whichever starts first).
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const deduped: Entity[] = [];
  let lastEnd = 0;
  for (const entity of sorted) {
    if (entity.start >= lastEnd) {
      deduped.push(entity);
      lastEnd = entity.end;
    }
  }

  let result = '';
  let cursor = 0;
  for (const entity of deduped) {
    result += text.slice(cursor, entity.start);
    result += `[${entity.entity_group}]`;
    cursor = entity.end;
  }
  result += text.slice(cursor);

  return { scrubbed: result, entityCount: deduped.length };
}

let currentPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;
let currentModel = '';

const PIPELINE_LOAD_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  const { id, model } = msg;

  try {
    if (!currentPipeline || currentModel !== model) {
      currentPipeline = null;
      currentModel = '';
      currentPipeline = await withTimeout(
        pipeline('token-classification', model, {
          dtype: 'q8',
          session_options: { graphOptimizationLevel: 'basic' },
          progress_callback: (p: {
            status: string;
            name?: string;
            loaded?: number;
            total?: number;
          }) => {
            post({ id, type: 'progress', ...p });
          },
        }),
        PIPELINE_LOAD_TIMEOUT_MS,
        'Privacy model load timed out — check network and try again',
      );
      currentModel = model;
    }

    if (msg.type === 'preload') {
      post({ id, type: 'result', scrubbed: '', entityCount: 0 });
      return;
    }

    const raw = await (
      currentPipeline as unknown as (text: string, opts: object) => Promise<Entity[]>
    )(msg.text, { aggregation_strategy: 'simple' });

    const { scrubbed, entityCount } = buildScrubbed(msg.text, raw);
    post({ id, type: 'result', scrubbed, entityCount });
  } catch (err) {
    post({ id, type: 'error', error: (err as Error).message ?? 'Unknown worker error' });
  }
};
