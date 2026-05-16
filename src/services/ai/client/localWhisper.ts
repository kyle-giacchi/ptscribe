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
};

let _worker: Worker | null = null;
let _idCounter = 0;
const _pending = new Map<number, PendingEntry>();

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(new URL('../../../lib/audio/whisper.worker.ts', import.meta.url), {
    type: 'module',
  });
  _worker.onmessage = (e: MessageEvent<OutMsg>) => {
    const msg = e.data;
    const entry = _pending.get(msg.id);
    if (!entry) return;
    if (msg.type === 'progress') {
      if (msg.status === 'downloading' && msg.loaded != null && msg.total != null) {
        const pct = Math.round((msg.loaded / msg.total) * 100);
        entry.onProgress?.(`Downloading model (${pct}%)`);
      } else if (msg.status === 'loading') {
        entry.onProgress?.('Loading model…');
      }
    } else if (msg.type === 'result') {
      _pending.delete(msg.id);
      entry.resolve(msg.text);
    } else if (msg.type === 'error') {
      _pending.delete(msg.id);
      entry.reject(new Error(msg.error));
    }
  };
  _worker.onerror = (e) => {
    for (const [id, entry] of _pending) {
      entry.reject(new Error(e.message || 'Worker crashed'));
      _pending.delete(id);
    }
    _worker = null;
  };
  return _worker;
}

async function blobToFloat32(blob: Blob): Promise<Float32Array> {
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

/**
 * Starts the worker and warms up the Whisper pipeline so the first real
 * transcription doesn't have to wait for the model download. Safe to call
 * multiple times — the worker is a singleton and pipeline load is idempotent.
 */
export function preloadLocalWhisper(model = LOCAL_WHISPER_DEFAULT_MODEL): void {
  const worker = getWorker();
  const id = ++_idCounter;
  _pending.set(id, { resolve: () => {}, reject: () => {} });
  worker.postMessage({ id, type: 'preload', model });
}

export async function transcribeLocally(
  blob: Blob,
  model = LOCAL_WHISPER_DEFAULT_MODEL,
  onProgress?: (msg: string) => void,
): Promise<TranscribeResult> {
  const audio = await blobToFloat32(blob);
  const worker = getWorker();
  const id = ++_idCounter;

  const text = await new Promise<string>((resolve, reject) => {
    _pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type: 'transcribe', audio, model }, [audio.buffer]);
  });

  return { text, source: 'whisper' };
}
