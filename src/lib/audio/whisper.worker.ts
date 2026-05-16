import { pipeline, env } from '@huggingface/transformers';

env.useBrowserCache = true;
env.allowLocalModels = false;

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

    // Preload: pipeline is now warm — nothing to transcribe.
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
