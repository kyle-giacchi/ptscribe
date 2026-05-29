import type { TranscriptionProvider } from '@/types';
import { transcribeWithCloudflare } from './client/cloudflare';

export interface TranscribeArgs {
  blob: Blob;
  provider: TranscriptionProvider;
  model: string;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
  onRetry?: (info: { attempt: number; max: number; reason: string }) => void;
}

export interface TranscribeResult {
  text: string;
  source: 'whisper' | 'webspeech' | 'manual';
}

type Backend = (args: TranscribeArgs) => Promise<TranscribeResult>;

const backends: Record<TranscriptionProvider, Backend> = {
  cloudflare: async (args) => {
    const out = await transcribeWithCloudflare({
      model: args.model || '@cf/deepgram/nova-3',
      audio: args.blob,
      signal: args.signal,
      onRetry: args.onRetry,
    });
    return { text: out.text, source: 'whisper' };
  },
  local: async (args) => {
    const { transcribeLocally, LOCAL_WHISPER_DEFAULT_MODEL } =
      await import('./client/localWhisper');
    return transcribeLocally(args.blob, args.model || LOCAL_WHISPER_DEFAULT_MODEL, args.onProgress);
  },
  webspeech: () => {
    // Live web-speech transcription accumulates separately via the
    // useTranscription hook; this code path is only reached for
    // blob-after-the-fact, which the Web Speech API does not support.
    throw new Error(
      'Web Speech transcription must run live. Use the live recorder, or switch to Cloudflare to transcribe a saved recording.',
    );
  },
  none: () => {
    throw new Error('Transcription is disabled. Pick a provider in Settings.');
  },
};

export async function transcribe(args: TranscribeArgs): Promise<TranscribeResult> {
  const backend = backends[args.provider];
  if (!backend) {
    throw new Error(`Unknown transcription provider: ${args.provider}`);
  }
  return backend(args);
}
