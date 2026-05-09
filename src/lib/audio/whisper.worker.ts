import { pipeline, env } from '@huggingface/transformers';

env.useBrowserCache = false;
env.allowLocalModels = false;

type InMsg = {
  id: number;
  type: 'transcribe';
  audio: Float32Array;
  model: string;
};

type OutMsg =
  | { id: number; type: 'progress'; status: string; name?: string; loaded?: number; total?: number }
  | { id: number; type: 'result'; text: string }
  | { id: number; type: 'error'; error: string };

const post = (msg: OutMsg) => (self as unknown as Worker).postMessage(msg);

let currentPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;
let currentModel = '';

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, audio, model } = e.data;

  try {
    if (!currentPipeline || currentModel !== model) {
      currentPipeline = null;
      currentModel = '';
      currentPipeline = await pipeline('automatic-speech-recognition', model, {
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

    type ASROutput = { text: string } | Array<{ text: string }>;
    const raw = await (
      currentPipeline as unknown as (audio: Float32Array, opts: object) => Promise<ASROutput>
    )(audio, {
      sampling_rate: 16000,
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'english',
      task: 'transcribe',
    });

    const text = Array.isArray(raw) ? raw.map((r) => r.text).join(' ') : raw.text;
    post({ id, type: 'result', text: text.trim() });
  } catch (err) {
    post({ id, type: 'error', error: (err as Error).message ?? 'Unknown worker error' });
  }
};
