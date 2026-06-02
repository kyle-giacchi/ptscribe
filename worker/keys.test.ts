// worker/keys.test.ts
//
// Handler-boundary tests for handleKeysRoute (worker/keys.ts). Auth is mocked;
// provider validation is driven by a stubbed global fetch; crypto is REAL (a fake
// KEY_ENC_MASTER secret), so set→store→masked-read exercises the full round-trip.
//
// The in-memory D1 fake is the same engine as config.test.ts, with one fix: the
// upsert matches ALL conflict columns (user_api_keys/org_api_keys have a COMPOSITE
// PK), so two providers for one owner are distinct rows, not a collision.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockGetSession = vi.fn();
vi.mock('./auth', () => ({
  createAuth: () => ({ api: { getSession: mockGetSession } }),
}));
vi.mock('./email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

import { handleKeysRoute } from './keys';
import type { Env } from './index';

// ── In-memory D1 fake (config.test.ts engine + composite-conflict upsert fix) ──

type Row = Record<string, unknown>;
type Store = Map<string, Row[]>;

function unquote(s: string): string {
  return s.startsWith('"') ? s.slice(1, -1) : s;
}
function tokenise(sql: string): string[] {
  const tokens: string[] = [];
  const re = /"[^"]*"|[^\s,()]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) tokens.push(m[0]);
  return tokens;
}
function evalCond(col: string, op: string, row: Row, paramIter: Iterator<unknown>): boolean {
  op = op.toLowerCase();
  if (op === 'is null') return row[col] === null || row[col] === undefined;
  if (op === 'is not null') return row[col] !== null && row[col] !== undefined;
  const { value: param } = paramIter.next();
  if (op === '=') return param === null ? row[col] == null : row[col] === param;
  if (op === '!=' || op === '<>') return param === null ? row[col] != null : row[col] !== param;
  return true;
}
function evalWhere(whereTokens: string[], row: Row, paramIter: Iterator<unknown>): boolean {
  let i = 0;
  while (i < whereTokens.length) {
    if (whereTokens[i].toLowerCase() === 'and') {
      i++;
      continue;
    }
    const col = unquote(whereTokens[i]);
    i++;
    if (i >= whereTokens.length) break;
    const op = whereTokens[i];
    i++;
    if (whereTokens[i] === '?') i++;
    if (!evalCond(col, op, row, paramIter)) return false;
  }
  return true;
}

interface D1Result {
  results?: Row[];
  meta: { changes: number; last_row_id: number; duration: number };
}

function makeD1Fake(): { db: D1Database; store: Store } {
  const store: Store = new Map();
  const getTable = (name: string): Row[] => {
    if (!store.has(name)) store.set(name, []);
    return store.get(name)!;
  };

  function execSql(sql: string, params: unknown[]): D1Result {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();
    const tokens = tokenise(trimmed);
    let ti = 0;
    const nextTok = () => tokens[ti++] ?? '';

    if (upper.startsWith('SELECT')) {
      ti++;
      const cols: string[] = [];
      while (ti < tokens.length && tokens[ti].toLowerCase() !== 'from')
        cols.push(unquote(tokens[ti++]));
      ti++;
      const rows = getTable(unquote(nextTok()));
      let filtered = rows;
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++;
        const whereTokens = tokens.slice(ti);
        filtered = rows.filter((row) =>
          evalWhere([...whereTokens], row, params[Symbol.iterator]() as Iterator<unknown>),
        );
      }
      const hasAll = cols.includes('*');
      const results = filtered.map((row) => {
        if (hasAll) return { ...row };
        const out: Row = {};
        for (const c of cols) out[c] = row[c];
        return out;
      });
      return { results, meta: { changes: 0, last_row_id: 0, duration: 0 } };
    }

    if (upper.startsWith('INSERT INTO')) {
      ti += 2;
      const rows = getTable(unquote(nextTok()));
      const colNames: string[] = [];
      while (ti < tokens.length && !['values', 'on'].includes(tokens[ti].toLowerCase()))
        colNames.push(unquote(tokens[ti++]));
      if (tokens[ti]?.toLowerCase() === 'values') ti++;
      const insertParams = params.slice(0, colNames.length);
      const newRow: Row = {};
      for (let i = 0; i < colNames.length; i++) newRow[colNames[i]] = insertParams[i];

      const restLower = tokens.slice(ti).map((t) => t.toLowerCase());
      if (restLower.includes('conflict')) {
        // Collect ALL conflict columns (composite PK) until DO.
        const conflictCols: string[] = [];
        for (let j = ti; j < tokens.length; j++) {
          if (tokens[j].toLowerCase() === 'conflict') {
            let k = j + 1;
            while (k < tokens.length && tokens[k].toLowerCase() !== 'do')
              conflictCols.push(unquote(tokens[k++]));
            break;
          }
        }
        const idx = rows.findIndex((r) => conflictCols.every((c) => r[c] === newRow[c]));
        if (idx >= 0) {
          const upsertParams = params.slice(colNames.length);
          const updated = { ...rows[idx] };
          let inSet = false;
          let p = 0;
          for (let j = ti; j < tokens.length; j++) {
            if (tokens[j].toLowerCase() === 'set') {
              inSet = true;
              continue;
            }
            if (inSet && tokens[j + 1] === '=' && tokens[j + 2] === '?') {
              updated[unquote(tokens[j])] = upsertParams[p++];
              j += 2;
            }
          }
          rows[idx] = updated;
          return { meta: { changes: 1, last_row_id: 0, duration: 0 } };
        }
      }
      rows.push(newRow);
      return { meta: { changes: 1, last_row_id: rows.length, duration: 0 } };
    }

    if (upper.startsWith('UPDATE')) {
      ti++;
      const rows = getTable(unquote(nextTok()));
      ti++; // SET
      const setCols: string[] = [];
      while (ti < tokens.length && tokens[ti].toLowerCase() !== 'where') {
        const tok = tokens[ti++];
        if (tok !== '=' && tok !== '?') setCols.push(unquote(tok));
      }
      const setParams = params.slice(0, setCols.length);
      const whereParams = params.slice(setCols.length);
      let changes = 0;
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++;
        const whereTokens = tokens.slice(ti);
        for (const row of rows) {
          if (
            evalWhere([...whereTokens], row, whereParams[Symbol.iterator]() as Iterator<unknown>)
          ) {
            for (let i = 0; i < setCols.length; i++) row[setCols[i]] = setParams[i];
            changes++;
          }
        }
      }
      return { meta: { changes, last_row_id: 0, duration: 0 } };
    }

    if (upper.startsWith('DELETE FROM')) {
      ti += 2;
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++;
        const whereTokens = tokens.slice(ti);
        const kept = rows.filter(
          (row) =>
            !evalWhere([...whereTokens], row, params[Symbol.iterator]() as Iterator<unknown>),
        );
        const changes = rows.length - kept.length;
        store.set(tableName, kept);
        return { meta: { changes, last_row_id: 0, duration: 0 } };
      }
      const changes = rows.length;
      store.set(tableName, []);
      return { meta: { changes, last_row_id: 0, duration: 0 } };
    }

    return { meta: { changes: 0, last_row_id: 0, duration: 0 } };
  }

  function makeStatement(sql: string, bound: unknown[] = []) {
    return {
      bind: (...args: unknown[]) => makeStatement(sql, [...bound, ...args]),
      first: async () => execSql(sql, bound).results?.[0] ?? null,
      all: async () => {
        const r = execSql(sql, bound);
        return { results: r.results ?? [], meta: r.meta };
      },
      run: async () => execSql(sql, bound),
      raw: async () => (execSql(sql, bound).results ?? []).map((r) => Object.values(r)),
    };
  }

  const db = {
    prepare: (sql: string) => makeStatement(sql),
    batch: async (stmts: { run: () => Promise<D1Result> }[]) =>
      Promise.all(stmts.map((s) => s.run())),
    exec: async (sql: string) => execSql(sql, []),
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;

  return { db, store };
}

// ── Test harness ──────────────────────────────────────────────────────────────

const ctx = {
  waitUntil: vi.fn((p) => p),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    AUTH_SECRET: 'test-secret',
    KEY_ENC_MASTER: { get: async () => 'unit-test-master-key-high-entropy-0123456789' },
  } as unknown as Env;
}

function stubFetch(status: number) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
}

function keyReq(pathname: string, method: string, body?: unknown): Request {
  return new Request(`https://ptscribe.app${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text());
}

let db: D1Database;
let store: Store;
let env: Env;

beforeEach(() => {
  ({ db, store } = makeD1Fake());
  env = makeEnv(db);
  mockGetSession.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function asUser(id: string) {
  mockGetSession.mockResolvedValue({ user: { id } });
}
function seedUser(row: { id: string; email: string; tenantId: string | null; role: string }) {
  store.set('user', [...(store.get('user') ?? []), row]);
}

// ── User keys ─────────────────────────────────────────────────────────────────

describe('user keys', () => {
  it('rejects an unauthenticated request', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await handleKeysRoute(keyReq('/api/keys/user', 'GET'), env, ctx, '/api/keys/user');
    expect(res.status).toBe(401);
  });

  it('PUT a valid key stores it; masked GET shows verified + last4 (no secrets)', async () => {
    asUser('u1');
    stubFetch(200);
    const put = await handleKeysRoute(
      keyReq('/api/keys/user', 'PUT', { provider: 'anthropic', key: 'sk-ant-secret-WXYZ' }),
      env,
      ctx,
      '/api/keys/user',
    );
    expect(put.status).toBe(200);

    const get = await handleKeysRoute(keyReq('/api/keys/user', 'GET'), env, ctx, '/api/keys/user');
    const { keys } = (await bodyOf(get)) as { keys: Record<string, unknown>[] };
    const anth = keys.find((k) => k.provider === 'anthropic')!;
    expect(anth).toMatchObject({ set: true, last4: 'WXYZ', status: 'verified' });
    // Never expose secrets.
    const serialized = JSON.stringify(keys);
    expect(serialized).not.toContain('ciphertext');
    expect(serialized).not.toContain('sk-ant-secret');
    // And the stored row is ciphertext, not plaintext.
    const row = store.get('user_api_keys')![0];
    expect(row.ciphertext).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain('sk-ant-secret-WXYZ');
  });

  it('PUT an invalid key returns KEY_REJECTED and stores nothing', async () => {
    asUser('u1');
    stubFetch(401);
    const res = await handleKeysRoute(
      keyReq('/api/keys/user', 'PUT', { provider: 'openai', key: 'sk-bad' }),
      env,
      ctx,
      '/api/keys/user',
    );
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('KEY_REJECTED');
    expect(store.get('user_api_keys') ?? []).toHaveLength(0);
  });

  it('stores two providers for one user as distinct rows (composite PK)', async () => {
    asUser('u1');
    stubFetch(200);
    await handleKeysRoute(
      keyReq('/api/keys/user', 'PUT', { provider: 'anthropic', key: 'sk-ant-aaaa' }),
      env,
      ctx,
      '/api/keys/user',
    );
    await handleKeysRoute(
      keyReq('/api/keys/user', 'PUT', { provider: 'openai', key: 'sk-oai-bbbb' }),
      env,
      ctx,
      '/api/keys/user',
    );
    expect(store.get('user_api_keys')!).toHaveLength(2);

    const get = await handleKeysRoute(keyReq('/api/keys/user', 'GET'), env, ctx, '/api/keys/user');
    const { keys } = (await bodyOf(get)) as { keys: Record<string, unknown>[] };
    expect(keys.find((k) => k.provider === 'anthropic')).toMatchObject({
      set: true,
      last4: 'aaaa',
    });
    expect(keys.find((k) => k.provider === 'openai')).toMatchObject({ set: true, last4: 'bbbb' });
    expect(keys.find((k) => k.provider === 'google')).toMatchObject({
      set: false,
      status: 'unset',
    });
  });

  it('DELETE removes the row; GET then shows unset', async () => {
    asUser('u1');
    stubFetch(200);
    await handleKeysRoute(
      keyReq('/api/keys/user', 'PUT', { provider: 'anthropic', key: 'sk-ant-aaaa' }),
      env,
      ctx,
      '/api/keys/user',
    );
    const del = await handleKeysRoute(
      keyReq('/api/keys/user?provider=anthropic', 'DELETE'),
      env,
      ctx,
      '/api/keys/user',
    );
    expect(del.status).toBe(200);
    expect(store.get('user_api_keys')!).toHaveLength(0);

    const get = await handleKeysRoute(keyReq('/api/keys/user', 'GET'), env, ctx, '/api/keys/user');
    const { keys } = (await bodyOf(get)) as { keys: Record<string, unknown>[] };
    expect(keys.find((k) => k.provider === 'anthropic')).toMatchObject({
      set: false,
      status: 'unset',
    });
  });

  it('verify re-validates an existing key; missing key → NO_KEY', async () => {
    asUser('u1');
    stubFetch(200);
    await handleKeysRoute(
      keyReq('/api/keys/user', 'PUT', { provider: 'anthropic', key: 'sk-ant-aaaa' }),
      env,
      ctx,
      '/api/keys/user',
    );
    const ok = await handleKeysRoute(
      keyReq('/api/keys/user/verify', 'POST', { provider: 'anthropic' }),
      env,
      ctx,
      '/api/keys/user/verify',
    );
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).status).toBe('verified');

    const missing = await handleKeysRoute(
      keyReq('/api/keys/user/verify', 'POST', { provider: 'google' }),
      env,
      ctx,
      '/api/keys/user/verify',
    );
    expect(missing.status).toBe(404);
    expect((await bodyOf(missing)).code).toBe('NO_KEY');
  });
});

// ── Org keys ──────────────────────────────────────────────────────────────────

describe('org keys', () => {
  it('manager can PUT an org key; member can read masked status', async () => {
    asUser('mgr');
    seedUser({ id: 'mgr', email: 'm@x.io', tenantId: 'org1', role: 'owner' });
    stubFetch(200);
    const put = await handleKeysRoute(
      keyReq('/api/keys/org', 'PUT', { provider: 'anthropic', key: 'sk-ant-org-ZZZZ' }),
      env,
      ctx,
      '/api/keys/org',
    );
    expect(put.status).toBe(200);
    expect(store.get('org_api_keys')!).toHaveLength(1);

    // A plain member reads masked status (for onboarding org-key detection).
    asUser('mem');
    seedUser({ id: 'mem', email: 'e@x.io', tenantId: 'org1', role: 'member' });
    const get = await handleKeysRoute(keyReq('/api/keys/org', 'GET'), env, ctx, '/api/keys/org');
    expect(get.status).toBe(200);
    const { keys } = (await bodyOf(get)) as { keys: Record<string, unknown>[] };
    expect(keys.find((k) => k.provider === 'anthropic')).toMatchObject({
      set: true,
      last4: 'ZZZZ',
    });
    expect(JSON.stringify(keys)).not.toContain('ciphertext');
  });

  it('a non-manager cannot PUT an org key (403)', async () => {
    asUser('mem');
    seedUser({ id: 'mem', email: 'e@x.io', tenantId: 'org1', role: 'member' });
    stubFetch(200);
    const res = await handleKeysRoute(
      keyReq('/api/keys/org', 'PUT', { provider: 'anthropic', key: 'sk-ant-nope' }),
      env,
      ctx,
      '/api/keys/org',
    );
    expect(res.status).toBe(403);
    expect(store.get('org_api_keys') ?? []).toHaveLength(0);
  });
});
