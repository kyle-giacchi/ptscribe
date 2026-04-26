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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!res.ok) {
    const errBody = await safeReadText(res);
    throw new Error(
      `Cloudflare Whisper request failed (${res.status}): ${errBody || res.statusText}`,
    );
  }

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
