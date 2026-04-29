/**
 * PTScribe Worker — proxies AI calls to Cloudflare Workers AI (default
 * Deepgram Nova-3 with diarization, with a Whisper fallback for the same
 * route) and Anthropic Messages, gated by a shared secret. The same Worker
 * also serves the SPA via the Assets binding configured in wrangler.jsonc.
 *
 * Routes:
 *   POST /api/transcribe   body = audio/* (the actual MIME, e.g. audio/webm) → { text }
 *   POST /api/generate     body = JSON {model, system, user, ...}            → { text }
 *
 * All /api/* requests must include `x-ptscribe-key: <env.PTSCRIBE_GATE>`.
 */

interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY: string;
  PTSCRIBE_GATE: string;
}

interface GenerateBody {
  model?: string;
  system?: string;
  user?: string;
  maxTokens?: number;
  temperature?: number;
  cacheSystem?: boolean;
}

const DEFAULT_TRANSCRIBE_MODEL = '@cf/deepgram/nova-3';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const gate = request.headers.get('x-ptscribe-key') ?? '';
  const expectedHash = env.PTSCRIBE_GATE ? await sha256Hex(env.PTSCRIBE_GATE) : '';
  if (!expectedHash || !timingSafeEqual(gate, expectedHash)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (url.pathname === '/api/transcribe') return handleTranscribe(request, env);
  if (url.pathname === '/api/generate') return handleGenerate(request, env);
  return json({ error: 'Not found' }, 404);
}

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  const language = request.headers.get('x-ptscribe-language') || undefined;
  const model =
    request.headers.get('x-ptscribe-model')?.trim() || DEFAULT_TRANSCRIBE_MODEL;
  const contentType = request.headers.get('Content-Type') || 'audio/webm';

  let audio: Uint8Array;
  try {
    const buf = await request.arrayBuffer();
    audio = new Uint8Array(buf);
  } catch {
    return json({ error: 'Failed to read audio body' }, 400);
  }
  if (audio.byteLength === 0) {
    return json({ error: 'Empty audio body' }, 400);
  }

  if (model.startsWith('@cf/deepgram/')) {
    return runDeepgram(env, model, audio, contentType, language);
  }
  return runWhisper(env, model, audio, language);
}

async function runDeepgram(
  env: Env,
  model: string,
  audio: Uint8Array,
  contentType: string,
  language: string | undefined,
): Promise<Response> {
  try {
    // Nova-3 wants { body, contentType }. We feed it a fresh stream from the
    // bytes we already buffered. Diarization labels speakers; smart_format
    // gives us a `paragraphs.transcript` already shaped as
    // "Speaker 0: ...\n\nSpeaker 1: ..." which is perfect for the prompt.
    const stream = new Response(audio).body;
    const result = (await env.AI.run(model as keyof AiModels, {
      audio: { body: stream, contentType },
      diarize: true,
      smart_format: true,
      punctuate: true,
      paragraphs: true,
      ...(language ? { language } : { detect_language: true }),
    } as never)) as DeepgramResponse;

    const text = extractDeepgramText(result);
    if (!text) return json({ error: 'Nova-3 returned no text' }, 502);
    return json({ text });
  } catch (err) {
    return json(
      { error: `Workers AI Nova-3 failed: ${(err as Error).message || 'unknown'}` },
      502,
    );
  }
}

async function runWhisper(
  env: Env,
  model: string,
  audio: Uint8Array,
  language: string | undefined,
): Promise<Response> {
  // whisper-large-v3-turbo expects `audio` as a base64-encoded string;
  // the legacy `@cf/openai/whisper` accepts a number[] of bytes.
  const isTurbo = model.includes('whisper-large-v3-turbo');
  const audioInput = isTurbo ? bytesToBase64(audio) : Array.from(audio);

  try {
    const result = (await env.AI.run(model as keyof AiModels, {
      audio: audioInput,
      ...(language ? { language } : {}),
    } as never)) as { text?: string };

    const text = typeof result?.text === 'string' ? result.text : '';
    if (!text) return json({ error: 'Whisper returned no text' }, 502);
    return json({ text });
  } catch (err) {
    return json(
      { error: `Workers AI Whisper failed: ${(err as Error).message || 'unknown'}` },
      502,
    );
  }
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        paragraphs?: {
          transcript?: string;
          paragraphs?: Array<{
            speaker?: number;
            sentences?: Array<{ text?: string; speaker?: number }>;
          }>;
        };
        words?: Array<{
          punctuated_word?: string;
          word?: string;
          speaker?: number;
        }>;
      }>;
    }>;
  };
}

type DeepgramAlt = NonNullable<
  NonNullable<NonNullable<DeepgramResponse['results']>['channels']>[number]['alternatives']
>[number];

function extractDeepgramText(result: DeepgramResponse): string {
  const alt = result?.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) return '';
  return (
    fromParagraphTranscript(alt) ||
    fromParagraphList(alt) ||
    fromWordTags(alt) ||
    (alt.transcript ?? '').trim()
  );
}

function fromParagraphTranscript(alt: DeepgramAlt): string {
  const text = alt.paragraphs?.transcript?.trim();
  return text ?? '';
}

function fromParagraphList(alt: DeepgramAlt): string {
  const paragraphs = alt.paragraphs?.paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return '';
  return paragraphs
    .map((p) => {
      const speaker = typeof p.speaker === 'number' ? p.speaker : 0;
      const body = (p.sentences ?? []).map((s) => s.text ?? '').join(' ').trim();
      return body ? `Speaker ${speaker}: ${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function fromWordTags(alt: DeepgramAlt): string {
  const words = alt.words;
  if (!Array.isArray(words) || words.length === 0) return '';
  const lines: string[] = [];
  let currentSpeaker: number | undefined;
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    lines.push(`Speaker ${currentSpeaker ?? 0}: ${buffer.join(' ')}`);
    buffer = [];
  };
  for (const w of words) {
    const sp = typeof w.speaker === 'number' ? w.speaker : 0;
    const word = w.punctuated_word || w.word || '';
    if (sp !== currentSpeaker) {
      flush();
      currentSpeaker = sp;
    }
    if (word) buffer.push(word);
  }
  flush();
  return lines.join('\n\n');
}

async function handleGenerate(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'Server is missing ANTHROPIC_API_KEY secret' }, 500);
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.model || !body.system || !body.user) {
    return json({ error: 'Missing model/system/user' }, 400);
  }

  const cacheSystem = body.cacheSystem !== false;
  const systemBlocks = [
    cacheSystem
      ? { type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: body.system },
  ];

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: body.model,
      max_tokens: body.maxTokens ?? 2048,
      temperature: body.temperature ?? 0.2,
      system: systemBlocks,
      messages: [{ role: 'user', content: [{ type: 'text', text: body.user }] }],
    }),
  });

  if (!upstream.ok) {
    const errBody = await safeText(upstream);
    return json(
      { error: `Anthropic request failed (${upstream.status}): ${errBody || upstream.statusText}` },
      upstream.status >= 500 ? 502 : upstream.status,
    );
  }

  const data = (await upstream.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (!text) return json({ error: 'Anthropic response had no text content' }, 502);
  return json({ text });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // btoa needs a binary string; chunk to avoid call-stack blow-ups on big clips.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
