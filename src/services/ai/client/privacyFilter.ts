export const PRIVACY_FILTER_MODEL = 'Xenova/bert-base-NER';
export const PRIVACY_FILTER_MODEL_OPENAI_Q4 = 'openai/privacy-filter';

// dtype passed to Transformers.js pipeline per model.
// bert-base-NER → 'q8' (model_quantized.onnx, ~90 MB, no external data file)
// openai/privacy-filter → 'q4' (model_q4.onnx + model_q4.onnx_data, ~875 MB)
type PipelineDtype = 'q8' | 'q4' | 'q4f16' | 'fp16' | 'fp32' | 'int8' | 'uint8';

const MODEL_DTYPES: Record<string, PipelineDtype> = {
  'Xenova/bert-base-NER': 'q8',
  'openai/privacy-filter': 'q4',
};

function dtypeFor(model: string): PipelineDtype {
  return MODEL_DTYPES[model] ?? 'q8';
}

import type { PIISpan } from '@/lib/pii/scrubSpans';

type OutMsg =
  | { id: number; type: 'progress'; status: string; name?: string; loaded?: number; total?: number }
  | { id: number; type: 'result'; scrubbed: string; entityCount: number; spans: PIISpan[] }
  | { id: number; type: 'error'; error: string };

export type ScrubModelResult = { scrubbed: string; entityCount: number; spans: PIISpan[] };

type PendingEntry = {
  resolve: (result: ScrubModelResult) => void;
  reject: (err: Error) => void;
  onProgress?: (msg: string) => void;
};

let _worker: Worker | null = null;
let _idCounter = 0;
const _pending = new Map<number, PendingEntry>();
let _modelLoaded = false;

export function isPIIModelLoaded(): boolean { return _modelLoaded; }

function wireWorker(w: Worker): Worker {
  w.onmessage = (e: MessageEvent<OutMsg>) => {
    const msg = e.data;
    const entry = _pending.get(msg.id);
    if (!entry) return;
    if (msg.type === 'progress') {
      if (msg.status === 'downloading' && msg.loaded != null && msg.total != null) {
        const pct = Math.round((msg.loaded / msg.total) * 100);
        entry.onProgress?.(`Downloading model (${pct}%)`);
      } else if (msg.status === 'loading') {
        entry.onProgress?.('Loading model…');
      } else if (msg.status === 'initiate') {
        entry.onProgress?.('Preparing model…');
      } else if (msg.status === 'ready') {
        entry.onProgress?.('Running scan…');
      }
    } else if (msg.type === 'result') {
      _pending.delete(msg.id);
      _modelLoaded = true;
      entry.resolve({ scrubbed: msg.scrubbed, entityCount: msg.entityCount, spans: msg.spans });
    } else if (msg.type === 'error') {
      _pending.delete(msg.id);
      entry.reject(new Error(msg.error));
    }
  };
  w.onerror = (e) => {
    for (const [id, entry] of _pending) {
      entry.reject(new Error(e.message || 'Worker crashed'));
      _pending.delete(id);
    }
    if (w === _worker) _worker = null;
  };
  return w;
}

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = wireWorker(
    new Worker(new URL('../../../lib/pii/privacyFilter.worker.ts', import.meta.url), {
      type: 'module',
    }),
  );
  return _worker;
}

export function preloadPrivacyFilter(model = PRIVACY_FILTER_MODEL): void {
  const worker = getWorker();
  const id = ++_idCounter;
  _pending.set(id, { resolve: () => {}, reject: () => {} });
  worker.postMessage({ id, type: 'preload', model, dtype: dtypeFor(model) });
}

export async function scrubPII(
  text: string,
  onProgress?: (msg: string) => void,
  model = PRIVACY_FILTER_MODEL,
): Promise<ScrubModelResult> {
  const worker = getWorker();
  const id = ++_idCounter;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type: 'scrub', text, model, dtype: dtypeFor(model) });
  });
}
