/**
 * PTScribe Worker — proxies AI calls to Cloudflare Workers AI (default
 * Deepgram Nova-3 with diarization, with a Whisper fallback for the same
 * route) and Anthropic Messages, gated by a shared secret. The same Worker
 * also serves the SPA via the Assets binding configured in wrangler.jsonc.
 *
 * Routes:
 *   POST /api/auth/**      → Better Auth handler (no gate required)
 *   POST /api/org/**       → Org management handler (no gate required, session auth)
 *   POST /api/transcribe   body = audio/* (the actual MIME, e.g. audio/webm) → { text }
 *   POST /api/generate     body = JSON {model, system, user, ...}            → { text }
 *
 * /api/transcribe and /api/generate require `x-ptscribe-key: <env.PTSCRIBE_GATE>`.
 */

import { createAuth } from './auth';
import { handleOrgRoute } from './org';

export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY: string;
  PTSCRIBE_GATE: string;
  AUTH_SECRET: string;
  /** Full origin of the app, e.g. https://ptscribe.app. Used for passkey rpID and cookie security. */
  AUTH_BASE_URL?: string;
  DB: D1Database;
  RATE_LIMIT?: KVNamespace;
  /** Comma-separated list of allowed request Origins. Defaults to same-origin
   *  plus localhost dev ports when unset. */
  ALLOWED_ORIGINS?: string;
}

type ToneStyle = 'narrative' | 'terse' | 'clinical';

/**
 * Tone blocks are kept server-side so the composed system prompt is built from
 * a static constant — the exact string that Anthropic caches never varies due
 * to client-side reconstruction differences.
 */
const TONE_BLOCKS: Record<ToneStyle, string> = {
  narrative: 'Write in flowing professional prose. Full sentences. Clinical but readable.',
  terse:
    'Write in bullet-point shorthand. Phrases over sentences. Skip articles where ambiguity is low. Prefer abbreviations a PT will recognize (PROM, AROM, MMT, WBAT, NWB, etc.).',
  clinical:
    'Write in formal clinical documentation style. Third-person passive where natural. Use precise anatomical and biomechanical terminology. Cite specific measurements when transcript supplies them.',
};

const DEFAULT_TONE: ToneStyle = 'narrative';

interface GenerateBody {
  model?: string;
  /** Raw template system prompt — WITHOUT the tone block. The Worker appends
   *  the tone block from TONE_BLOCKS so the cached string is always built from
   *  a server-side constant. */
  system?: string;
  /** Tone style key. Defaults to 'narrative'. */
  toneStyle?: ToneStyle;
  user?: string;
  maxTokens?: number;
  temperature?: number;
  cacheSystem?: boolean;
}

const DEFAULT_TRANSCRIBE_MODEL = '@cf/deepgram/nova-3';

const ALLOWED_TRANSCRIBE_MODELS = new Set([
  '@cf/deepgram/nova-3',
  '@cf/openai/whisper',
  '@cf/openai/whisper-large-v3-turbo',
  '@cf/openai/whisper-sherpa',
]);

const ALLOWED_GENERATE_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
]);

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    let res: Response;
    if (url.pathname.startsWith('/api/auth/')) {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      if (!(await checkPreGateLimit(env, ip)).allowed) {
        res = apiError('RATE_LIMITED', 'Rate limit exceeded', 429);
      } else {
        res = await createAuth(env, ctx).handler(request);
      }
    } else if (url.pathname.startsWith('/api/org/')) {
      res = await handleOrgRoute(request, env, ctx, url.pathname);
    } else if (url.pathname.startsWith('/api/')) {
      res = await handleApi(request, env, url);
    } else {
      res = await env.ASSETS.fetch(request);
    }

    return withSecurityHeaders(res, url);
  },
};

/**
 * Security headers applied to every response. The CSP here is the local-first
 * boundary: a single compromised dependency can no longer reach an attacker
 * server, and an iframed clone cannot host this app for clickjacking.
 *
 * Notes on the directives:
 *   - `script-src 'self'`: bundled JS only. No inline scripts; no third-party.
 *   - `style-src 'self' 'unsafe-inline'`: inline `style={{}}` from React. To be
 *     tightened with a nonce later.
 *   - `worker-src 'self' blob:`: `MediaRecorder`, `timeStretch.worker.ts`, and
 *     transformers.js load from blob URLs.
 *   - `connect-src 'self' https://*.huggingface.co https://huggingface.co
 *     https://cdn-lfs.huggingface.co`: same-origin XHR/fetch for `/api/*`,
 *     plus HuggingFace model downloads when local Whisper is enabled.
 *   - `media-src 'self' blob:`: <audio> sources blob URLs from IndexedDB.
 *   - `frame-ancestors 'none'`: blocks framing entirely (better than X-Frame).
 *   - `object-src 'none'`: no plugins; `base-uri 'self'`: no <base> hijack.
 */
function withSecurityHeaders(res: Response, url: URL): Response {
  // Don't rewrite the body — clone headers and re-emit. Avoid mutating opaque
  // responses (we never produce any here, so this is straightforward).
  const headers = new Headers(res.headers);

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://huggingface.co https://*.huggingface.co https://cdn-lfs.huggingface.co",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  headers.set('Content-Security-Policy', csp);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set(
    'Permissions-Policy',
    'camera=(), geolocation=(), payment=(), usb=(), bluetooth=(), magnetometer=(), accelerometer=(), gyroscope=()',
  );
  // HSTS only meaningful for HTTPS clients; safe to send unconditionally because
  // browsers ignore it on HTTP. Cloudflare is HTTPS-only in production.
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Cross-origin isolation — keep it modest. COOP same-origin prevents window
  // handle leaks from popups; CORP same-origin prevents cross-origin embeds of
  // our assets. Don't enable COEP — it would break the HuggingFace fetch.
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Suppress no-cache header from being clobbered if upstream set caching.
  // /api/* already sets `no-store` in `json()`. For static assets, leave the
  // ASSETS-binding-supplied caching alone.
  if (url.pathname.startsWith('/api/')) {
    headers.set('Cache-Control', 'no-store');
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'POST') {
    return apiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  const origin = request.headers.get('Origin');
  if (origin) {
    const workerOrigin = new URL(request.url).origin;
    const allowed = env.ALLOWED_ORIGINS
      ? new Set(
          env.ALLOWED_ORIGINS.split(',')
            .map((o) => o.trim())
            .filter(Boolean),
        )
      : new Set([workerOrigin, 'http://localhost:8080', 'http://localhost:8787']);
    if (!allowed.has(origin)) {
      return apiError('FORBIDDEN', 'Origin not allowed', 403);
    }
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await checkPreGateLimit(env, ip)).allowed) {
    return apiError('RATE_LIMITED', 'Rate limit exceeded', 429);
  }

  const gate = request.headers.get('x-ptscribe-key') ?? '';
  const expectedHash = env.PTSCRIBE_GATE ? await sha256Hex(env.PTSCRIBE_GATE) : '';
  if (!expectedHash || !timingSafeEqual(gate, expectedHash)) {
    return apiError('UNAUTHORIZED', 'Unauthorized', 401);
  }

  if (!(await checkRateLimit(env, ip)).allowed) {
    return apiError('RATE_LIMITED', 'Rate limit exceeded', 429);
  }
  if (!(await checkGlobalDailyLimit(env)).allowed) {
    return apiError('RATE_LIMITED', 'Service daily limit reached', 429);
  }

  if (url.pathname === '/api/transcribe' || url.pathname === '/api/v1/transcribe') {
    return handleTranscribe(request, env);
  }
  if (url.pathname === '/api/generate' || url.pathname === '/api/v1/generate') {
    return handleGenerate(request, env);
  }
  return apiError('NOT_FOUND', 'Not found', 404);
}

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  const language = request.headers.get('x-ptscribe-language') || undefined;
  const model = request.headers.get('x-ptscribe-model')?.trim() || DEFAULT_TRANSCRIBE_MODEL;
  const contentType = request.headers.get('Content-Type') || 'audio/webm';

  if (!ALLOWED_TRANSCRIBE_MODELS.has(model)) {
    return apiError('MODEL_NOT_ALLOWED', `Model not allowed: ${model}`, 400);
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? NaN);
  if (!isNaN(contentLength) && contentLength > MAX_AUDIO_BYTES) {
    return apiError('PAYLOAD_TOO_LARGE', 'Payload too large', 413);
  }

  let audio: Uint8Array;
  try {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_AUDIO_BYTES) {
      return apiError('PAYLOAD_TOO_LARGE', 'Payload too large', 413);
    }
    audio = new Uint8Array(buf);
  } catch {
    return apiError('INVALID_AUDIO', 'Failed to read audio body', 400);
  }
  if (audio.byteLength === 0) {
    return apiError('EMPTY_AUDIO', 'Empty audio body', 400);
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
    const result = (await env.AI.run(
      model as keyof AiModels,
      {
        audio: { body: stream, contentType },
        diarize: true,
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        ...(language ? { language } : { detect_language: true }),
      } as never,
    )) as DeepgramResponse;

    const text = extractDeepgramText(result);
    if (!text) return apiError('EMPTY_TEXT', 'Nova-3 returned no text', 502);
    return json({ text });
  } catch (err) {
    return apiError(
      'UPSTREAM_FAILED',
      `Workers AI Nova-3 failed: ${(err as Error).message || 'unknown'}`,
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
    const result = (await env.AI.run(
      model as keyof AiModels,
      {
        audio: audioInput,
        ...(language ? { language } : {}),
      } as never,
    )) as { text?: string };

    const text = typeof result?.text === 'string' ? result.text : '';
    if (!text) return apiError('EMPTY_TEXT', 'Whisper returned no text', 502);
    return json({ text });
  } catch (err) {
    return apiError(
      'UPSTREAM_FAILED',
      `Workers AI Whisper failed: ${(err as Error).message || 'unknown'}`,
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
      const body = (p.sentences ?? [])
        .map((s) => s.text ?? '')
        .join(' ')
        .trim();
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
    return apiError('MISSING_API_KEY', 'Server is missing ANTHROPIC_API_KEY secret', 500);
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return apiError('INVALID_JSON', 'Invalid JSON body', 400);
  }
  if (!body.model || !body.system || !body.user) {
    return apiError('MISSING_FIELDS', 'Missing model/system/user', 400);
  }
  if (!ALLOWED_GENERATE_MODELS.has(body.model)) {
    return apiError('MODEL_NOT_ALLOWED', `Model not allowed: ${body.model}`, 400);
  }

  // Compose the final system prompt server-side so the cached string is built
  // from a static constant (TONE_BLOCKS) rather than a client-reconstructed
  // string, guaranteeing stable Anthropic prompt-cache keys.
  const toneStyle: ToneStyle =
    body.toneStyle && body.toneStyle in TONE_BLOCKS ? body.toneStyle : DEFAULT_TONE;
  const finalSystem = `${body.system.trimEnd()}\n\n# Tone & style\n${TONE_BLOCKS[toneStyle]}`;

  const cacheSystem = body.cacheSystem !== false;
  const systemBlocks = [
    cacheSystem
      ? { type: 'text', text: finalSystem, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: finalSystem },
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
    const errBody = (await safeText(upstream)).slice(0, 200);
    return apiError(
      'UPSTREAM_FAILED',
      `Anthropic request failed (${upstream.status}): ${errBody || upstream.statusText}`,
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
  if (!text) return apiError('EMPTY_TEXT', 'Anthropic response had no text content', 502);
  return json({ text });
}

const RATE_LIMIT_PRE_GATE_PER_MIN = 20;
const RATE_LIMIT_PER_MIN = 10;
const RATE_LIMIT_PER_DAY = 300;
const RATE_LIMIT_GLOBAL_PER_DAY = 500;

async function checkPreGateLimit(env: Env, ip: string): Promise<{ allowed: boolean }> {
  if (!env.RATE_LIMIT) return { allowed: true };
  const now = Date.now();
  const key = `rl:pg:${ip}:${Math.floor(now / 60_000)}`;
  const raw = await env.RATE_LIMIT.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RATE_LIMIT_PRE_GATE_PER_MIN) return { allowed: false };
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 120 });
  return { allowed: true };
}

async function checkGlobalDailyLimit(env: Env): Promise<{ allowed: boolean }> {
  if (!env.RATE_LIMIT) return { allowed: true };
  const now = Date.now();
  const key = `rl:global:${Math.floor(now / 86_400_000)}`;
  const raw = await env.RATE_LIMIT.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RATE_LIMIT_GLOBAL_PER_DAY) return { allowed: false };
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 172800 });
  return { allowed: true };
}

async function checkRateLimit(env: Env, ip: string): Promise<{ allowed: boolean }> {
  if (!env.RATE_LIMIT) return { allowed: true };
  // KV read → increment → write is not atomic: two simultaneous requests at the limit
  // can both pass. Acceptable at this traffic scale; do not assume strong consistency.
  const now = Date.now();
  const minuteKey = `rl:min:${ip}:${Math.floor(now / 60_000)}`;
  const dayKey = `rl:day:${ip}:${Math.floor(now / 86_400_000)}`;

  const [minRaw, dayRaw] = await Promise.all([
    env.RATE_LIMIT.get(minuteKey),
    env.RATE_LIMIT.get(dayKey),
  ]);

  const minCount = minRaw ? parseInt(minRaw, 10) : 0;
  const dayCount = dayRaw ? parseInt(dayRaw, 10) : 0;

  if (minCount >= RATE_LIMIT_PER_MIN || dayCount >= RATE_LIMIT_PER_DAY) {
    return { allowed: false };
  }

  await Promise.all([
    env.RATE_LIMIT.put(minuteKey, String(minCount + 1), { expirationTtl: 120 }),
    env.RATE_LIMIT.put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }),
  ]);

  return { allowed: true };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

type ErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'MODEL_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_AUDIO'
  | 'EMPTY_AUDIO'
  | 'INVALID_JSON'
  | 'MISSING_FIELDS'
  | 'MISSING_API_KEY'
  | 'EMPTY_TEXT'
  | 'UPSTREAM_FAILED';

function apiError(code: ErrorCode, error: string, status: number): Response {
  return json({ code, error }, status);
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
  // Both inputs are SHA-256 hex (64 chars). Iterate a fixed length so an
  // attacker probing length differences sees the same wall-clock cost.
  const FIXED_LEN = 64;
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < FIXED_LEN; i += 1) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= ca ^ cb;
  }
  return mismatch === 0;
}
