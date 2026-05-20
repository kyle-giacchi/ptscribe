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
 */

import { apiFetch } from '@/lib/apiClient';
import { AiCallError, classifyResponse, type AiErrorKind } from '../errors';

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
const RETRYABLE_STATUSES = new Set([408, 425, 500, 502, 503, 504]);
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

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

  let lastStatus: number | undefined;
  let lastRaw: string | undefined;
  let lastKind: AiErrorKind = 'network';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (args.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const res = await apiFetch('/api/transcribe', {
        method: 'POST',
        headers,
        body: buffer,
        signal: args.signal,
      });

      if (!res.ok) {
        const body = await safeReadText(res);
        lastStatus = res.status;
        lastRaw = body || res.statusText;

        if (!RETRYABLE_STATUSES.has(res.status)) {
          throw new AiCallError({
            kind: classifyResponse(res, 'nova'),
            provider: 'nova',
            status: res.status,
            attemptsMade: attempt,
            rawDetail: lastRaw,
            message: `Nova call failed (${res.status}): ${lastRaw}`,
          });
        }

        if (attempt === MAX_ATTEMPTS) {
          throw new AiCallError({
            kind: 'network',
            provider: 'nova',
            status: res.status,
            attemptsMade: attempt,
            rawDetail: lastRaw,
            message: `Nova call failed after ${attempt} attempts (${res.status})`,
          });
        }
        args.onRetry?.({ attempt, max: RETRY_DELAYS_MS.length, reason: String(res.status) });
        await sleep(RETRY_DELAYS_MS[attempt - 1], args.signal);
        continue;
      }

      const data = (await res.json()) as { text?: string; error?: string };
      if (typeof data.text !== 'string') {
        throw new AiCallError({
          kind: 'empty',
          provider: 'nova',
          status: res.status,
          attemptsMade: attempt,
          rawDetail: data.error,
          message: data.error || 'Nova response missing `text`',
        });
      }
      return { text: data.text };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (err instanceof AiCallError) throw err;

      lastRaw = err instanceof Error ? err.message : String(err);
      lastKind = 'network';
      if (attempt === MAX_ATTEMPTS) {
        throw new AiCallError({
          kind: lastKind,
          provider: 'nova',
          status: lastStatus,
          attemptsMade: attempt,
          rawDetail: lastRaw,
          message: `Nova call failed after ${attempt} attempts: ${lastRaw}`,
        });
      }
      args.onRetry?.({ attempt, max: RETRY_DELAYS_MS.length, reason: 'network' });
      await sleep(RETRY_DELAYS_MS[attempt - 1], args.signal);
    }
  }

  throw new AiCallError({
    kind: lastKind,
    provider: 'nova',
    status: lastStatus,
    attemptsMade: MAX_ATTEMPTS,
    rawDetail: lastRaw,
    message: 'Nova call failed',
  });
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
