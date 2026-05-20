export const PRIVACY_FILTER_MODEL = 'openai/privacy-filter';

type OutMsg =
  | { id: number; type: 'progress'; status: string; name?: string; loaded?: number; total?: number }
  | { id: number; type: 'result'; scrubbed: string; entityCount: number }
  | { id: number; type: 'error'; error: string };

type PendingEntry = {
  resolve: (result: { scrubbed: string; entityCount: number }) => void;
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
      entry.resolve({ scrubbed: msg.scrubbed, entityCount: msg.entityCount });
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
  worker.postMessage({ id, type: 'preload', model });
}

export async function scrubPII(
  text: string,
  onProgress?: (msg: string) => void,
  model = PRIVACY_FILTER_MODEL,
): Promise<{ scrubbed: string; entityCount: number }> {
  const worker = getWorker();
  const id = ++_idCounter;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type: 'scrub', text, model });
  });
}
