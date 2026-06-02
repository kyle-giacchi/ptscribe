// Security-perimeter tests for the Worker entry handler (worker/index.ts).
//
// This file is the open-AI-billing-relay / arbitrary-fetch-proxy tripwire: it
// drives the public `fetch` export and asserts every gate in the request
// pipeline — Origin allow/deny, method guard, the sha256 + constant-time gate,
// the rate-limit bindings + global KV daily cap, the demo Nova hard-disable,
// the transcribe allowlist/size caps, generate validation, and the model-proxy
// SSRF guards. The security-critical helpers (isOriginAllowed, timingSafeEqual,
// the model-path allowlist) are module-private, so they are exercised through
// the handler rather than imported.
//
// Auth/org/config routes are mocked out here (heavy better-auth import, and
// they are covered by the D1 handler tests — see ./org.test.ts / ./config.test.ts
// per plan 10). The rate-limit *bindings* (PREGATE_RATE_LIMITER /
// API_RATE_LIMITER) and the global daily KV counter reflect the current worker
// after plans 03 (upstream timeouts) and 07 (Rate Limiting binding + edge cache).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./auth', () => ({
  createAuth: () => ({ handler: vi.fn(), api: { getSession: vi.fn() } }),
}));
vi.mock('./org', () => ({
  handleOrgRoute: vi.fn(async () => new Response('{}', { status: 200 })),
  reconcileInvite: vi.fn(),
}));
vi.mock('./config', () => ({
  handleConfigRoute: vi.fn(async () => new Response('{}', { status: 200 })),
}));

import worker from './index';
import type { Env } from './index';

const ORIGIN = 'https://ptscribe.app';
const GATE = 'test-gate';

/** Mirror of the worker's private sha256Hex, so tests can mint a valid gate key. */
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A KV-shaped fake backing only get/put (the two methods the limiter touches). */
function fakeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    _store: store,
  };
}

/** A Rate Limiting binding fake — `limit()` resolves to { success }. */
function fakeLimiter(success: boolean) {
  return { limit: vi.fn(async () => ({ success })) };
}

interface EnvOverrides {
  ANTHROPIC_API_KEY?: string;
  PTSCRIBE_GATE?: string;
  ALLOWED_ORIGINS?: string;
  DEMO_MODE?: string;
  RATE_LIMIT?: ReturnType<typeof fakeKV>;
  API_RATE_LIMITER?: ReturnType<typeof fakeLimiter>;
  PREGATE_RATE_LIMITER?: ReturnType<typeof fakeLimiter>;
  MODELS?: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
  AI?: { run: ReturnType<typeof vi.fn> };
}

function makeEnv(overrides: EnvOverrides = {}): Env {
  const env = {
    AI: overrides.AI ?? { run: vi.fn() },
    ASSETS: { fetch: vi.fn(async () => new Response('asset', { status: 200 })) },
    ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY' in overrides ? overrides.ANTHROPIC_API_KEY : 'sk-test',
    PTSCRIBE_GATE: 'PTSCRIBE_GATE' in overrides ? overrides.PTSCRIBE_GATE : GATE,
    AUTH_SECRET: 'auth-secret',
    DB: {} as unknown,
    RATE_LIMIT: overrides.RATE_LIMIT,
    API_RATE_LIMITER: overrides.API_RATE_LIMITER,
    PREGATE_RATE_LIMITER: overrides.PREGATE_RATE_LIMITER,
    MODELS: overrides.MODELS,
    ALLOWED_ORIGINS: overrides.ALLOWED_ORIGINS,
    DEMO_MODE: overrides.DEMO_MODE,
  };
  return env as unknown as Env;
}

const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

/** caches.default fake; default = miss. Per-test override via cacheMatch. */
let cacheMatch: ReturnType<typeof vi.fn>;
let cachePut: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cacheMatch = vi.fn(async () => undefined);
  cachePut = vi.fn(async () => undefined);
  vi.stubGlobal('caches', { default: { match: cacheMatch, put: cachePut } });
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function body(res: Response): Promise<{ code?: string; error?: string; text?: string }> {
  return JSON.parse(await res.text());
}

function req(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

async function gateHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return { Origin: ORIGIN, 'x-ptscribe-key': await sha256Hex(GATE), ...extra };
}

describe('Origin allow/deny (handleApi strict mode)', () => {
  it('POST /api/generate with no Origin → 403 FORBIDDEN (non-browser client)', async () => {
    const res = await worker.fetch(req('/api/generate', { method: 'POST' }), makeEnv(), ctx);
    expect(res.status).toBe(403);
    expect((await body(res)).code).toBe('FORBIDDEN');
  });

  it('POST /api/generate with disallowed Origin → 403 FORBIDDEN', async () => {
    const res = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: { Origin: 'https://evil.com' } }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(403);
    expect((await body(res)).code).toBe('FORBIDDEN');
  });

  it('allowed Origin passes the origin check (reaches session gate → 401 SIGNIN_REQUIRED)', async () => {
    // Post-BYOK (issue 03): generation is session-first. An allowed-origin call
    // with no session and not in demo mode falls through to SIGNIN_REQUIRED — it
    // got past the origin check (would be 403 otherwise).
    const res = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: { Origin: ORIGIN } }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
    expect((await body(res)).code).toBe('SIGNIN_REQUIRED');
  });

  it('honors a custom ALLOWED_ORIGINS CSV (in-list passes, default origin now denied)', async () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'https://foo.com' });
    const inList = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: { Origin: 'https://foo.com' } }),
      env,
      ctx,
    );
    expect(inList.status).toBe(401); // passed origin, failed gate

    const outOfList = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: { Origin: ORIGIN } }),
      env,
      ctx,
    );
    expect(outOfList.status).toBe(403);
  });
});

describe('Method guard', () => {
  it('GET /api/generate → 405 METHOD_NOT_ALLOWED', async () => {
    const res = await worker.fetch(req('/api/generate', { method: 'GET' }), makeEnv(), ctx);
    expect(res.status).toBe(405);
    expect((await body(res)).code).toBe('METHOD_NOT_ALLOWED');
  });
});

// The x-ptscribe gate now guards only the demo/shared generation path (and
// transcribe). These cases exercise it via /api/generate under DEMO_MODE=true,
// where a sessionless call falls into the shared-key path.
describe('Gate (sha256Hex + timingSafeEqual)', () => {
  it('allowed origin + wrong key → 401 UNAUTHORIZED', async () => {
    const res = await worker.fetch(
      req('/api/generate', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'x-ptscribe-key': 'wrong' },
      }),
      makeEnv({ DEMO_MODE: 'true' }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect((await body(res)).code).toBe('UNAUTHORIZED');
  });

  it('correct key crosses the gate (generate w/o ANTHROPIC_API_KEY → 500 MISSING_API_KEY)', async () => {
    const res = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: await gateHeaders() }),
      makeEnv({ ANTHROPIC_API_KEY: '', DEMO_MODE: 'true' }),
      ctx,
    );
    expect(res.status).toBe(500);
    expect((await body(res)).code).toBe('MISSING_API_KEY');
  });

  it('empty PTSCRIBE_GATE → always 401 even with an empty key', async () => {
    const res = await worker.fetch(
      req('/api/generate', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'x-ptscribe-key': '' },
      }),
      makeEnv({ PTSCRIBE_GATE: '', DEMO_MODE: 'true' }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe('Rate limiting (bindings + global KV daily cap)', () => {
  it('pre-gate binding denial → 429 before the gate check', async () => {
    const env = makeEnv({ PREGATE_RATE_LIMITER: fakeLimiter(false) });
    const res = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: { Origin: ORIGIN } }),
      env,
      ctx,
    );
    expect(res.status).toBe(429);
    expect((await body(res)).code).toBe('RATE_LIMITED');
    // Denied pre-gate: the AI binding must never be reached.
    expect(env.PREGATE_RATE_LIMITER!.limit).toHaveBeenCalled();
  });

  it('per-minute binding denial after a valid gate → 429', async () => {
    const env = makeEnv({
      PREGATE_RATE_LIMITER: fakeLimiter(true),
      API_RATE_LIMITER: fakeLimiter(false),
      DEMO_MODE: 'true',
    });
    const res = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: await gateHeaders() }),
      env,
      ctx,
    );
    expect(res.status).toBe(429);
    expect((await body(res)).code).toBe('RATE_LIMITED');
  });

  it('global daily KV count ≥ 500 → 429 "Service daily limit reached"', async () => {
    const day = Math.floor(Date.now() / 86_400_000);
    const env = makeEnv({ RATE_LIMIT: fakeKV({ [`rl:global:${day}`]: '500' }), DEMO_MODE: 'true' });
    const res = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: await gateHeaders() }),
      env,
      ctx,
    );
    expect(res.status).toBe(429);
    expect((await body(res)).error).toBe('Service daily limit reached');
  });

  it('no limiter bindings + no KV → fails open (reaches handler)', async () => {
    const res = await worker.fetch(
      req('/api/generate', { method: 'POST', headers: await gateHeaders() }),
      makeEnv({ ANTHROPIC_API_KEY: '', DEMO_MODE: 'true' }),
      ctx,
    );
    // Crossed gate + rate limits, landed in the shared-key generation path.
    expect(res.status).toBe(500);
    expect((await body(res)).code).toBe('MISSING_API_KEY');
  });
});

describe('Demo Nova hard-disable', () => {
  it('DEMO_MODE=true → POST /api/transcribe is 403 DEMO_DISABLED and AI.run is not called', async () => {
    const env = makeEnv({ DEMO_MODE: 'true' });
    const res = await worker.fetch(
      req('/api/transcribe', {
        method: 'POST',
        headers: await gateHeaders({ 'Content-Type': 'audio/webm' }),
        body: new Uint8Array([1, 2, 3]),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
    expect((await body(res)).code).toBe('DEMO_DISABLED');
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it('DEMO_MODE unset → transcribe proceeds to model validation', async () => {
    const res = await worker.fetch(
      req('/api/transcribe', {
        method: 'POST',
        headers: await gateHeaders({ 'x-ptscribe-model': 'bogus', 'Content-Type': 'audio/webm' }),
        body: new Uint8Array([1, 2, 3]),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await body(res)).code).toBe('MODEL_NOT_ALLOWED');
  });
});

describe('Transcribe model allowlist + size caps', () => {
  it('disallowed model → 400 MODEL_NOT_ALLOWED', async () => {
    const res = await worker.fetch(
      req('/api/transcribe', {
        method: 'POST',
        headers: await gateHeaders({
          'x-ptscribe-model': 'evil/model',
          'Content-Type': 'audio/webm',
        }),
        body: new Uint8Array([1]),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await body(res)).code).toBe('MODEL_NOT_ALLOWED');
  });

  it('Content-Length over MAX_AUDIO_BYTES → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await worker.fetch(
      req('/api/transcribe', {
        method: 'POST',
        headers: await gateHeaders({
          'Content-Type': 'audio/webm',
          'Content-Length': String(25 * 1024 * 1024 + 1),
        }),
        body: new Uint8Array([1]),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(413);
    expect((await body(res)).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('empty body → 400 EMPTY_AUDIO', async () => {
    const res = await worker.fetch(
      req('/api/transcribe', {
        method: 'POST',
        headers: await gateHeaders({ 'Content-Type': 'audio/webm' }),
        body: new Uint8Array([]),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await body(res)).code).toBe('EMPTY_AUDIO');
  });

  it('valid Nova request → AI.run called with diarize:true; returns extracted text', async () => {
    const ai = {
      run: vi.fn(async () => ({
        results: {
          channels: [{ alternatives: [{ paragraphs: { transcript: 'Speaker 0: hello' } }] }],
        },
      })),
    };
    const res = await worker.fetch(
      req('/api/transcribe', {
        method: 'POST',
        headers: await gateHeaders({ 'Content-Type': 'audio/webm' }),
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      makeEnv({ AI: ai }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((await body(res)).text).toBe('Speaker 0: hello');
    expect(ai.run).toHaveBeenCalledTimes(1);
    const [, opts] = ai.run.mock.calls[0];
    expect((opts as { diarize?: boolean }).diarize).toBe(true);
  });
});

describe('Generate validation', () => {
  // These exercise the demo/shared-key generation path (no session, DEMO_MODE on,
  // shared Anthropic key behind the gate). The session/user-key paths are covered
  // in generate.test.ts.
  async function postGenerate(payload: unknown, env = makeEnv({ DEMO_MODE: 'true' })) {
    return worker.fetch(
      req('/api/generate', {
        method: 'POST',
        headers: await gateHeaders({ 'Content-Type': 'application/json' }),
        body: typeof payload === 'string' ? payload : JSON.stringify(payload),
      }),
      env,
      ctx,
    );
  }

  it('missing ANTHROPIC_API_KEY → 500 MISSING_API_KEY', async () => {
    const res = await postGenerate(
      { model: 'claude-sonnet-4-6', system: 's', user: 'u' },
      makeEnv({ ANTHROPIC_API_KEY: '', DEMO_MODE: 'true' }),
    );
    expect(res.status).toBe(500);
    expect((await body(res)).code).toBe('MISSING_API_KEY');
  });

  it('bad JSON body → 400 INVALID_JSON', async () => {
    const res = await postGenerate('{ not json');
    expect(res.status).toBe(400);
    expect((await body(res)).code).toBe('INVALID_JSON');
  });

  it('missing model/system/user → 400 MISSING_FIELDS', async () => {
    const res = await postGenerate({ model: 'claude-sonnet-4-6' });
    expect(res.status).toBe(400);
    expect((await body(res)).code).toBe('MISSING_FIELDS');
  });

  it('disallowed model → 400 MODEL_NOT_ALLOWED', async () => {
    const res = await postGenerate({ model: 'gpt-4', system: 's', user: 'u' });
    expect(res.status).toBe(400);
    expect((await body(res)).code).toBe('MODEL_NOT_ALLOWED');
  });

  it('user prompt over 50_000 chars → 400', async () => {
    const res = await postGenerate({
      model: 'claude-sonnet-4-6',
      system: 's',
      user: 'x'.repeat(50_001),
    });
    expect(res.status).toBe(400);
  });

  it('happy path → 200 {text}; system block carries cache_control by default', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'note' }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await postGenerate({ model: 'claude-sonnet-4-6', system: 'sys', user: 'u' });
    expect(res.status).toBe(200);
    expect((await body(res)).text).toBe('note');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(opts.body as string);
    expect(sent.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('Model proxy SSRF guards (GET /api/model/*)', () => {
  function getModel(path: string, env: Env) {
    return worker.fetch(req(path, { method: 'GET' }), env, ctx);
  }

  it('MODELS unbound → 503', async () => {
    const res = await getModel('/api/model/Xenova/whisper-tiny.en/config.json', makeEnv());
    expect(res.status).toBe(503);
  });

  it('key containing ".." → 404', async () => {
    const env = makeEnv({ MODELS: { get: vi.fn(), put: vi.fn() } });
    const res = await getModel('/api/model/Xenova/../etc/passwd', env);
    expect(res.status).toBe(404);
    expect(env.MODELS!.get).not.toHaveBeenCalled();
  });

  it('key not in ALLOWED_MODEL_REPOS → 404 before any R2 or HF fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const env = makeEnv({ MODELS: { get: vi.fn(), put: vi.fn() } });
    const res = await getModel('/api/model/evil/repo/x', env);
    expect(res.status).toBe(404);
    expect(env.MODELS!.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheMatch).not.toHaveBeenCalled();
  });

  it('allowed key with an R2 hit → 200 immutable cache-control', async () => {
    const object = {
      body: 'model-bytes',
      writeHttpMetadata: (h: Headers) => h.set('Content-Type', 'application/json'),
    };
    const env = makeEnv({ MODELS: { get: vi.fn(async () => object), put: vi.fn() } });
    const res = await getModel('/api/model/Xenova/whisper-tiny.en/config.json', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(env.MODELS!.get).toHaveBeenCalledTimes(1);
  });

  it('allowed key served from edge cache → no R2 read', async () => {
    cacheMatch = vi.fn(async () => new Response('cached', { status: 200 }));
    vi.stubGlobal('caches', { default: { match: cacheMatch, put: cachePut } });
    const env = makeEnv({ MODELS: { get: vi.fn(), put: vi.fn() } });
    const res = await getModel('/api/model/Xenova/whisper-tiny.en/config.json', env);
    expect(res.status).toBe(200);
    expect(env.MODELS!.get).not.toHaveBeenCalled();
  });

  it('R2 miss → HF fallback over 200 MiB → 404', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('x', {
          status: 200,
          headers: { 'Content-Length': String(200 * 1024 * 1024 + 1) },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const env = makeEnv({ MODELS: { get: vi.fn(async () => null), put: vi.fn() } });
    const res = await getModel('/api/model/Xenova/whisper-tiny.en/pytorch_model.bin', env);
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('Security headers (withSecurityHeaders)', () => {
  it('every response carries the hardening headers', async () => {
    const res = await worker.fetch(req('/api/generate', { method: 'POST' }), makeEnv(), ctx);
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('/api/* responses are no-store; /api/model/* are not forced to no-store', async () => {
    const api = await worker.fetch(req('/api/generate', { method: 'POST' }), makeEnv(), ctx);
    expect(api.headers.get('Cache-Control')).toBe('no-store');

    const model = await worker.fetch(
      req('/api/model/Xenova/whisper-tiny.en/config.json', { method: 'GET' }),
      makeEnv(),
      ctx,
    );
    expect(model.headers.get('Cache-Control')).not.toBe('no-store');
  });
});
