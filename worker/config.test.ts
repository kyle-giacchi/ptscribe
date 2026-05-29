// worker/config.test.ts
//
// Handler-boundary tests for handleConfigRoute (worker/config.ts).
// Auth is fully mocked; the DB uses the same in-memory D1 fake from org.test.ts
// (reproduced here as a local import-free copy so the two test files are
// self-contained and can run independently).
//
// The D1 fake is intentionally shared-by-copy because test files must be
// self-contained (no cross-test-file imports in vitest).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Auth mock ────────────────────────────────────────────────────────────────
const mockGetSession = vi.fn();
vi.mock('./auth', () => ({
  createAuth: () => ({ api: { getSession: mockGetSession } }),
}));

vi.mock('./email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

import { handleConfigRoute } from './config';
import { makeDb } from './db';
import type { Env } from './index';

// ── In-memory D1 fake (same engine as org.test.ts) ──────────────────────────

type Row = Record<string, unknown>;
type Store = Map<string, Row[]>;

function unquote(s: string): string {
  return s.startsWith('"') ? s.slice(1, -1) : s;
}

function evalCond(col: string, op: string, row: Row, paramIter: Iterator<unknown>): boolean {
  op = op.toLowerCase();
  if (op === 'is null') return row[col] === null || row[col] === undefined;
  if (op === 'is not null') return row[col] !== null && row[col] !== undefined;
  const { value: param } = paramIter.next();
  if (op === '=') {
    if (param === null) return row[col] === null || row[col] === undefined;
    return row[col] === param;
  }
  if (op === '!=' || op === '<>') {
    if (param === null) return row[col] !== null && row[col] !== undefined;
    return row[col] !== param;
  }
  return true;
}

function evalWhere(whereTokens: string[], row: Row, paramIter: Iterator<unknown>): boolean {
  let i = 0;
  while (i < whereTokens.length) {
    if (whereTokens[i].toLowerCase() === 'and') { i++; continue; }
    const col = unquote(whereTokens[i]); i++;
    if (i >= whereTokens.length) break;
    if (whereTokens[i].toLowerCase() === 'is') {
      i++;
      if (whereTokens[i]?.toLowerCase() === 'not') {
        i++; i++;
        if (!evalCond(col, 'is not null', row, paramIter)) return false;
      } else {
        i++;
        if (!evalCond(col, 'is null', row, paramIter)) return false;
      }
      continue;
    }
    const op = whereTokens[i]; i++;
    if (whereTokens[i] === '?') i++;
    if (!evalCond(col, op, row, { next: () => ({ value: paramIter.next().value, done: false }) })) return false;
  }
  return true;
}

function tokenise(sql: string): string[] {
  const tokens: string[] = [];
  const re = /"[^"]*"|[^\s,()]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) tokens.push(m[0]);
  return tokens;
}

interface D1Result {
  results?: Row[];
  meta: { changes: number; last_row_id: number; duration: number };
}

interface D1Statement {
  bind(...args: unknown[]): D1Statement;
  first(): Promise<Row | null>;
  all(): Promise<{ results: Row[]; meta: D1Result['meta'] }>;
  run(): Promise<D1Result>;
  raw(): Promise<unknown[][]>;
}

function makeD1Fake(): { db: D1Database; store: Store } {
  const store: Store = new Map();

  function getTable(name: string): Row[] {
    if (!store.has(name)) store.set(name, []);
    return store.get(name)!;
  }

  function execSql(sql: string, params: unknown[]): D1Result {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();
    const tokens = tokenise(trimmed);
    let ti = 0;
    const nextTok = () => tokens[ti++] ?? '';

    if (upper.startsWith('SELECT')) {
      ti++;
      const cols: string[] = [];
      while (ti < tokens.length && tokens[ti].toLowerCase() !== 'from') {
        cols.push(unquote(tokens[ti])); ti++;
      }
      ti++;
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);
      let filtered = rows;
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++;
        const whereTokens = tokens.slice(ti);
        filtered = rows.filter(row => evalWhere([...whereTokens], row, params[Symbol.iterator]() as Iterator<unknown>));
      }
      const hasAll = cols.includes('*');
      const results: Row[] = filtered.map(row => {
        if (hasAll) return { ...row };
        const out: Row = {};
        for (const c of cols) out[c] = row[c];
        return out;
      });
      return { results, meta: { changes: 0, last_row_id: 0, duration: 0 } };
    }

    if (upper.startsWith('INSERT INTO')) {
      ti++; ti++;
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);
      const colNames: string[] = [];
      while (ti < tokens.length && tokens[ti].toLowerCase() !== 'values' && tokens[ti].toLowerCase() !== 'on') {
        colNames.push(unquote(tokens[ti])); ti++;
      }
      let isUpsert = false;
      if (tokens[ti]?.toLowerCase() === 'values') ti++;
      const insertParams = params.slice(0, colNames.length);
      const restLower = tokens.slice(ti).map(t => t.toLowerCase()).join(' ');
      if (restLower.includes('on conflict')) isUpsert = true;

      const newRow: Row = {};
      for (let i = 0; i < colNames.length; i++) newRow[colNames[i]] = insertParams[i];

      if (isUpsert) {
        let conflictCol = colNames[0];
        for (let j = ti; j < tokens.length; j++) {
          if (tokens[j].toLowerCase() === 'conflict' && j + 1 < tokens.length) {
            conflictCol = unquote(tokens[j + 1]);
            break;
          }
        }
        const existingIdx = rows.findIndex(r => r[conflictCol] === newRow[conflictCol]);
        if (existingIdx >= 0) {
          const upsertParams = params.slice(colNames.length);
          const updated = { ...rows[existingIdx] };
          let inSet = false;
          let upsertParamIdx = 0;
          for (let j = ti; j < tokens.length; j++) {
            if (tokens[j].toLowerCase() === 'set') { inSet = true; continue; }
            if (inSet && j + 2 < tokens.length && tokens[j + 1] === '=' && tokens[j + 2] === '?') {
              updated[unquote(tokens[j])] = upsertParams[upsertParamIdx++];
              j += 2;
            }
          }
          rows[existingIdx] = updated;
          return { meta: { changes: 1, last_row_id: 0, duration: 0 } };
        } else {
          rows.push(newRow);
          return { meta: { changes: 1, last_row_id: rows.length, duration: 0 } };
        }
      } else {
        rows.push(newRow);
        return { meta: { changes: 1, last_row_id: rows.length, duration: 0 } };
      }
    }

    if (upper.startsWith('UPDATE')) {
      ti++;
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);
      ti++;
      const setAssignments: string[] = [];
      while (ti < tokens.length && tokens[ti].toLowerCase() !== 'where') {
        const tok = tokens[ti];
        if (tok !== '=' && tok !== '?') setAssignments.push(unquote(tok));
        ti++;
      }
      const setParamCount = setAssignments.length;
      const setParams = params.slice(0, setParamCount);
      const whereParams = params.slice(setParamCount);
      let changes = 0;
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++;
        const whereTokens = tokens.slice(ti);
        for (const row of rows) {
          if (evalWhere([...whereTokens], row, whereParams[Symbol.iterator]() as Iterator<unknown>)) {
            for (let i = 0; i < setAssignments.length; i++) row[setAssignments[i]] = setParams[i];
            changes++;
          }
        }
      } else {
        for (const row of rows) {
          for (let i = 0; i < setAssignments.length; i++) row[setAssignments[i]] = setParams[i];
          changes++;
        }
      }
      return { meta: { changes, last_row_id: 0, duration: 0 } };
    }

    if (upper.startsWith('DELETE FROM')) {
      ti++; ti++;
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++;
        const whereTokens = tokens.slice(ti);
        const before = rows.length;
        const kept = rows.filter(row => !evalWhere([...whereTokens], row, params[Symbol.iterator]() as Iterator<unknown>));
        store.set(tableName, kept);
        return { meta: { changes: before - kept.length, last_row_id: 0, duration: 0 } };
      }
      const changes = rows.length;
      store.set(tableName, []);
      return { meta: { changes, last_row_id: 0, duration: 0 } };
    }

    return { meta: { changes: 0, last_row_id: 0, duration: 0 } };
  }

  function makeStatement(sql: string, boundParams: unknown[] = []): D1Statement {
    const stmt: D1Statement = {
      bind(...args: unknown[]): D1Statement { return makeStatement(sql, [...boundParams, ...args]); },
      async first(): Promise<Row | null> { return execSql(sql, boundParams).results?.[0] ?? null; },
      async all(): Promise<{ results: Row[]; meta: D1Result['meta'] }> {
        const res = execSql(sql, boundParams);
        return { results: res.results ?? [], meta: res.meta };
      },
      async run(): Promise<D1Result> { return execSql(sql, boundParams); },
      async raw(): Promise<unknown[][]> {
        return (execSql(sql, boundParams).results ?? []).map(r => Object.values(r));
      },
    };
    return stmt;
  }

  const d1 = {
    prepare(sql: string): D1Statement { return makeStatement(sql); },
    async batch(statements: D1Statement[]): Promise<D1Result[]> {
      return Promise.all(statements.map(s => s.run()));
    },
    async exec(sql: string): Promise<D1Result> { return execSql(sql, []); },
    async dump(): Promise<ArrayBuffer> { return new ArrayBuffer(0); },
  } as unknown as D1Database;

  return { db: d1, store };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    AUTH_SECRET: 'test-secret',
    AUTH_BASE_URL: 'https://ptscribe.app',
    AI: {} as Ai,
    ASSETS: {} as Fetcher,
    ANTHROPIC_API_KEY: 'sk-test',
    PTSCRIBE_GATE: 'test',
  } as unknown as Env;
}

const ctx = {
  waitUntil: vi.fn((p: Promise<unknown>) => p),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

async function json(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

function makeGetReq(pathname: string): Request {
  return new Request(`https://ptscribe.app${pathname}`, { method: 'GET' });
}

function makePutReq(pathname: string, body: unknown): Request {
  return new Request(`https://ptscribe.app${pathname}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function seedUser(db: ReturnType<typeof makeDb>, row: {
  id: string; email: string; tenantId?: string | null; role?: string;
}) {
  return db.insertInto('user').values({
    id: row.id,
    name: 'Test User',
    email: row.email,
    emailVerified: 1,
    image: null,
    planTier: 'personal-free',
    tenantId: row.tenantId ?? null,
    role: row.role ?? 'owner',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).execute();
}

function seedOrg(db: ReturnType<typeof makeDb>, row: { id: string; name?: string }) {
  return db.insertInto('organization').values({
    id: row.id,
    name: row.name ?? 'Test Org',
    contactEmail: 'admin@testorg.com',
    phone: '555-0100',
    createdAt: Date.now(),
  }).execute();
}

// ── user GET tests ───────────────────────────────────────────────────────────

describe('GET /api/config/user', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedUser(db, { id: 'u1', email: 'u@test.com' });
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('unauth → 401', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await handleConfigRoute(makeGetReq('/api/config/user'), env, ctx, '/api/config/user');
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('UNAUTHORIZED');
  });

  it('no stored row → { config: null }', async () => {
    const res = await handleConfigRoute(makeGetReq('/api/config/user'), env, ctx, '/api/config/user');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ config: null });
  });

  it('row present → returns parsed blob with templates/exercises defaulting to []', async () => {
    await db.insertInto('user_config').values({
      userId: 'u1',
      settings: '{"theme":"dark"}',
      clinician: '{"name":"Alice"}',
      templates: '[]',
      exercises: '[]',
      updatedAt: 1000,
    }).execute();
    const res = await handleConfigRoute(makeGetReq('/api/config/user'), env, ctx, '/api/config/user');
    expect(res.status).toBe(200);
    const body = await json(res);
    const cfg = body.config as Record<string, unknown>;
    expect(cfg.settings).toEqual({ theme: 'dark' });
    expect(cfg.clinician).toEqual({ name: 'Alice' });
    expect(cfg.templates).toEqual([]);
    expect(cfg.exercises).toEqual([]);
    expect(cfg.updatedAt).toBe(1000);
  });
});

// ── user PUT tests ───────────────────────────────────────────────────────────

describe('PUT /api/config/user', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedUser(db, { id: 'u1', email: 'u@test.com' });
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('unauth → 401', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await handleConfigRoute(makePutReq('/api/config/user', { updatedAt: 1000 }), env, ctx, '/api/config/user');
    expect(res.status).toBe(401);
  });

  it('missing updatedAt → 400 MISSING_FIELDS', async () => {
    const res = await handleConfigRoute(makePutReq('/api/config/user', { settings: {} }), env, ctx, '/api/config/user');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('MISSING_FIELDS');
  });

  it('non-finite updatedAt → 400 MISSING_FIELDS', async () => {
    const res = await handleConfigRoute(makePutReq('/api/config/user', { updatedAt: 'not-a-number' }), env, ctx, '/api/config/user');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('MISSING_FIELDS');
  });

  it('invalid JSON body → 400 INVALID_JSON', async () => {
    const req = new Request('https://ptscribe.app/api/config/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    const res = await handleConfigRoute(req, env, ctx, '/api/config/user');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('INVALID_JSON');
  });

  it('body is not an object (array) → 400 NOT_OBJECT', async () => {
    const req = new Request('https://ptscribe.app/api/config/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '[1,2,3]',
    });
    const res = await handleConfigRoute(req, env, ctx, '/api/config/user');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('NOT_OBJECT');
  });

  it('forbidden clinical key → 400 FORBIDDEN_KEY; no DB write', async () => {
    const res = await handleConfigRoute(makePutReq('/api/config/user', { patients: [], updatedAt: 1000 }), env, ctx, '/api/config/user');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('FORBIDDEN_KEY');
    // DB must not have been written
    const row = await db.selectFrom('user_config').select(['userId']).where('userId', '=', 'u1').executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('oversized body → 413 TOO_LARGE', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(512 * 1024 + 10), updatedAt: 1 });
    const req = new Request('https://ptscribe.app/api/config/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: big,
    });
    const res = await handleConfigRoute(req, env, ctx, '/api/config/user');
    expect(res.status).toBe(413);
    expect((await json(res)).code).toBe('TOO_LARGE');
  });

  it('PUT then GET round-trip', async () => {
    const putRes = await handleConfigRoute(
      makePutReq('/api/config/user', { settings: { theme: 'light' }, clinician: { name: 'Bob' }, updatedAt: 2000 }),
      env, ctx, '/api/config/user',
    );
    expect(putRes.status).toBe(200);
    expect((await json(putRes))).toMatchObject({ ok: true, updatedAt: 2000 });

    const getRes = await handleConfigRoute(makeGetReq('/api/config/user'), env, ctx, '/api/config/user');
    expect(getRes.status).toBe(200);
    const body = await json(getRes);
    const cfg = body.config as Record<string, unknown>;
    expect(cfg.settings).toEqual({ theme: 'light' });
    expect(cfg.clinician).toEqual({ name: 'Bob' });
    expect(cfg.updatedAt).toBe(2000);
  });

  it('LWW reject: existing updatedAt:2000, PUT with updatedAt:1000 → 409 STALE_WRITE', async () => {
    // Seed an existing row with newer updatedAt
    await db.insertInto('user_config').values({
      userId: 'u1', settings: '{}', clinician: '{}', templates: '[]', exercises: '[]', updatedAt: 2000,
    }).execute();
    const res = await handleConfigRoute(makePutReq('/api/config/user', { updatedAt: 1000 }), env, ctx, '/api/config/user');
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('STALE_WRITE');
  });

  it('LWW apply: existing updatedAt:1000, PUT with updatedAt:2000 → applied', async () => {
    await db.insertInto('user_config').values({
      userId: 'u1', settings: '{}', clinician: '{}', templates: '[]', exercises: '[]', updatedAt: 1000,
    }).execute();
    const res = await handleConfigRoute(makePutReq('/api/config/user', { settings: { v: 2 }, updatedAt: 2000 }), env, ctx, '/api/config/user');
    expect(res.status).toBe(200);
    const row = await db.selectFrom('user_config').select(['updatedAt', 'settings']).where('userId', '=', 'u1').executeTakeFirst();
    expect(row?.updatedAt).toBe(2000);
    expect(JSON.parse(row?.settings as string)).toEqual({ v: 2 });
  });

  it('LWW equal updatedAt → applied (idempotent re-push)', async () => {
    await db.insertInto('user_config').values({
      userId: 'u1', settings: '{}', clinician: '{}', templates: '[]', exercises: '[]', updatedAt: 1000,
    }).execute();
    const res = await handleConfigRoute(makePutReq('/api/config/user', { updatedAt: 1000 }), env, ctx, '/api/config/user');
    expect(res.status).toBe(200);
  });

  it('builtin entities are stripped from templates before storage', async () => {
    const body = {
      templates: [
        { id: 'custom', builtin: false, name: 'Custom' },
        { id: 'builtin', builtin: true, name: 'Builtin' },
      ],
      updatedAt: 100,
    };
    await handleConfigRoute(makePutReq('/api/config/user', body), env, ctx, '/api/config/user');
    const row = await db.selectFrom('user_config').select(['templates']).where('userId', '=', 'u1').executeTakeFirst();
    const templates = JSON.parse(row?.templates as string) as Array<{ id: string }>;
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('custom');
  });
});

// ── org GET tests ─────────────────────────────────────────────────────────────

describe('GET /api/config/org', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'owner@test.com', tenantId: 'org1', role: 'owner' });
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('unauth → 401', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await handleConfigRoute(makeGetReq('/api/config/org'), env, ctx, '/api/config/org');
    expect(res.status).toBe(401);
  });

  it('user with no org → 403 NOT_IN_ORG', async () => {
    await seedUser(db, { id: 'u2', email: 'noorg@test.com', tenantId: null });
    mockGetSession.mockResolvedValue({ user: { id: 'u2' } });
    const res = await handleConfigRoute(makeGetReq('/api/config/org'), env, ctx, '/api/config/org');
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('NOT_IN_ORG');
  });

  it('member GET → { config: null, canManage } when no org config row', async () => {
    const res = await handleConfigRoute(makeGetReq('/api/config/org'), env, ctx, '/api/config/org');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.config).toBeNull();
    expect(body.canManage).toBe(true); // owner can manage
  });

  it('non-manager GET → canManage:false', async () => {
    await seedUser(db, { id: 'std', email: 'std@test.com', tenantId: 'org1', role: 'standard' });
    mockGetSession.mockResolvedValue({ user: { id: 'std' } });
    const res = await handleConfigRoute(makeGetReq('/api/config/org'), env, ctx, '/api/config/org');
    expect(res.status).toBe(200);
    expect((await json(res)).canManage).toBe(false);
  });
});

// ── org PUT tests ─────────────────────────────────────────────────────────────

describe('PUT /api/config/org', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'owner1', email: 'owner@test.com', tenantId: 'org1', role: 'owner' });
    mockGetSession.mockResolvedValue({ user: { id: 'owner1' } });
  });

  it('unauth → 401', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await handleConfigRoute(makePutReq('/api/config/org', { updatedAt: 1 }), env, ctx, '/api/config/org');
    expect(res.status).toBe(401);
  });

  it('non-manager member PUT → 403 FORBIDDEN', async () => {
    await seedUser(db, { id: 'std', email: 'std@test.com', tenantId: 'org1', role: 'standard' });
    mockGetSession.mockResolvedValue({ user: { id: 'std' } });
    const res = await handleConfigRoute(makePutReq('/api/config/org', { updatedAt: 1000 }), env, ctx, '/api/config/org');
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('FORBIDDEN');
  });

  it('missing updatedAt → 400 MISSING_FIELDS', async () => {
    const res = await handleConfigRoute(makePutReq('/api/config/org', { policy: {} }), env, ctx, '/api/config/org');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('MISSING_FIELDS');
  });

  it('forbidden key in org config → 400 FORBIDDEN_KEY; no DB write', async () => {
    const res = await handleConfigRoute(makePutReq('/api/config/org', { sessions: [], updatedAt: 1 }), env, ctx, '/api/config/org');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('FORBIDDEN_KEY');
    const row = await db.selectFrom('org_config').select(['orgId']).where('orgId', '=', 'org1').executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('org PUT then GET round-trip', async () => {
    const putRes = await handleConfigRoute(
      makePutReq('/api/config/org', { policy: { requireNotes: true }, updatedAt: 5000 }),
      env, ctx, '/api/config/org',
    );
    expect(putRes.status).toBe(200);
    expect((await json(putRes))).toMatchObject({ ok: true, updatedAt: 5000 });

    const getRes = await handleConfigRoute(makeGetReq('/api/config/org'), env, ctx, '/api/config/org');
    expect(getRes.status).toBe(200);
    const body = await json(getRes);
    const cfg = body.config as Record<string, unknown>;
    expect(cfg.policy).toEqual({ requireNotes: true });
    expect(cfg.updatedAt).toBe(5000);
    expect(body.canManage).toBe(true);
  });

  it('org LWW reject: existing updatedAt:3000, PUT with updatedAt:1000 → 409 STALE_WRITE', async () => {
    await db.insertInto('org_config').values({
      orgId: 'org1', policy: '{}', templates: '[]', exercises: '[]', updatedAt: 3000,
    }).execute();
    const res = await handleConfigRoute(makePutReq('/api/config/org', { updatedAt: 1000 }), env, ctx, '/api/config/org');
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('STALE_WRITE');
  });

  it('org LWW apply: existing updatedAt:1000, PUT with updatedAt:3000 → applied', async () => {
    await db.insertInto('org_config').values({
      orgId: 'org1', policy: '{}', templates: '[]', exercises: '[]', updatedAt: 1000,
    }).execute();
    const res = await handleConfigRoute(
      makePutReq('/api/config/org', { policy: { v: 2 }, updatedAt: 3000 }),
      env, ctx, '/api/config/org',
    );
    expect(res.status).toBe(200);
    const row = await db.selectFrom('org_config').select(['updatedAt', 'policy']).where('orgId', '=', 'org1').executeTakeFirst();
    expect(row?.updatedAt).toBe(3000);
    expect(JSON.parse(row?.policy as string)).toEqual({ v: 2 });
  });
});

// ── method / route guards ─────────────────────────────────────────────────────

describe('config route method/route guards', () => {
  let d1: D1Database;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    env = makeEnv(d1);
    mockGetSession.mockResolvedValue(null);
  });

  it('DELETE /api/config/user → 405 METHOD_NOT_ALLOWED', async () => {
    const req = new Request('https://ptscribe.app/api/config/user', { method: 'DELETE' });
    const res = await handleConfigRoute(req, env, ctx, '/api/config/user');
    expect(res.status).toBe(405);
    expect((await json(res)).code).toBe('METHOD_NOT_ALLOWED');
  });

  it('POST /api/config/user → 405 METHOD_NOT_ALLOWED', async () => {
    const req = new Request('https://ptscribe.app/api/config/user', { method: 'POST' });
    const res = await handleConfigRoute(req, env, ctx, '/api/config/user');
    expect(res.status).toBe(405);
  });

  it('unknown config path → 404 NOT_FOUND', async () => {
    const res = await handleConfigRoute(makeGetReq('/api/config/unknown'), env, ctx, '/api/config/unknown');
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('NOT_FOUND');
  });

  it('DELETE /api/config/org → 405', async () => {
    const req = new Request('https://ptscribe.app/api/config/org', { method: 'DELETE' });
    const res = await handleConfigRoute(req, env, ctx, '/api/config/org');
    expect(res.status).toBe(405);
  });
});
