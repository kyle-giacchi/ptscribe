/**
 * Browser-side ASR client. Calls our hosted Worker at /api/transcribe with
 * the raw audio bytes; the Worker forwards to the Cloudflare Workers AI
 * binding using its server-side secret. The browser never sees a CF token.
 *
 * Wire format: POST /api/transcribe
 *   Content-Type:    <blob.type or audio/webm>  ← Worker uses this verbatim for Nova-3
 *   x-ptscribe-key:  <gate code>            (added by apiFetch)
 *   x-ptscribe-model: <model id>            (optional override; default Nova-3)
 *   x-ptscribe-language: <ISO-639-1>        (optional)
 *   body:            raw audio bytes
 *   response:        { text: string }
 *
 * The retry loop, backoff, abort handling, and network/exhaustion errors live
 * in the shared {@link retryFetch} harness. This module keeps only what is
 * Nova-specific: the request shape, the retryable-status set, and the
 * success/error classification of the Response.
 */

import { apiFetch } from '@/lib/apiClient';
import { AiCallError, classifyResponse } from '../errors';
import { retryFetch, safeReadText } from './retryFetch';

export interface CloudflareWhisperArgs {
  model: string; // e.g. '@cf/deepgram/nova-3'
  audio: Blob;
  language?: string;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; max: number; reason: string }) => void;
}

export interface CloudflareWhisperResult {
  text: string;
}

const RETRY_DELAYS_MS = [5_000, 10_000, 25_000];
// Nova uploads are long; transient 408/425 are worth retrying (generate does not — see anthropic.ts).
const RETRYABLE_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

export async function transcribeWithCloudflare(
  args: CloudflareWhisperArgs,
): Promise<CloudflareWhisperResult> {
  const buffer = await args.audio.arrayBuffer();
  const contentType = args.audio.type || 'audio/webm';
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (args.model) headers['x-ptscribe-model'] = args.model;
  if (args.language) headers['x-ptscribe-language'] = args.language;

  const { response, attempts } = await retryFetch(
    {
      provider: 'nova',
      label: 'Nova',
      retryableStatuses: RETRYABLE_STATUSES,
      delaysMs: RETRY_DELAYS_MS,
      signal: args.signal,
      onRetry: args.onRetry,
    },
    () =>
      apiFetch('/api/transcribe', {
        method: 'POST',
        headers,
        body: buffer,
        signal: args.signal,
      }),
  );

  if (!response.ok) {
    const detail = (await safeReadText(response)) || response.statusText;
    throw new AiCallError({
      kind: classifyResponse(response, 'nova'),
      provider: 'nova',
      status: response.status,
      attemptsMade: attempts,
      rawDetail: detail,
      message: `Nova call failed (${response.status}): ${detail}`,
    });
  }

  const data = (await response.json()) as { text?: string; error?: string };
  if (typeof data.text !== 'string') {
    throw new AiCallError({
      kind: 'empty',
      provider: 'nova',
      status: response.status,
      attemptsMade: attempts,
      rawDetail: data.error,
      message: data.error || 'Nova response missing `text`',
    });
  }
  return { text: data.text };
}
