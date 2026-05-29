/**
 * PTScribe Worker — proxies AI calls to Cloudflare Workers AI (default
 * Deepgram Nova-3 with diarization, with a Whisper fallback for the same
 * route) and Anthropic Messages, gated by a shared secret. The same Worker
 * also serves the SPA via the Assets binding configured in wrangler.jsonc.
 *
 * Routes:
 *   POST /api/auth/**      → Better Auth handler (no gate required)
 *   POST /api/org/**       → Org management handler (no gate required, session auth)
 *   GET|PUT /api/config/** → User/org config sync (no gate required, session auth)
 *   POST /api/transcribe   body = audio/* (the actual MIME, e.g. audio/webm) → { text }
 *   POST /api/generate     body = JSON {model, system, user, ...}            → { text }
 *
 * /api/transcribe and /api/generate require `x-ptscribe-key: <env.PTSCRIBE_GATE>`.
 */

import { createAuth } from './auth';
import { handleOrgRoute } from './org';
import { handleConfigRoute } from './config';

/**
 * Workers Rate Limiting binding (GA). `limit()` is in-network, per-Cloudflare-
 * location, and eventually consistent — fast (no KV read/write) but permissive,
 * which is why the authoritative spend backstop stays on the KV global counter.
 * Config (limit + 10s/60s period) lives in wrangler.jsonc, not here.
 */
interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY: string;
  PTSCRIBE_GATE: string;
  AUTH_SECRET: string;
  /** Full origin of the app, e.g. https://ptscribe.app. Used for passkey rpID and cookie security. */
  AUTH_BASE_URL?: string;
  DB: D1Database;
  /** KV — now the SOLE rate-limit store, used only for the post-gate global
   *  daily Anthropic-spend counter. Per-IP limits moved to the Rate Limiting
   *  bindings below. */
  RATE_LIMIT?: KVNamespace;
  /** Per-IP per-minute limit on billable AI proxy calls (post-gate dispatch).
   *  Configured via the `ratelimits` block in wrangler.jsonc, not in code.
   *  Optional so local dev / unconfigured deploys fail open. */
  API_RATE_LIMITER?: RateLimitBinding;
  /** Per-IP pre-gate limit on all /api/* and /api/model/* traffic. Configured
   *  in wrangler.jsonc. Optional → fail open when absent. */
  PREGATE_RATE_LIMITER?: RateLimitBinding;
  MODELS?: R2Bucket;
  /** Comma-separated list of allowed request Origins. Defaults to same-origin
   *  plus localhost dev ports when unset. */
  ALLOWED_ORIGINS?: string;
  /** When "true", /api/transcribe (Nova) is rejected. Set on the demo deployment only. */
  DEMO_MODE?: string;
  /** Resend API key (secret). When absent, transactional email falls back to a
   *  console.log so local dev works without a provider. See worker/email.ts. */
  RESEND_API_KEY?: string;
  /** From-address for transactional email, e.g. "PTScribe <login@ptscribe.app>".
   *  Must be a domain verified in Resend (DKIM/SPF). Defaults to a ptscribe.app sender. */
  EMAIL_FROM?: string;
}

interface GenerateBody {
  model?: string;
  system?: string;
  /** Pre-built modifier block (tone + emphasis + custom). Appended to system prompt when present. */
  modifierBlock?: string;
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

// Keep aligned with src/lib/audioLimits.ts MAX_AUDIO_BYTES
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// The only model repos the app ever loads in-browser via /api/model/*.
// Whisper-tiny + bert-base-NER are seeded by scripts/seed-r2-models.ts;
// privacy-filter by convert-privacy-filter.py. Anything else is rejected
// before the R2 lookup or HuggingFace fallback so the Worker can't be used
// as an open proxy to fetch arbitrary huggingface.co paths.
const ALLOWED_MODEL_REPOS = [
  'Xenova/whisper-tiny.en/',
  'Xenova/bert-base-NER/',
  'openai/privacy-filter/',
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    let res: Response;
    if (url.pathname.startsWith('/api/auth/')) {
      res = await withGate(request, env, { origin: 'lenient' }, () =>
        createAuth(env, ctx).handler(request),
      );
    } else if (url.pathname.startsWith('/api/org/')) {
      res = await withGate(request, env, { origin: 'lenient' }, () =>
        handleOrgRoute(request, env, ctx, url.pathname),
      );
    } else if (url.pathname.startsWith('/api/config/')) {
      res = await withGate(request, env, { origin: 'lenient' }, () =>
        handleConfigRoute(request, env, ctx, url.pathname),
      );
    } else if (url.pathname.startsWith('/api/model/') && request.method === 'GET') {
      res = await withGate(request, env, { origin: 'skip' }, () =>
        handleModelFile(request, url, env, ctx),
      );
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
 *   - `connect-src 'self' https://huggingface.co`: same-origin XHR/fetch for`/api/*`.
 *     Model files are served via `/api/model/*` (R2 proxy). HuggingFace is
 *     a client-side fallback in whisper.worker.ts when the bucket is unseeded.
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
    "connect-src 'self' https://huggingface.co",
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
  // our assets. COEP is not enabled yet but is now unblocked (model files are
  // same-origin via /api/model/*) — enabling it would give SharedArrayBuffer.
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Suppress no-cache header from being clobbered if upstream set caching.
  // /api/* already sets `no-store` in `json()`. Model files at /api/model/*
  // set their own immutable cache header — don't override them. For static
  // assets, leave the ASSETS-binding-supplied caching alone.
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/model/')) {
    headers.set('Cache-Control', 'no-store');
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

async function handleModelFile(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!env.MODELS) {
    return new Response(JSON.stringify({ error: 'Model storage not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Strip /api/model/ prefix → R2 key, e.g. "Xenova/whisper-tiny.en/resolve/main/config.json"
  const key = url.pathname.slice('/api/model/'.length);
  if (!key || key.includes('..') || key.startsWith('/')) {
    return new Response('Not found', { status: 404 });
  }
  // Restrict to known model repos — applies to both the R2 lookup and the
  // HuggingFace fallback below, so this route can't proxy arbitrary keys.
  if (!ALLOWED_MODEL_REPOS.some((repo) => key.startsWith(repo))) {
    return new Response('Not found', { status: 404 });
  }

  // Edge cache: model files are immutable, so a hit serves with no R2 read and
  // no binding call. Checked after key validation so bad keys can't be cached.
  // (GET-only route — the caller guards request.method === 'GET'.)
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const object = await env.MODELS.get(key);
  if (object) {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    const response = new Response(object.body, { headers });
    // Fill the edge cache so subsequent shard requests skip R2 entirely.
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  }

  // R2 miss — proxy from HuggingFace so the app works before model files are uploaded.
  // This is the *sole* model source until R2 is seeded, so it gets a timeout +
  // one retry; terminal failure logs for the operator and returns 404 as before.
  const hfRes = await fetchModelFromHf(key);
  if (!hfRes || !hfRes.body) return new Response('Not found', { status: 404 });

  const hfContentLength = Number(hfRes.headers.get('Content-Length') ?? 0);
  const HF_SIZE_LIMIT = 200 * 1024 * 1024; // 200 MB
  if (hfContentLength > HF_SIZE_LIMIT) return new Response('Not found', { status: 404 });

  const contentType = hfRes.headers.get('Content-Type') ?? 'application/octet-stream';
  const cacheControl = 'public, max-age=31536000, immutable';

  // Tee the body: one branch streams to the client, the other streams into R2.
  // Avoids buffering ~100 MB ONNX weights in worker memory (128 MB isolate cap).
  const [toClient, toR2] = hfRes.body.tee();

  ctx.waitUntil(
    env.MODELS.put(key, toR2, {
      httpMetadata: { contentType, cacheControl },
    }),
  );

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', cacheControl);
  if (hfContentLength) headers.set('Content-Length', String(hfContentLength));
  // Not edge-cached here: the body is already tee'd to the client + R2, and a
  // third clone of ~100 MB weights would add memory pressure. The R2 write above
  // means the next request is an R2 hit, which *is* cached.
  return new Response(toClient, { status: 200, headers });
}

/**
 * Fetch a model file from HuggingFace with a per-attempt timeout and one retry.
 * Returns a successful (ok, with-body) Response, or null on terminal failure —
 * in which case the caller returns 404, preserving the existing client contract.
 * Logs once on terminal failure so an unseeded-R2 outage is visible to operators.
 */
async function fetchModelFromHf(key: string, attempts = 2): Promise<Response | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`https://huggingface.co/${key}`, {
        signal: AbortSignal.timeout(HF_FETCH_TIMEOUT_MS),
      });
      if (res.ok && res.body) return res;
      // Non-ok / no-body: fall through to retry (or terminal log on last attempt).
    } catch (err) {
      if (attempt < attempts) continue;
      console.error(`[model] HF backfill failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }
  console.error(`[model] HF backfill failed for ${key}: exhausted ${attempts} attempts`);
  return null;
}

function isOriginAllowed(origin: string, requestUrl: string, env: Env): boolean {
  const workerOrigin = new URL(requestUrl).origin;
  const allowed = env.ALLOWED_ORIGINS
    ? new Set(
        env.ALLOWED_ORIGINS.split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      )
    : new Set([workerOrigin, 'http://localhost:8080', 'http://localhost:8787']);
  return allowed.has(origin);
}

interface GateOptions {
  /** 'strict' denies a missing Origin (AI proxy); 'lenient' allows it
   *  (browser same-origin sub-routes); 'skip' bypasses the Origin check
   *  entirely (model file GETs). */
  origin: 'strict' | 'lenient' | 'skip';
}

async function withGate(
  request: Request,
  env: Env,
  opts: GateOptions,
  handler: () => Promise<Response>,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (opts.origin === 'strict') {
    if (!origin || !isOriginAllowed(origin, request.url, env)) {
      return apiError('FORBIDDEN', 'Origin not allowed', 403);
    }
  } else if (opts.origin === 'lenient') {
    if (origin && !isOriginAllowed(origin, request.url, env)) {
      return apiError('FORBIDDEN', 'Origin not allowed', 403);
    }
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await checkPreGateLimit(env, ip)).allowed) {
    return apiError('RATE_LIMITED', 'Rate limit exceeded', 429);
  }
  return handler();
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'POST') {
    return apiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // AI routes are always POST from browser `fetch`, which the Fetch spec
  // requires to carry an Origin header even same-origin. A *missing* Origin
  // therefore means a non-browser client (curl/script) — deny it here rather
  // than skip the check, closing the server-side abuse path the gate can't.
  return withGate(request, env, { origin: 'strict' }, async () => {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
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
  });
}

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  // Server-side belt-and-suspenders for the demo Nova hard-disable: even a tampered
  // client cannot bill Nova on the demo deployment. The var is set only there.
  if (env.DEMO_MODE === 'true') {
    return apiError('DEMO_DISABLED', 'Cloud transcription is disabled in demo mode', 403);
  }
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
    const result = (await withTimeout(
      env.AI.run(
        model as keyof AiModels,
        {
          audio: { body: stream, contentType },
          diarize: true,
          smart_format: true,
          punctuate: true,
          paragraphs: true,
          ...(language ? { language } : { detect_language: true }),
        } as never,
      ),
      WORKERS_AI_TIMEOUT_MS,
    )) as DeepgramResponse;

    const text = extractDeepgramText(result);
    if (!text) return apiError('EMPTY_TEXT', 'Nova-3 returned no text', 502);
    return json({ text });
  } catch (err) {
    if (isTimeoutError(err)) {
      return apiError('UPSTREAM_TIMEOUT', 'Cloud transcription timed out', 504);
    }
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
    const result = (await withTimeout(
      env.AI.run(
        model as keyof AiModels,
        {
          audio: audioInput,
          ...(language ? { language } : {}),
        } as never,
      ),
      WORKERS_AI_TIMEOUT_MS,
    )) as { text?: string };

    const text = typeof result?.text === 'string' ? result.text : '';
    if (!text) return apiError('EMPTY_TEXT', 'Whisper returned no text', 502);
    return json({ text });
  } catch (err) {
    if (isTimeoutError(err)) {
      return apiError('UPSTREAM_TIMEOUT', 'Transcription timed out', 504);
    }
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
  if (body.user.length > 50_000) {
    return apiError('MISSING_FIELDS', 'user prompt too large', 400);
  }

  const modifierBlock = body.modifierBlock?.trim();
  const finalSystem = modifierBlock
    ? `${body.system.trimEnd()}\n\n${modifierBlock}`
    : body.system.trimEnd();

  const cacheSystem = body.cacheSystem !== false;
  const systemBlocks = [
    cacheSystem
      ? { type: 'text', text: finalSystem, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: finalSystem },
  ];

  let upstream: Response;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
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
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      console.error(`[generate] Anthropic upstream timed out after ${ANTHROPIC_TIMEOUT_MS}ms`);
      return apiError('UPSTREAM_TIMEOUT', 'Note generation timed out', 504);
    }
    console.error(`[generate] Anthropic upstream fetch failed: ${(err as Error).message}`);
    return apiError('UPSTREAM_FAILED', 'Note generation failed upstream', 502);
  }

  if (!upstream.ok) {
    // Keep the upstream detail in operator logs only; the client gets a
    // generic message + status so we don't leak Anthropic account/quota text.
    const detail = (await safeText(upstream)).slice(0, 200);
    console.error(
      `[generate] Anthropic upstream ${upstream.status}: ${detail || upstream.statusText}`,
    );
    return apiError(
      'UPSTREAM_FAILED',
      `Note generation failed upstream (${upstream.status})`,
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

// Per-IP per-minute/pre-gate limits now live in the Rate Limiting bindings
// (configured in wrangler.jsonc). The binding's period is 10s or 60s only, so
// the former per-IP *daily* cap cannot be expressed by it and is dropped — the
// KV global daily counter below remains the real spend backstop.
const RATE_LIMIT_GLOBAL_PER_DAY = 500;

// Upstream timeouts. Without these, a slow/hung upstream blocks the request to
// the Worker wall-clock limit while holding a rate-limit slot. Anthropic is
// generous (long completions); transcription and per-file model fetches are tighter.
const ANTHROPIC_TIMEOUT_MS = 60_000; // note generation; long completions
const WORKERS_AI_TIMEOUT_MS = 45_000; // transcription (Nova / Whisper)
const HF_FETCH_TIMEOUT_MS = 30_000; // per-attempt model-file fetch

/**
 * Race a promise against a timeout. Used for `env.AI.run`, whose binding does
 * not reliably accept an AbortSignal — `fetch`-based calls use
 * `AbortSignal.timeout` directly instead. The timer is always cleared so it
 * never dangles past resolution. On timeout the rejection is a `TimeoutError`,
 * matched by `isTimeoutError` at the call sites.
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('Upstream timed out');
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** True for both our synthetic `withTimeout` rejection and `AbortSignal.timeout`. */
function isTimeoutError(err: unknown): boolean {
  const name = (err as Error | undefined)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

// Pre-gate per-IP limit on all /api/* (and /api/model/*) traffic. Backed by the
// Rate Limiting binding — no KV reads/writes, so unauthenticated/static/model
// traffic no longer touches KV. Fail open when the binding is absent (local dev).
async function checkPreGateLimit(env: Env, ip: string): Promise<{ allowed: boolean }> {
  if (!env.PREGATE_RATE_LIMITER) return { allowed: true };
  const { success } = await env.PREGATE_RATE_LIMITER.limit({ key: ip });
  return { allowed: success };
}

// Global daily Anthropic-spend counter. This is the ONLY remaining KV rate-limit
// user, and it runs strictly post-gate (handleApi, after auth) so config/model/
// static traffic never writes to KV. The read→write is intentionally non-atomic
// and permissive: a small overshoot of the cap is acceptable — it is a spend
// *alarm*, not a hard ledger. KV writes now scale with billable AI calls only.
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

// Per-IP per-minute limit on billable AI proxy calls (post-gate). Backed by the
// Rate Limiting binding. The former per-IP daily cap is dropped (binding period
// is 10s/60s only); the global daily KV counter is the spend backstop instead.
async function checkRateLimit(env: Env, ip: string): Promise<{ allowed: boolean }> {
  if (!env.API_RATE_LIMITER) return { allowed: true };
  const { success } = await env.API_RATE_LIMITER.limit({ key: ip });
  return { allowed: success };
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
  | 'DEMO_DISABLED'
  | 'UPSTREAM_FAILED'
  | 'UPSTREAM_TIMEOUT';

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
