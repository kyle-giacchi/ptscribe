/**
 * Browser-side Cloudflare Workers AI Whisper client.
 *
 * The clinician supplies their own Cloudflare account ID and API token in
 * Settings; the call goes browser → api.cloudflare.com directly. We do NOT
 * proxy through any server we operate.
 *
 * Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
 * Body:     { audio: <base64 string>, language?: <ISO-639-1> }
 * Response: { result: { text: string }, success: boolean, errors: [...], messages: [...] }
 */

export interface CloudflareWhisperArgs {
  accountId: string;
  apiToken: string;
  model: string; // e.g. '@cf/openai/whisper-large-v3-turbo'
  audio: Blob;
  language?: string; // ISO-639-1 hint
  signal?: AbortSignal;
}

export interface CloudflareWhisperResult {
  text: string;
}

// Backoff schedule for transient failures. After the initial attempt, we retry
// up to RETRY_DELAYS_MS.length times with the listed delay between attempts.
// Total max wall time before user sees an error: ~6s on top of the request itself.
const RETRY_DELAYS_MS = [500, 1500, 4000];
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function transcribeWithCloudflare(
  args: CloudflareWhisperArgs,
): Promise<CloudflareWhisperResult> {
  if (!args.accountId) {
    throw new Error('Cloudflare account ID is missing. Add one in Settings.');
  }
  if (!args.apiToken) {
    throw new Error('Cloudflare API token is missing. Add one in Settings.');
  }

  const audioBase64 = await blobToBase64(args.audio);
  const model = args.model || '@cf/openai/whisper-large-v3-turbo';
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    args.accountId,
  )}/ai/run/${model}`;

  const body: Record<string, unknown> = { audio: audioBase64 };
  if (args.language) body.language = args.language;
  const payload = JSON.stringify(body);

  const res = await fetchWithRetry(url, payload, args.apiToken, args.signal);

  const data = (await res.json()) as {
    success?: boolean;
    result?: { text?: string };
    errors?: Array<{ message?: string }>;
  };

  if (data.success === false) {
    const msg = data.errors?.map((e) => e.message).filter(Boolean).join('; ') || 'Unknown error';
    throw new Error(`Cloudflare Whisper API error: ${msg}`);
  }

  const text = data.result?.text;
  if (typeof text !== 'string') {
    throw new Error('Cloudflare Whisper response missing `result.text`');
  }
  return { text };
}

async function fetchWithRetry(
  url: string,
  payload: string,
  apiToken: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: payload,
        signal,
      });

      if (res.ok) return res;

      // Non-retryable HTTP error: surface immediately with body context.
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === RETRY_DELAYS_MS.length) {
        const errBody = await safeReadText(res);
        throw new Error(
          `Cloudflare Whisper request failed (${res.status}): ${errBody || res.statusText}`,
        );
      }

      lastError = new Error(
        `Cloudflare Whisper request failed (${res.status}): ${res.statusText}`,
      );
    } catch (err) {
      // Caller cancelled — bubble straight out, never retry.
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // Non-network error means we already threw a final error above.
      if (!isNetworkError(err) || attempt === RETRY_DELAYS_MS.length) throw err;
      lastError = err;
    }

    await sleep(RETRY_DELAYS_MS[attempt], signal);
  }

  // Should be unreachable — final attempt above throws on failure.
  throw lastError instanceof Error ? lastError : new Error('Cloudflare Whisper request failed');
}

function isNetworkError(err: unknown): boolean {
  // `fetch` throws TypeError for DNS failures, offline, CORS network errors, etc.
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

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chunked btoa to avoid call-stack overflow on large recordings.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
