import { pipeline, env } from '@huggingface/transformers';
import { cacheGet, cachePut, ensureCacheVersion } from './modelCache';

// ── Model source routing ─────────────────────────────────────────────────────
// In both dev (wrangler dev proxies R2 at /api/model/*) and production the
// Worker serves model files at /api/model/*. The IDB fetch interceptor below
// caches files after first download so the model survives browser-cache evictions
// and never needs a re-download across sessions. If R2 is unseeded (local dev
// without seed-r2-models), the interceptor falls back to HuggingFace directly.

const HF_HOST = 'https://huggingface.co';
const MODEL_HOST = `${self.location.origin}/api/model`;

env.remoteHost = MODEL_HOST;
// IDB interceptor is the sole cache layer in both dev and production.
env.useBrowserCache = false;
env.allowLocalModels = false;

// ── IDB model cache ──────────────────────────────────────────────────────────
// The shared cache module (./modelCache) is the sole layer for model weights,
// used by both this worker and the main thread. Errors are always swallowed —
// a cache failure must never block model loading. See ADR-0002.

// Evict-on-version-mismatch must complete before we serve anything cached, or a
// stale weight from an old CACHE_VERSION could be returned. Run it once at module
// load and gate every cache read on it.
const _cacheReady = ensureCacheVersion();

// ── Fetch interceptor (dev + production) ────────────────────────────────────
// Sits in front of all fetches made by transformers.js inside this worker.
// Requests to MODEL_HOST are served from IDB when available; on a miss the
// response is fetched from R2 (or HuggingFace fallback) and written to IDB.

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

    await _cacheReady;
    const cached = await cacheGet(url);
    if (cached) {
      return new Response(cached.buffer, {
        status: 200,
        headers: { 'Content-Type': cached.contentType },
      });
    }

    let response = await _originalFetch(input, init);

    // If the R2 route fails (bucket unseeded), fall back to HuggingFace directly.
    if (!response.ok) {
      const hfPath = url.slice(MODEL_HOST.length + 1);
      response = await _originalFetch(`${HF_HOST}/${hfPath}`, init);
    }

    // Split the body so transformers.js can stream the real network download
    // (driving its progress_callback) while a second branch fills the IDB cache
    // in the background. Buffering up front instead would hide all download
    // progress — the bytes would already be in memory before transformers reads.
    if (response.ok && response.body) {
      const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';
      const [forModel, forCache] = response.body.tee();

      // Best-effort cache write; never blocks or fails the model load.
      void new Response(forCache)
        .arrayBuffer()
        .then((buffer) => cachePut(url, { buffer, contentType }))
        .catch(() => {});

      // Preserve the original headers (notably Content-Length) so transformers
      // knows the total size and can compute a real percentage as bytes arrive.
      return new Response(forModel, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
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
// Serialises concurrent pipeline() calls — onmessage is async so two messages
// arriving before the first await resolves would both enter the load block and
// download the model twice. All callers await this promise before proceeding.
let pipelineLoadPromise: Promise<Awaited<ReturnType<typeof pipeline>>> | null = null;

async function getPipeline(
  model: string,
  progressId: number,
): Promise<Awaited<ReturnType<typeof pipeline>>> {
  if (currentPipeline && currentModel === model) return currentPipeline;
  // If a load is already in progress for the same model, wait for it.
  if (pipelineLoadPromise) return pipelineLoadPromise;
  pipelineLoadPromise = pipeline('automatic-speech-recognition', model, {
    // Force WASM backend — prevents onnxruntime-web from probing WebGPU/JSEP
    // (ort-wasm-simd-threaded.jsep.mjs), which fails when the Workbox service
    // worker intercepts the request and the CacheFirst handler throws.
    device: 'wasm',
    // onnxruntime-web 1.25.1 has a bug where the 'extended' graph optimizer
    // incorrectly applies TransposeDQWeightsForMatMulNBits to non-4-bit models
    // and crashes because the required scale tensor is absent. 'basic' skips it.
    session_options: { graphOptimizationLevel: 'basic' },
    progress_callback: (p: { status: string; name?: string; loaded?: number; total?: number }) => {
      post({ id: progressId, type: 'progress', ...p });
    },
  })
    .then((p) => {
      currentPipeline = p;
      currentModel = model;
      pipelineLoadPromise = null;
      return p;
    })
    .catch((err) => {
      pipelineLoadPromise = null;
      throw err;
    });
  return pipelineLoadPromise;
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  const { id, model } = msg;

  try {
    const pipe = await getPipeline(model, id);

    if (msg.type === 'preload') {
      post({ id, type: 'result', text: '' });
      return;
    }

    const audio = msg.audio;
    type ASROutput = { text: string } | Array<{ text: string }>;
    const raw = await (
      pipe as unknown as (audio: Float32Array, opts: object) => Promise<ASROutput>
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
