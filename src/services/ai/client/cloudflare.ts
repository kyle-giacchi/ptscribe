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

export interface CloudflareWhisperArgs {
  model: string; // e.g. '@cf/deepgram/nova-3'
  audio: Blob;
  language?: string;
  signal?: AbortSignal;
}

export interface CloudflareWhisperResult {
  text: string;
}

const RETRY_DELAYS_MS = [500, 1500, 4000];
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function transcribeWithCloudflare(
  args: CloudflareWhisperArgs,
): Promise<CloudflareWhisperResult> {
  const buffer = await args.audio.arrayBuffer();
  // Forward the actual audio MIME so the Worker can hand a typed body to
  // Deepgram Nova-3 (which requires contentType). Fall back to webm — that
  // matches what MediaRecorder produces in Chromium.
  const contentType = args.audio.type || 'audio/webm';
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (args.model) headers['x-ptscribe-model'] = args.model;
  if (args.language) headers['x-ptscribe-language'] = args.language;

  const res = await fetchWithRetry('/api/transcribe', buffer, headers, args.signal);

  const data = (await res.json()) as { text?: string; error?: string };
  if (typeof data.text !== 'string') {
    throw new Error(data.error || 'Transcription proxy response missing `text`');
  }
  return { text: data.text };
}

async function fetchWithRetry(
  url: string,
  body: ArrayBuffer,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const res = await apiFetch(url, {
        method: 'POST',
        headers,
        body,
        signal,
      });

      if (res.ok) return res;

      if (!RETRYABLE_STATUSES.has(res.status) || attempt === RETRY_DELAYS_MS.length) {
        const errBody = await safeReadText(res);
        throw new Error(`Whisper proxy failed (${res.status}): ${errBody || res.statusText}`);
      }

      lastError = new Error(`Whisper proxy failed (${res.status}): ${res.statusText}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (!isNetworkError(err) || attempt === RETRY_DELAYS_MS.length) throw err;
      lastError = err;
    }

    await sleep(RETRY_DELAYS_MS[attempt], signal);
  }

  throw lastError instanceof Error ? lastError : new Error('Whisper proxy request failed');
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
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

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
