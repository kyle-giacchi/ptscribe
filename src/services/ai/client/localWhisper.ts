import type { TranscribeResult } from '../transcribe';

export const LOCAL_WHISPER_DEFAULT_MODEL = 'Xenova/whisper-tiny.en';

type OutMsg =
  | { id: number; type: 'progress'; status: string; name?: string; loaded?: number; total?: number }
  | { id: number; type: 'result'; text: string }
  | { id: number; type: 'error'; error: string };

type PendingEntry = {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  onProgress?: (msg: string) => void;
  /** Raw download/load progress, used by the preload path to drive a progress bar. */
  onRawProgress?: (status: string, loaded?: number, total?: number) => void;
  timer?: ReturnType<typeof setTimeout>;
};

// Generous limit: covers cold model download (~40 MB) + inference on slow devices.
const TRANSCRIBE_TIMEOUT_MS = 300_000;

let _worker: Worker | null = null;
let _idCounter = 0;
const _pending = new Map<number, PendingEntry>();

// Pool of workers for parallel chunk dispatch. Shared _pending / _idCounter
// keep IDs unique across all workers so routing is correct.
const _pool: Worker[] = [];

function calcPoolSize(chunkCount: number): number {
  const cores = navigator.hardwareConcurrency ?? 2;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  // Low-memory (< 4 GB) or low-core (≤ 4 cores) → sequential only
  if ((mem !== undefined && mem < 4) || cores <= 4) return 1;
  // Mid-range → up to 2 parallel workers
  if (cores <= 8) return Math.min(chunkCount, 2);
  // High-end → up to 3 parallel workers
  return Math.min(chunkCount, 3);
}

function wireWorker(w: Worker): Worker {
  w.onmessage = (e: MessageEvent<OutMsg>) => {
    const msg = e.data;
    const entry = _pending.get(msg.id);
    if (!entry) return;
    if (msg.type === 'progress') {
      entry.onRawProgress?.(msg.status, msg.loaded, msg.total);
      if (msg.status === 'downloading' && msg.loaded != null && msg.total != null) {
        const pct = Math.round((msg.loaded / msg.total) * 100);
        entry.onProgress?.(`Downloading model (${pct}%)`);
      } else if (msg.status === 'loading') {
        entry.onProgress?.('Loading model…');
      }
    } else if (msg.type === 'result') {
      clearTimeout(entry.timer);
      _pending.delete(msg.id);
      entry.resolve(msg.text);
    } else if (msg.type === 'error') {
      clearTimeout(entry.timer);
      _pending.delete(msg.id);
      entry.reject(new Error(msg.error));
    }
  };
  w.onerror = (e) => {
    for (const [id, entry] of _pending) {
      entry.reject(new Error(e.message || 'Worker crashed'));
      _pending.delete(id);
    }
    // Remove this worker from the pool on crash
    const idx = _pool.indexOf(w);
    if (idx !== -1) _pool.splice(idx, 1);
    if (w === _worker) _worker = null;
  };
  return w;
}

function createWorker(): Worker {
  return wireWorker(
    new Worker(new URL('../../../lib/audio/whisper.worker.ts', import.meta.url), {
      type: 'module',
    }),
  );
}

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = createWorker();
  return _worker;
}

// ── WhisperLoader ─────────────────────────────────────────────────────────────

export class WhisperExhaustedError extends Error {
  constructor() {
    super('Whisper unavailable — model failed to load');
    this.name = 'WhisperExhaustedError';
  }
}

export type WhisperLoadStatus = 'idle' | 'loading' | 'ready' | 'exhausted';

/** Coarse preload progress for UI (the "Checking your setup" gate). */
export interface WhisperPreloadProgress {
  phase: 'downloading' | 'loading' | 'ready';
  /** 0–100 while downloading; undefined otherwise. */
  pct?: number;
  loadedBytes?: number;
  totalBytes?: number;
}

class WhisperLoader {
  private _status: WhisperLoadStatus = 'idle';
  // Null until the first ensureReady() call; non-null while loading or after settling.
  private _promise: Promise<void> | null = null;
  private readonly _model: string;
  private readonly _maxAttempts: number;
  private readonly _listeners = new Set<(p: WhisperPreloadProgress) => void>();
  private _lastProgress: WhisperPreloadProgress | null = null;

  constructor(model: string, maxAttempts: number) {
    this._model = model;
    this._maxAttempts = maxAttempts;
  }

  get status(): WhisperLoadStatus {
    return this._status;
  }

  /**
   * Subscribe to preload progress. Fires immediately with the last known
   * progress (or a synthetic `ready` if already loaded). Returns an unsubscribe.
   */
  onProgress(cb: (p: WhisperPreloadProgress) => void): () => void {
    this._listeners.add(cb);
    if (this._status === 'ready') cb({ phase: 'ready' });
    else if (this._lastProgress) cb(this._lastProgress);
    return () => {
      this._listeners.delete(cb);
    };
  }

  private _emit(p: WhisperPreloadProgress): void {
    this._lastProgress = p;
    for (const cb of [...this._listeners]) cb(p);
  }

  /**
   * Allow a fresh load attempt after the loader has exhausted its retries.
   * No-op while a load is in flight so we never interrupt an active download.
   */
  reset(): void {
    if (this._status === 'loading') return;
    this._status = 'idle';
    this._promise = null;
    this._lastProgress = null;
  }

  /**
   * Returns a Promise that resolves when the Whisper pipeline is ready.
   * Idempotent — multiple callers get the same in-flight promise.
   * On first failure the loader auto-retries once; only rejects after both
   * attempts fail, at which point status transitions to 'exhausted'.
   */
  ensureReady(): Promise<void> {
    if (this._status === 'ready') return Promise.resolve();
    if (this._status === 'exhausted') return Promise.reject(new WhisperExhaustedError());
    if (this._promise) return this._promise;

    this._status = 'loading';
    this._promise = this._loadWithRetry(1);
    return this._promise;
  }

  private async _loadWithRetry(attempt: number): Promise<void> {
    try {
      await this._doLoad();
      this._status = 'ready';
      this._emit({ phase: 'ready' });
    } catch (err) {
      if (attempt < this._maxAttempts) {
        return this._loadWithRetry(attempt + 1);
      }
      this._status = 'exhausted';
      throw err;
    }
  }

  private _doLoad(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const worker = getWorker();
      const id = ++_idCounter;
      _pending.set(id, {
        resolve: () => resolve(),
        reject,
        onRawProgress: (status, loaded, total) => {
          if (status === 'downloading' && loaded != null && total != null) {
            this._emit({
              phase: 'downloading',
              pct: Math.round((loaded / total) * 100),
              loadedBytes: loaded,
              totalBytes: total,
            });
          } else if (status === 'loading') {
            this._emit({ phase: 'loading' });
          }
        },
      });
      worker.postMessage({ id, type: 'preload', model: this._model });
    });
  }
}

export const whisperLoader = new WhisperLoader(LOCAL_WHISPER_DEFAULT_MODEL, 2);

// ── Audio utilities ───────────────────────────────────────────────────────────

export async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(arrayBuffer);
  } finally {
    context.close();
  }
  const TARGET_SR = 16000;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SR), TARGET_SR);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0).slice();
}

// ── Transcription functions ───────────────────────────────────────────────────

/** Send a pre-decoded 16 kHz mono Float32Array directly to the Whisper worker,
 *  bypassing the blob-decode step. Use this when the caller has already decoded
 *  and preprocessed the audio (e.g. VAD extraction + chunking). */
export async function transcribeFloat32(
  audio: Float32Array,
  model = LOCAL_WHISPER_DEFAULT_MODEL,
  onProgress?: (msg: string) => void,
): Promise<TranscribeResult> {
  await whisperLoader.ensureReady();
  const worker = getWorker();
  const id = ++_idCounter;
  const text = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error('Transcription timed out'));
    }, TRANSCRIBE_TIMEOUT_MS);
    _pending.set(id, { resolve, reject, onProgress, timer });
    worker.postMessage({ id, type: 'transcribe', audio, model }, [audio.buffer]);
  });
  return { text, source: 'whisper' };
}

export async function transcribeLocally(
  blob: Blob,
  model = LOCAL_WHISPER_DEFAULT_MODEL,
  onProgress?: (msg: string) => void,
): Promise<TranscribeResult> {
  await whisperLoader.ensureReady();
  const audio = await blobToFloat32(blob);
  const worker = getWorker();
  const id = ++_idCounter;

  const text = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error('Transcription timed out'));
    }, TRANSCRIBE_TIMEOUT_MS);
    _pending.set(id, { resolve, reject, onProgress, timer });
    worker.postMessage({ id, type: 'transcribe', audio, model }, [audio.buffer]);
  });

  return { text, source: 'whisper' };
}

/**
 * Dispatch multiple pre-decoded chunks to a device-capability-sized worker pool
 * in parallel, then return results in chunk order. Falls back to sequential on
 * low-memory or low-core devices. Failed chunks return '' rather than throwing.
 *
 * Each chunk must already be a `.slice()` (own buffer) so transfer is safe.
 */
export async function transcribeFloat32Parallel(
  chunks: Float32Array[],
  model: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<string[]> {
  await whisperLoader.ensureReady();
  const n = calcPoolSize(chunks.length);

  if (n <= 1) {
    // Sequential fallback — reuse the singleton worker via transcribeFloat32.
    const results: string[] = [];
    const errors: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await transcribeFloat32(chunks[i], model);
        results.push(result.text);
      } catch (err) {
        errors.push((err as Error).message ?? 'Unknown error');
        results.push('');
      }
      onProgress?.(i + 1, chunks.length);
    }
    if (errors.length === chunks.length) throw new Error(errors[0]);
    return results;
  }

  // Ensure the pool has exactly n workers (create missing ones lazily).
  while (_pool.length < n) {
    _pool.push(createWorker());
  }

  let completed = 0;
  const total = chunks.length;

  const settled = await Promise.allSettled(
    chunks.map((chunk, i) => {
      const worker = _pool[i % n];
      const id = ++_idCounter;
      return new Promise<{ index: number; text: string }>((resolve, reject) => {
        _pending.set(id, {
          resolve: (text) => {
            completed++;
            onProgress?.(completed, total);
            resolve({ index: i, text });
          },
          reject: (err) => {
            completed++;
            onProgress?.(completed, total);
            reject(err);
          },
        });
        worker.postMessage({ id, type: 'transcribe', audio: chunk, model }, [chunk.buffer]);
      });
    }),
  );

  // Reconstruct results in original index order; failed chunks → ''.
  const results: string[] = new Array(chunks.length).fill('');
  const errors: string[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results[outcome.value.index] = outcome.value.text;
    } else {
      errors.push((outcome.reason as Error)?.message ?? 'Unknown error');
    }
  }
  if (errors.length === chunks.length) throw new Error(errors[0]);
  return results;
}
