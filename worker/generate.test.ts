// worker/generate.test.ts
//
// BYOK session/user-key generation paths for /api/generate (ADR-0009/0010,
// issue 03). The shared/demo path + the security perimeter (origin, gate, caps,
// field validation) are covered in index.test.ts; this file covers the
// authenticated key-resolution path that index.test.ts can't reach.
//
// Mocks: a stable getSession, a tiny configurable ./db fake (key-resolution
// reads only), and ./keyCrypto.decryptKey (real crypto is tested in
// keyCrypto.test.ts). The provider registry + anthropic adapter run for real;
// only the upstream provider fetch is stubbed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockGetSession, mockDbRows } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockDbRows: { user_api_keys: [], org_api_keys: [], user: [] } as Record<
    string,
    Record<string, unknown>[]
  >,
}));

vi.mock('./auth', () => ({
  createAuth: () => ({ handler: vi.fn(), api: { getSession: mockGetSession } }),
}));

vi.mock('./db', () => ({
  makeDb: () => ({
    selectFrom: (table: string) => {
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        where: (col: string, _op: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        executeTakeFirst: async () =>
          (mockDbRows[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)),
        execute: async () =>
          (mockDbRows[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v)),
      };
      return builder;
    },
  }),
}));

vi.mock('./keyCrypto', () => ({
  decryptKey: vi.fn(async () => 'sk-resolved-plaintext'),
  KeyCryptoError: class KeyCryptoError extends Error {},
}));

import worker from './index';
import { decryptKey, KeyCryptoError } from './keyCrypto';

const ORIGIN = 'https://ptscribe.app';
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

function makeEnv(overrides: Record<string, unknown> = {}): Env {
  return {
    AI: { run: vi.fn() },
    ASSETS: { fetch: vi.fn() },
    ANTHROPIC_API_KEY: 'sk-shared',
    PTSCRIBE_GATE: 'gate-secret',
    AUTH_SECRET: 'auth-secret',
    DB: {},
    KEY_ENC_MASTER: { get: async () => 'master' },
    ...overrides,
  } as unknown as Env;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function genReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/generate`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function readBody(res: Response): Promise<{ code?: string; text?: string; error?: string }> {
  return JSON.parse(await res.text());
}

function stubUpstream(
  status: number,
  payload: unknown = { content: [{ type: 'text', text: 'note' }] },
) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const VALID = { provider: 'anthropic', model: 'claude-sonnet-4-6', system: 's', user: 'u' };

beforeEach(() => {
  mockGetSession.mockReset();
  mockDbRows.user_api_keys = [];
  mockDbRows.org_api_keys = [];
  mockDbRows.user = [];
  vi.mocked(decryptKey).mockReset().mockResolvedValue('sk-resolved-plaintext');
});
afterEach(() => vi.unstubAllGlobals());

describe('session + key resolution', () => {
  it('uses the personal key when present → 200 {text}', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    mockDbRows.user_api_keys = [
      { userId: 'u1', provider: 'anthropic', ciphertext: 'ct', iv: 'iv' },
    ];
    const fetchMock = stubUpstream(200);

    const res = await worker.fetch(genReq(VALID), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect((await readBody(res)).text).toBe('note');
    // Dispatched with the resolved personal key.
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['x-api-key']).toBe('sk-resolved-plaintext');
  });

  it('falls back to the org key when no personal key → 200', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u2' } });
    mockDbRows.user = [{ id: 'u2', tenantId: 'org1' }];
    mockDbRows.org_api_keys = [
      { orgId: 'org1', provider: 'anthropic', ciphertext: 'ct', iv: 'iv' },
    ];
    stubUpstream(200);

    const res = await worker.fetch(genReq(VALID), makeEnv(), ctx);
    expect(res.status).toBe(200);
  });

  it('no personal or org key → 402 NO_KEY', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u3' } });
    mockDbRows.user = [{ id: 'u3', tenantId: 'org1' }]; // org has no key either
    stubUpstream(200);

    const res = await worker.fetch(genReq(VALID), makeEnv(), ctx);
    expect(res.status).toBe(402);
    expect((await readBody(res)).code).toBe('NO_KEY');
  });

  it('unknown provider → 400 INVALID_PROVIDER', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    const res = await worker.fetch(genReq({ ...VALID, provider: 'mistral' }), makeEnv(), ctx);
    expect(res.status).toBe(400);
    expect((await readBody(res)).code).toBe('INVALID_PROVIDER');
  });

  it('model outside the provider allowlist → 400 MODEL_NOT_ALLOWED (before key lookup)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    mockDbRows.user_api_keys = [
      { userId: 'u1', provider: 'anthropic', ciphertext: 'ct', iv: 'iv' },
    ];
    const res = await worker.fetch(genReq({ ...VALID, model: 'gpt-4o' }), makeEnv(), ctx);
    expect(res.status).toBe(400);
    expect((await readBody(res)).code).toBe('MODEL_NOT_ALLOWED');
  });

  it('crypto unavailable while decrypting → 503 KEY_ENC_UNAVAILABLE', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    mockDbRows.user_api_keys = [
      { userId: 'u1', provider: 'anthropic', ciphertext: 'ct', iv: 'iv' },
    ];
    vi.mocked(decryptKey).mockRejectedValueOnce(new KeyCryptoError('no master'));
    const res = await worker.fetch(genReq(VALID), makeEnv(), ctx);
    expect(res.status).toBe(503);
    expect((await readBody(res)).code).toBe('KEY_ENC_UNAVAILABLE');
  });
});

describe('user-path error surfacing (ADR-0009)', () => {
  it('provider 401 → KEY_REJECTED surfaced; stored key untouched', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    const row = {
      userId: 'u1',
      provider: 'anthropic',
      ciphertext: 'ct',
      iv: 'iv',
      status: 'verified',
    };
    mockDbRows.user_api_keys = [row];
    stubUpstream(401, { error: 'invalid key' });

    const res = await worker.fetch(genReq(VALID), makeEnv(), ctx);
    expect(res.status).toBe(401);
    expect((await readBody(res)).code).toBe('KEY_REJECTED');
    // Never auto-invalidate: the stored row is unchanged (no write on generate).
    expect(mockDbRows.user_api_keys[0].status).toBe('verified');
  });

  it('provider 429 → PROVIDER_LIMITED surfaced', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    mockDbRows.user_api_keys = [
      { userId: 'u1', provider: 'anthropic', ciphertext: 'ct', iv: 'iv' },
    ];
    stubUpstream(429, { error: 'slow down' });
    const res = await worker.fetch(genReq(VALID), makeEnv(), ctx);
    expect(res.status).toBe(429);
    expect((await readBody(res)).code).toBe('PROVIDER_LIMITED');
  });
});

describe('demo vs prod session gating', () => {
  it('no session + DEMO_MODE=true → shared-key path works (200)', async () => {
    mockGetSession.mockResolvedValue(null);
    stubUpstream(200);
    const gate = await sha256Hex('gate-secret');
    const res = await worker.fetch(
      genReq(VALID, { 'x-ptscribe-key': gate }),
      makeEnv({ DEMO_MODE: 'true' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((await readBody(res)).text).toBe('note');
  });

  it('no session + production (no DEMO_MODE) → 401 SIGNIN_REQUIRED', async () => {
    mockGetSession.mockResolvedValue(null);
    stubUpstream(200);
    const res = await worker.fetch(genReq(VALID), makeEnv(), ctx);
    expect(res.status).toBe(401);
    expect((await readBody(res)).code).toBe('SIGNIN_REQUIRED');
  });
});
