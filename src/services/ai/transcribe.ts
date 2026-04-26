import type { TranscriptionProvider } from '@/types';
import { transcribeWithCloudflare } from './client/cloudflare';

export interface TranscribeArgs {
  blob: Blob;
  provider: TranscriptionProvider;
  model: string;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  source: 'whisper' | 'webspeech' | 'manual';
}

export async function transcribe(args: TranscribeArgs): Promise<TranscribeResult> {
  if (args.provider === 'cloudflare') {
    const out = await transcribeWithCloudflare({
      model: args.model || '@cf/deepgram/nova-3',
      audio: args.blob,
      signal: args.signal,
    });
    return { text: out.text, source: 'whisper' };
  }
  if (args.provider === 'webspeech') {
    // Live web-speech transcription accumulates separately via the
    // useTranscription hook; this code path is reached only for blob-after-the-fact
    // which the Web Speech API does not support.
    throw new Error(
      'Web Speech transcription must run live. Use the live recorder, or switch to Cloudflare to transcribe a saved recording.',
    );
  }
  throw new Error('Transcription is disabled. Pick a provider in Settings.');
}
