/**
 * PTScribe Worker — proxies AI calls to Cloudflare Workers AI (Whisper) and
 * Anthropic Messages, gated by a shared secret. The same Worker also serves
 * the SPA via the Assets binding configured in wrangler.jsonc.
 *
 * Routes:
 *   POST /api/transcribe   body = audio/* (octet-stream)            → { text }
 *   POST /api/generate     body = JSON {model, system, user, ...}   → { text }
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

const DEFAULT_WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';

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
  if (!env.PTSCRIBE_GATE || !timingSafeEqual(gate, env.PTSCRIBE_GATE)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (url.pathname === '/api/transcribe') return handleTranscribe(request, env);
  if (url.pathname === '/api/generate') return handleGenerate(request, env);
  return json({ error: 'Not found' }, 404);
}

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  const language = request.headers.get('x-ptscribe-language') || undefined;
  const model =
    request.headers.get('x-ptscribe-model')?.trim() || DEFAULT_WHISPER_MODEL;

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

  try {
    const result = (await env.AI.run(model as keyof AiModels, {
      audio: Array.from(audio),
      ...(language ? { language } : {}),
    })) as { text?: string };

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
