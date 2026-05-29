// worker/org.test.ts
//
// Handler-boundary tests for handleOrgRoute (worker/org.ts) and the
// reconcileInvite helper. Auth is fully mocked; the DB is a hand-rolled
// D1Database-compatible in-memory fake that Kysely's D1Dialect drives directly.
//
// D1 fake design notes:
// - Backed by per-table Maps; rows are plain JS objects.
// - parse() tokenises the compiled SQL to execute SELECT / INSERT / UPDATE /
//   DELETE with WHERE evaluation. The WHERE engine honours:
//     col = ?          equality (null-safe: null = null → true)
//     col != ?         inequality
//     col is null      IS NULL  (no param consumed)
//     col is not null  IS NOT NULL (no param consumed)
// - UPDATE returns { meta: { changes: N, last_row_id: 0 } } where N reflects
//   the actual rows matched by the WHERE, so numUpdatedRows from Kysely's
//   executeTakeFirst() is correct for TOCTOU guards.
// - INSERT … ON CONFLICT … DO UPDATE is recognised as an upsert.
// - The fake does NOT implement JOINs, ORDER BY, GROUP BY, or sub-selects —
//   none of those appear in the handlers under test.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Auth mock (must be hoisted before any import of ./auth) ─────────────────
const mockGetSession = vi.fn();
vi.mock('./auth', () => ({
  createAuth: () => ({ api: { getSession: mockGetSession } }),
}));

// ── Email mock ───────────────────────────────────────────────────────────────
const mockSendOrgInviteEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('./email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgInviteEmail: (...args: unknown[]) => mockSendOrgInviteEmail(...args),
}));

import { handleOrgRoute, reconcileInvite } from './org';
import { makeDb } from './db';
import type { Env } from './index';

// ── In-memory D1 fake ────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Store = Map<string, Row[]>;

/**
 * Tokenise a SQL identifier that may be quoted with double-quotes or bare.
 * Returns the bare name.
 */
function unquote(s: string): string {
  return s.startsWith('"') ? s.slice(1, -1) : s;
}

/**
 * Evaluate a single WHERE condition (col op ?) or (col is null / is not null).
 * `paramIter` is a shared iterator over the positional parameter array so we
 * consume exactly the right param for each `?` placeholder.
 */
function evalCond(col: string, op: string, row: Row, paramIter: Iterator<unknown>): boolean {
  op = op.toLowerCase();
  if (op === 'is null') {
    return row[col] === null || row[col] === undefined;
  }
  if (op === 'is not null') {
    return row[col] !== null && row[col] !== undefined;
  }
  // Parametric operators — consume next param
  const { value: param } = paramIter.next();
  if (op === '=') {
    // null = null → true for our purposes (WHERE tenantId IS NULL uses 'is null',
    // but SET tenantId = ? with null param must still work for normal equality on strings)
    if (param === null) return row[col] === null || row[col] === undefined;
    return row[col] === param;
  }
  if (op === '!=' || op === '<>') {
    if (param === null) return row[col] !== null && row[col] !== undefined;
    return row[col] !== param;
  }
  // Unrecognised op — treat as match-all (safe for our test scenarios)
  return true;
}

/**
 * Parse the WHERE clause tokens and evaluate each AND-separated condition
 * against `row`. Advances `paramIter` for every `?` consumed.
 *
 * Expected token shapes after the WHERE keyword:
 *   "col" = ?
 *   "col" != ?
 *   "col" is null
 *   "col" is not null
 *   and (between conditions)
 */
function evalWhere(whereTokens: string[], row: Row, paramIter: Iterator<unknown>): boolean {
  let i = 0;
  while (i < whereTokens.length) {
    // Skip AND conjunctions
    if (whereTokens[i].toLowerCase() === 'and') {
      i++;
      continue;
    }

    const col = unquote(whereTokens[i]);
    i++;
    if (i >= whereTokens.length) break;

    // Detect IS NULL / IS NOT NULL (next token is 'is')
    if (whereTokens[i].toLowerCase() === 'is') {
      i++;
      if (whereTokens[i]?.toLowerCase() === 'not') {
        i++;
        // expect 'null'
        i++;
        if (!evalCond(col, 'is not null', row, paramIter)) return false;
      } else {
        // expect 'null'
        i++;
        if (!evalCond(col, 'is null', row, paramIter)) return false;
      }
      continue;
    }

    const op = whereTokens[i];
    i++;
    // Skip the ? placeholder token
    if (whereTokens[i] === '?') i++;
    if (!evalCond(col, op, row, { next: () => ({ value: paramIter.next().value, done: false }) }))
      return false;
  }
  return true;
}

/**
 * Split a SQL string into tokens, treating quoted identifiers as single
 * tokens and stripping commas/parentheses that are not part of VALUES.
 */
function tokenise(sql: string): string[] {
  const tokens: string[] = [];
  const re = /"[^"]*"|[^\s,()]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    tokens.push(m[0]);
  }
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
    let ti = 0; // token index
    const nextTok = () => tokens[ti++] ?? '';

    // ── SELECT ───────────────────────────────────────────────────────────────
    if (upper.startsWith('SELECT')) {
      // select <cols> from "table" [where ...]
      // skip SELECT
      ti++; // 'select'
      // collect columns until FROM
      const cols: string[] = [];
      while (ti < tokens.length && tokens[ti].toLowerCase() !== 'from') {
        cols.push(unquote(tokens[ti]));
        ti++;
      }
      ti++; // 'from'
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);

      let filtered = rows;
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++; // 'where'
        const whereTokens = tokens.slice(ti);
        const paramIter = params[Symbol.iterator]() as Iterator<unknown>;
        filtered = rows.filter((row) =>
          evalWhere([...whereTokens], row, params[Symbol.iterator]() as Iterator<unknown>),
        );
        void paramIter; // satisfy linter
      }

      // Project columns (if '*' included, return all)
      const hasAll = cols.includes('*');
      const results: Row[] = filtered.map((row) => {
        if (hasAll) return { ...row };
        const out: Row = {};
        for (const c of cols) out[c] = row[c];
        return out;
      });

      return { results, meta: { changes: 0, last_row_id: 0, duration: 0 } };
    }

    // ── INSERT ───────────────────────────────────────────────────────────────
    if (upper.startsWith('INSERT INTO')) {
      ti++; // 'insert'
      ti++; // 'into'
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);

      // Read column names from the parenthesised list
      // tokens at this point: "col1", "col2", ... (already tokenised without parens)
      // but parentheses ARE stripped by tokenise regex — just collect until VALUES
      const colNames: string[] = [];
      while (
        ti < tokens.length &&
        tokens[ti].toLowerCase() !== 'values' &&
        tokens[ti].toLowerCase() !== 'on'
      ) {
        colNames.push(unquote(tokens[ti]));
        ti++;
      }

      let isUpsert = false;
      const upsertCols: string[] = [];

      if (tokens[ti]?.toLowerCase() === 'values') {
        ti++; // 'values'
      }

      // Collect VALUES params (count is colNames.length)
      const insertParams = params.slice(0, colNames.length);

      // Check for ON CONFLICT … DO UPDATE SET
      // After values we may have: on conflict "col" do update set "c"=?, ...
      const restLower = tokens
        .slice(ti)
        .map((t) => t.toLowerCase())
        .join(' ');
      if (restLower.includes('on conflict')) {
        isUpsert = true;
        // Find 'do update set' and collect the SET columns
        let atSet = false;
        for (let j = ti; j < tokens.length; j++) {
          if (tokens[j].toLowerCase() === 'set') {
            atSet = true;
            continue;
          }
          if (atSet && tokens[j] !== '?' && tokens[j].toLowerCase() !== 'and') {
            // Pattern: "col" = ?
            if (tokens[j + 1] === '=') {
              upsertCols.push(unquote(tokens[j]));
            }
          }
        }
        // upsert SET params come after the VALUES params
        // They're: one per upsertCols entry
      }

      const newRow: Row = {};
      for (let i = 0; i < colNames.length; i++) {
        newRow[colNames[i]] = insertParams[i];
      }

      if (isUpsert) {
        // Determine the conflict column (first col in ON CONFLICT clause)
        // Find it: "on conflict" token, next unquoted token is the conflict col
        let conflictCol = colNames[0]; // fallback
        for (let j = ti; j < tokens.length; j++) {
          if (tokens[j].toLowerCase() === 'conflict' && j + 1 < tokens.length) {
            conflictCol = unquote(tokens[j + 1]);
            break;
          }
        }

        const existingIdx = rows.findIndex((r) => r[conflictCol] === newRow[conflictCol]);
        if (existingIdx >= 0) {
          // DO UPDATE SET: apply only the upsert cols from params
          // Params layout: VALUES params (colNames.length), then DO UPDATE SET params (upsertCols.length)
          const upsertParams = params.slice(colNames.length);
          const updated = { ...rows[existingIdx] };
          // parse actual upsert assignments from DO UPDATE SET section
          let inSet = false;
          let upsertParamIdx = 0;
          for (let j = ti; j < tokens.length; j++) {
            if (tokens[j].toLowerCase() === 'set') {
              inSet = true;
              continue;
            }
            if (inSet && j + 2 < tokens.length && tokens[j + 1] === '=' && tokens[j + 2] === '?') {
              const colName = unquote(tokens[j]);
              updated[colName] = upsertParams[upsertParamIdx++];
              j += 2; // skip = and ?
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

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (upper.startsWith('UPDATE')) {
      ti++; // 'update'
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);
      ti++; // 'set'

      // Collect SET column names only (skip '=' and '?' placeholder tokens).
      // Pattern: "col1" = ? "col2" = ? ... where
      const setAssignments: string[] = [];
      while (ti < tokens.length && tokens[ti].toLowerCase() !== 'where') {
        const tok = tokens[ti];
        if (tok !== '=' && tok !== '?') {
          setAssignments.push(unquote(tok));
        }
        ti++;
      }

      const setParamCount = setAssignments.length;
      const setParams = params.slice(0, setParamCount);
      const whereParams = params.slice(setParamCount);

      let changes = 0;
      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++; // 'where'
        const whereTokens = tokens.slice(ti);
        for (const row of rows) {
          const iter = whereParams[Symbol.iterator]() as Iterator<unknown>;
          if (evalWhere([...whereTokens], row, iter)) {
            for (let i = 0; i < setAssignments.length; i++) {
              row[setAssignments[i]] = setParams[i];
            }
            changes++;
          }
        }
      } else {
        // No WHERE — update all
        for (const row of rows) {
          for (let i = 0; i < setAssignments.length; i++) {
            row[setAssignments[i]] = setParams[i];
          }
          changes++;
        }
      }
      return { meta: { changes, last_row_id: 0, duration: 0 } };
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (upper.startsWith('DELETE FROM')) {
      ti++; // 'delete'
      ti++; // 'from'
      const tableName = unquote(nextTok());
      const rows = getTable(tableName);

      if (tokens[ti]?.toLowerCase() === 'where') {
        ti++; // 'where'
        const whereTokens = tokens.slice(ti);
        const paramIter = params[Symbol.iterator]() as Iterator<unknown>;
        void paramIter;
        const before = rows.length;
        const kept = rows.filter(
          (row) =>
            !evalWhere([...whereTokens], row, params[Symbol.iterator]() as Iterator<unknown>),
        );
        const changes = before - kept.length;
        store.set(tableName, kept);
        return { meta: { changes, last_row_id: 0, duration: 0 } };
      }

      const changes = rows.length;
      store.set(tableName, []);
      return { meta: { changes, last_row_id: 0, duration: 0 } };
    }

    // Unrecognised — no-op
    return { meta: { changes: 0, last_row_id: 0, duration: 0 } };
  }

  function makeStatement(sql: string, boundParams: unknown[] = []): D1Statement {
    const stmt: D1Statement = {
      bind(...args: unknown[]): D1Statement {
        return makeStatement(sql, [...boundParams, ...args]);
      },
      async first(): Promise<Row | null> {
        const res = execSql(sql, boundParams);
        return res.results?.[0] ?? null;
      },
      async all(): Promise<{ results: Row[]; meta: D1Result['meta'] }> {
        const res = execSql(sql, boundParams);
        return { results: res.results ?? [], meta: res.meta };
      },
      async run(): Promise<D1Result> {
        const res = execSql(sql, boundParams);
        return res;
      },
      async raw(): Promise<unknown[][]> {
        const res = execSql(sql, boundParams);
        return (res.results ?? []).map((r) => Object.values(r));
      },
    };
    return stmt;
  }

  const d1 = {
    prepare(sql: string): D1Statement {
      return makeStatement(sql);
    },
    async batch(statements: D1Statement[]): Promise<D1Result[]> {
      const results: D1Result[] = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    },
    async exec(sql: string): Promise<D1Result> {
      return execSql(sql, []);
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;

  return { db: d1, store };
}

// ── Test helpers ─────────────────────────────────────────────────────────────

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

function makeReq(pathname: string, body: unknown, method = 'POST'): Request {
  return new Request(`https://ptscribe.app${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

// Seed helpers — insert rows directly into the fake store via Kysely so the
// fake's insert path is exercised consistently.
function seedUser(
  db: ReturnType<typeof makeDb>,
  row: {
    id: string;
    name?: string;
    email: string;
    tenantId?: string | null;
    role?: string;
  },
) {
  return db
    .insertInto('user')
    .values({
      id: row.id,
      name: row.name ?? 'Test User',
      email: row.email,
      emailVerified: 1,
      image: null,
      planTier: 'personal-free',
      tenantId: row.tenantId ?? null,
      role: row.role ?? 'owner',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .execute();
}

function seedOrg(db: ReturnType<typeof makeDb>, row: { id: string; name?: string }) {
  return db
    .insertInto('organization')
    .values({
      id: row.id,
      name: row.name ?? 'Test Org',
      contactEmail: 'admin@testorg.com',
      phone: '555-0100',
      createdAt: Date.now(),
    })
    .execute();
}

function seedToken(
  db: ReturnType<typeof makeDb>,
  row: {
    token: string;
    orgName?: string;
    expiresAt?: number;
    consumedAt?: number | null;
  },
) {
  return db
    .insertInto('org_invite_token')
    .values({
      token: row.token,
      orgName: row.orgName ?? 'New Org',
      expiresAt: row.expiresAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
      consumedAt: row.consumedAt ?? null,
    })
    .execute();
}

function seedInvite(
  db: ReturnType<typeof makeDb>,
  row: {
    id: string;
    orgId: string;
    email: string;
    role?: string;
    expiresAt?: number;
    acceptedAt?: number | null;
    revokedAt?: number | null;
    invitedBy?: string;
  },
) {
  return db
    .insertInto('org_member_invite')
    .values({
      id: row.id,
      orgId: row.orgId,
      email: row.email,
      role: row.role ?? 'standard',
      token: `tok-${row.id}`,
      invitedBy: row.invitedBy ?? 'owner-id',
      createdAt: Date.now(),
      expiresAt: row.expiresAt ?? Date.now() + 14 * 24 * 60 * 60 * 1000,
      acceptedAt: row.acceptedAt ?? null,
      revokedAt: row.revokedAt ?? null,
    })
    .execute();
}

// ── Tests: handleValidateToken ───────────────────────────────────────────────

describe('handleValidateToken', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    mockGetSession.mockResolvedValue(null);
  });

  it('unknown token → { valid:false, consumed:false }', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/validate-token', { token: 'nope' }),
      env,
      ctx,
      '/api/org/validate-token',
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ valid: false, consumed: false });
  });

  it('consumed token → { valid:false, consumed:true }', async () => {
    await seedToken(db, { token: 'tok1', consumedAt: Date.now() - 1000 });
    const res = await handleOrgRoute(
      makeReq('/api/org/validate-token', { token: 'tok1' }),
      env,
      ctx,
      '/api/org/validate-token',
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ valid: false, consumed: true });
  });

  it('expired token → { valid:false, consumed:false }', async () => {
    await seedToken(db, { token: 'tok-exp', expiresAt: Date.now() - 1 });
    const res = await handleOrgRoute(
      makeReq('/api/org/validate-token', { token: 'tok-exp' }),
      env,
      ctx,
      '/api/org/validate-token',
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ valid: false, consumed: false });
  });

  it('valid token + no session → { valid:true, orgName }', async () => {
    await seedToken(db, { token: 'tok-good', orgName: 'Clinic A' });
    mockGetSession.mockResolvedValue(null);
    const res = await handleOrgRoute(
      makeReq('/api/org/validate-token', { token: 'tok-good' }),
      env,
      ctx,
      '/api/org/validate-token',
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ valid: true, orgName: 'Clinic A' });
  });

  it('valid token + session with existing live org → { valid:true, alreadyInOrg:true }', async () => {
    await seedToken(db, { token: 'tok-good2' });
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: 'org1', role: 'owner' });
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    const res = await handleOrgRoute(
      makeReq('/api/org/validate-token', { token: 'tok-good2' }),
      env,
      ctx,
      '/api/org/validate-token',
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ valid: true, alreadyInOrg: true });
  });

  it('valid token + session whose tenantId points to deleted org → auto-repairs and returns valid:true without alreadyInOrg', async () => {
    await seedToken(db, { token: 'tok-repair' });
    // User has an orphaned tenantId (org doesn't exist in DB)
    await seedUser(db, {
      id: 'u2',
      email: 'u2@test.com',
      tenantId: 'deleted-org-id',
      role: 'owner',
    });
    mockGetSession.mockResolvedValue({ user: { id: 'u2' } });
    const res = await handleOrgRoute(
      makeReq('/api/org/validate-token', { token: 'tok-repair' }),
      env,
      ctx,
      '/api/org/validate-token',
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.valid).toBe(true);
    expect(body.alreadyInOrg).toBeUndefined();
    // Verify tenantId was cleared
    const updated = await db
      .selectFrom('user')
      .select(['tenantId'])
      .where('id', '=', 'u2')
      .executeTakeFirst();
    expect(updated?.tenantId).toBeNull();
  });
});

// ── Tests: handleCreateOrg ───────────────────────────────────────────────────

describe('handleCreateOrg', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    await seedToken(db, { token: 'tok-create' });
    await seedUser(db, { id: 'u1', email: 'owner@test.com', tenantId: null, role: 'owner' });
  });

  const validBody = {
    token: 'tok-create',
    org: { name: 'Test Clinic', contactEmail: 'admin@clinic.com', phone: '555-1234' },
    invites: [],
  };

  it('unauthenticated → 401 UNAUTHORIZED', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await handleOrgRoute(
      makeReq('/api/org/create', validBody),
      env,
      ctx,
      '/api/org/create',
    );
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('UNAUTHORIZED');
  });

  it('missing fields → 400 MISSING_FIELDS', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/create', { token: 'tok-create', org: { name: 'X' } }),
      env,
      ctx,
      '/api/org/create',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('MISSING_FIELDS');
  });

  it('unknown token → 400 INVALID_TOKEN', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/create', { ...validBody, token: 'bad' }),
      env,
      ctx,
      '/api/org/create',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('INVALID_TOKEN');
  });

  it('consumed token → 400 TOKEN_CONSUMED', async () => {
    await seedToken(db, { token: 'tok-consumed', consumedAt: Date.now() - 1 });
    const body = { ...validBody, token: 'tok-consumed' };
    const res = await handleOrgRoute(makeReq('/api/org/create', body), env, ctx, '/api/org/create');
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('TOKEN_CONSUMED');
  });

  it('user already in org → 409 ALREADY_IN_ORG', async () => {
    await seedOrg(db, { id: 'existing-org' });
    await db.updateTable('user').set({ tenantId: 'existing-org' }).where('id', '=', 'u1').execute();
    const res = await handleOrgRoute(
      makeReq('/api/org/create', validBody),
      env,
      ctx,
      '/api/org/create',
    );
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ALREADY_IN_ORG');
  });

  it('happy path → 200 { ok:true, orgId }; token consumed; user is owner', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/create', validBody),
      env,
      ctx,
      '/api/org/create',
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(typeof body.orgId).toBe('string');

    // Token must be consumed
    const tok = await db
      .selectFrom('org_invite_token')
      .select(['consumedAt'])
      .where('token', '=', 'tok-create')
      .executeTakeFirst();
    expect(tok?.consumedAt).not.toBeNull();

    // User must be owner of the new org
    const user = await db
      .selectFrom('user')
      .select(['tenantId', 'role'])
      .where('id', '=', 'u1')
      .executeTakeFirst();
    expect(user?.tenantId).toBe(body.orgId as string);
    expect(user?.role).toBe('owner');
  });

  it('initial invites: persisted + sendOrgInviteEmail queued via ctx.waitUntil', async () => {
    const bodyWithInvites = {
      ...validBody,
      invites: [{ email: 'alice@clinic.com', role: 'admin' }],
    };
    const res = await handleOrgRoute(
      makeReq('/api/org/create', bodyWithInvites),
      env,
      ctx,
      '/api/org/create',
    );
    expect(res.status).toBe(200);
    // Invite row persisted
    const invites = await db.selectFrom('org_member_invite').select(['email', 'role']).execute();
    expect(invites).toHaveLength(1);
    expect(invites[0].email).toBe('alice@clinic.com');
    expect(invites[0].role).toBe('admin');
    // Email queued
    expect(mockSendOrgInviteEmail).toHaveBeenCalledWith(
      env,
      'alice@clinic.com',
      'Test Clinic',
      'admin',
    );
  });

  it('conditional-update rollback: numUpdatedRows=0 → org deleted, 409 ALREADY_IN_ORG', async () => {
    // Simulate a concurrent request that assigns the user to an org between
    // our tenantId check and the conditional update. We do this by seeding
    // the user WITH a tenantId right now, but the handler reads from the DB
    // and checks userRow?.tenantId BEFORE the update — so we seed AFTER that
    // check would have already run (i.e., we replicate the TOCTOU race by
    // manipulating the store between the check and update).
    //
    // Concretely: the handler calls:
    //   1. selectFrom('user').where('id','=',userId) → sees tenantId:null ✓
    //   2. insertInto('organization') → creates org
    //   3. updateTable('user')…where('tenantId','is',null) → conditional update
    //
    // We intercept by patching the fake's store after the org insert but
    // before step 3. The cleanest way without a real concurrent request is
    // to pre-seed the user with a non-null tenantId so the conditional update
    // (WHERE tenantId IS NULL) finds 0 rows and returns changes=0.
    //
    // But the handler first checks userRow?.tenantId and returns early if set.
    // So to exercise the TOCTOU rollback path, we need the initial read to
    // see tenantId=null but the update to fail. We do this by replacing the
    // D1 fake's UPDATE handler to return 0 for user updates ONCE.

    // Build a fake that returns 0 changes on the first user UPDATE
    const { db: d1b } = makeD1Fake();
    const dbB = makeDb({ DB: d1b } as unknown as Env);
    const envB = makeEnv(d1b);

    await seedToken(dbB, { token: 'tok-toctou' });
    await seedUser(dbB, { id: 'u1', email: 'owner@test.com', tenantId: null, role: 'owner' });

    // Monkey-patch prepare to intercept the conditional update on 'user'.
    // kysely-d1 calls: database.prepare(sql).bind(...params).all()
    // The conditional update on the user row (WHERE tenantId IS NULL) is the
    // TOCTOU guard. We simulate a concurrent race by making .all() return
    // { meta: { changes: 0 } } exactly once for that statement.
    const origPrepare = (d1b as unknown as { prepare: (sql: string) => D1Statement }).prepare.bind(
      d1b,
    );
    let patchUsed = false;
    (d1b as unknown as { prepare: (sql: string) => D1Statement }).prepare = function (sql: string) {
      const stmt = origPrepare(sql);
      // Match: update "user" set ... where ... "tenantId" is null
      if (!patchUsed && sql.includes('update "user"') && sql.includes('is null')) {
        patchUsed = true;
        // Wrap: bind() returns a statement whose all() reports 0 changes
        const origBind = stmt.bind.bind(stmt);
        const patchedStmt = {
          ...stmt,
          bind(...args: unknown[]) {
            const bound = origBind(...args);
            return {
              ...bound,
              async all() {
                // Report 0 rows changed — simulates the TOCTOU race condition
                return { results: [], meta: { changes: 0, last_row_id: 0, duration: 0 } };
              },
              async run() {
                return { results: [], meta: { changes: 0, last_row_id: 0, duration: 0 } };
              },
            };
          },
        } as unknown as D1Statement;
        return patchedStmt;
      }
      return stmt;
    };

    const bodyTOCTOU = {
      token: 'tok-toctou',
      org: { name: 'TOCTOU Clinic', contactEmail: 'a@b.com', phone: '555-0000' },
      invites: [],
    };

    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    const res = await handleOrgRoute(
      makeReq('/api/org/create', bodyTOCTOU),
      envB,
      ctx,
      '/api/org/create',
    );
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ALREADY_IN_ORG');

    // Rollback: org row must have been deleted
    const orgs = await dbB.selectFrom('organization').select(['id']).execute();
    expect(orgs).toHaveLength(0);
  });
});

// ── Tests: reconcileInvite ───────────────────────────────────────────────────

describe('reconcileInvite', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
  });

  it('unknown user → { joined:false }', async () => {
    const res = await reconcileInvite(db, 'nonexistent');
    expect(res).toEqual({ joined: false });
  });

  it('user already has tenantId → { joined:false }', async () => {
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: 'org1' });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });

  it('no invite for user email → { joined:false }', async () => {
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: null });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });

  it('invite for wrong email → { joined:false }', async () => {
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: null });
    await seedInvite(db, { id: 'inv1', orgId: 'org1', email: 'other@test.com' });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });

  it('invite is accepted → { joined:false }', async () => {
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: null });
    await seedInvite(db, {
      id: 'inv1',
      orgId: 'org1',
      email: 'u@test.com',
      acceptedAt: Date.now() - 1000,
    });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });

  it('invite is revoked → { joined:false }', async () => {
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: null });
    await seedInvite(db, {
      id: 'inv1',
      orgId: 'org1',
      email: 'u@test.com',
      revokedAt: Date.now() - 1000,
    });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });

  it('invite is expired → { joined:false }', async () => {
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: null });
    await seedInvite(db, {
      id: 'inv1',
      orgId: 'org1',
      email: 'u@test.com',
      expiresAt: Date.now() - 1,
    });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });

  it('invite org no longer exists → { joined:false }', async () => {
    // No org row seeded
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: null });
    await seedInvite(db, { id: 'inv1', orgId: 'org-deleted', email: 'u@test.com' });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });

  it('happy path → joined:true, user tenantId set, invite acceptedAt stamped', async () => {
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: null });
    await seedInvite(db, { id: 'inv1', orgId: 'org1', email: 'u@test.com', role: 'admin' });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toMatchObject({ joined: true, orgId: 'org1', role: 'admin' });

    const user = await db
      .selectFrom('user')
      .select(['tenantId', 'role'])
      .where('id', '=', 'u1')
      .executeTakeFirst();
    expect(user?.tenantId).toBe('org1');
    expect(user?.role).toBe('admin');

    const invite = await db
      .selectFrom('org_member_invite')
      .select(['acceptedAt'])
      .where('id', '=', 'inv1')
      .executeTakeFirst();
    expect(invite?.acceptedAt).not.toBeNull();
  });

  it('idempotent: already a member → joined:false (TOCTOU guard fires)', async () => {
    await seedOrg(db, { id: 'org1' });
    // User already has tenantId
    await seedUser(db, { id: 'u1', email: 'u@test.com', tenantId: 'org1', role: 'admin' });
    await seedInvite(db, { id: 'inv1', orgId: 'org1', email: 'u@test.com' });
    const res = await reconcileInvite(db, 'u1');
    expect(res).toEqual({ joined: false });
  });
});

// ── Tests: handleInvite ──────────────────────────────────────────────────────

describe('handleInvite', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedOrg(db, { id: 'org1', name: 'Clinic 1' });
    await seedUser(db, {
      id: 'owner1',
      email: 'owner@clinic.com',
      tenantId: 'org1',
      role: 'owner',
    });
    mockGetSession.mockResolvedValue({ user: { id: 'owner1' } });
  });

  it('non-manager (role member/standard) → 403 FORBIDDEN', async () => {
    await seedUser(db, {
      id: 'member1',
      email: 'member@clinic.com',
      tenantId: 'org1',
      role: 'standard',
    });
    mockGetSession.mockResolvedValue({ user: { id: 'member1' } });
    const res = await handleOrgRoute(
      makeReq('/api/org/invite', { email: 'new@example.com', role: 'standard' }),
      env,
      ctx,
      '/api/org/invite',
    );
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('FORBIDDEN');
  });

  it('unauthenticated → 401', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await handleOrgRoute(
      makeReq('/api/org/invite', { email: 'a@b.com' }),
      env,
      ctx,
      '/api/org/invite',
    );
    expect(res.status).toBe(401);
  });

  it('inviting self → 400 CANNOT_INVITE_SELF', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/invite', { email: 'owner@clinic.com' }),
      env,
      ctx,
      '/api/org/invite',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('CANNOT_INVITE_SELF');
  });

  it('invalid email → 400 INVALID_EMAIL', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/invite', { email: 'not-an-email' }),
      env,
      ctx,
      '/api/org/invite',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('INVALID_EMAIL');
  });

  it('inviting existing member → 409 ALREADY_MEMBER', async () => {
    await seedUser(db, {
      id: 'existing',
      email: 'existing@clinic.com',
      tenantId: 'org1',
      role: 'standard',
    });
    const res = await handleOrgRoute(
      makeReq('/api/org/invite', { email: 'existing@clinic.com' }),
      env,
      ctx,
      '/api/org/invite',
    );
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ALREADY_MEMBER');
  });

  it('new invite → 200 { ok:true, invite }; email queued', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/invite', { email: 'new@example.com', role: 'admin' }),
      env,
      ctx,
      '/api/org/invite',
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    const inv = body.invite as Record<string, unknown>;
    expect(inv.email).toBe('new@example.com');
    expect(inv.role).toBe('admin');
    expect(mockSendOrgInviteEmail).toHaveBeenCalledWith(
      env,
      'new@example.com',
      'Clinic 1',
      'admin',
    );
  });

  it('re-inviting a pending email refreshes the existing invite (no duplicate)', async () => {
    await seedInvite(db, {
      id: 'inv1',
      orgId: 'org1',
      email: 'pending@example.com',
      role: 'standard',
    });
    const res = await handleOrgRoute(
      makeReq('/api/org/invite', { email: 'pending@example.com', role: 'admin' }),
      env,
      ctx,
      '/api/org/invite',
    );
    expect(res.status).toBe(200);
    const invites = await db.selectFrom('org_member_invite').select(['id', 'role']).execute();
    expect(invites).toHaveLength(1); // no duplicate
    expect(invites[0].role).toBe('admin'); // role refreshed
    expect(invites[0].id).toBe('inv1'); // same row
  });
});

// ── Tests: handleChangeRole ──────────────────────────────────────────────────

describe('handleChangeRole', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, {
      id: 'owner1',
      email: 'owner@clinic.com',
      tenantId: 'org1',
      role: 'owner',
    });
    await seedUser(db, {
      id: 'member1',
      email: 'member@clinic.com',
      tenantId: 'org1',
      role: 'standard',
    });
    mockGetSession.mockResolvedValue({ user: { id: 'owner1' } });
  });

  it('non-manager → 403 FORBIDDEN', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'member1' } });
    const res = await handleOrgRoute(
      makeReq('/api/org/member/role', { userId: 'member1', role: 'admin' }),
      env,
      ctx,
      '/api/org/member/role',
    );
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('FORBIDDEN');
  });

  it('changing own role → 400 CANNOT_CHANGE_SELF', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/member/role', { userId: 'owner1', role: 'admin' }),
      env,
      ctx,
      '/api/org/member/role',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('CANNOT_CHANGE_SELF');
  });

  it('invalid role → 400 INVALID_ROLE', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/member/role', { userId: 'member1', role: 'superuser' }),
      env,
      ctx,
      '/api/org/member/role',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('INVALID_ROLE');
  });

  it('changing role of non-owner member in same org → ok', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/member/role', { userId: 'member1', role: 'admin' }),
      env,
      ctx,
      '/api/org/member/role',
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
    const user = await db
      .selectFrom('user')
      .select(['role'])
      .where('id', '=', 'member1')
      .executeTakeFirst();
    expect(user?.role).toBe('admin');
  });

  it('targeting owner → 404 MEMBER_NOT_FOUND (WHERE role != owner fires)', async () => {
    await seedUser(db, {
      id: 'owner2',
      email: 'owner2@clinic.com',
      tenantId: 'org1',
      role: 'owner',
    });
    const res = await handleOrgRoute(
      makeReq('/api/org/member/role', { userId: 'owner2', role: 'admin' }),
      env,
      ctx,
      '/api/org/member/role',
    );
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('MEMBER_NOT_FOUND');
  });

  it('targeting user outside this org → 404 MEMBER_NOT_FOUND', async () => {
    await seedOrg(db, { id: 'org2' });
    await seedUser(db, {
      id: 'other',
      email: 'other@clinic.com',
      tenantId: 'org2',
      role: 'standard',
    });
    const res = await handleOrgRoute(
      makeReq('/api/org/member/role', { userId: 'other', role: 'admin' }),
      env,
      ctx,
      '/api/org/member/role',
    );
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('MEMBER_NOT_FOUND');
  });
});

// ── Tests: handleRemoveMember ────────────────────────────────────────────────

describe('handleRemoveMember', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, {
      id: 'owner1',
      email: 'owner@clinic.com',
      tenantId: 'org1',
      role: 'owner',
    });
    await seedUser(db, {
      id: 'member1',
      email: 'member@clinic.com',
      tenantId: 'org1',
      role: 'standard',
    });
    mockGetSession.mockResolvedValue({ user: { id: 'owner1' } });
  });

  it('non-manager → 403 FORBIDDEN', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'member1' } });
    const res = await handleOrgRoute(
      makeReq('/api/org/member/remove', { userId: 'member1' }),
      env,
      ctx,
      '/api/org/member/remove',
    );
    expect(res.status).toBe(403);
  });

  it('removing self → 400 CANNOT_REMOVE_SELF', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/member/remove', { userId: 'owner1' }),
      env,
      ctx,
      '/api/org/member/remove',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('CANNOT_REMOVE_SELF');
  });

  it('removing non-owner member → ok, tenantId nulled', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/member/remove', { userId: 'member1' }),
      env,
      ctx,
      '/api/org/member/remove',
    );
    expect(res.status).toBe(200);
    const user = await db
      .selectFrom('user')
      .select(['tenantId'])
      .where('id', '=', 'member1')
      .executeTakeFirst();
    expect(user?.tenantId).toBeNull();
  });

  it('removing the owner → 404 MEMBER_NOT_FOUND (WHERE role != owner fires)', async () => {
    await seedUser(db, {
      id: 'owner2',
      email: 'owner2@clinic.com',
      tenantId: 'org1',
      role: 'owner',
    });
    const res = await handleOrgRoute(
      makeReq('/api/org/member/remove', { userId: 'owner2' }),
      env,
      ctx,
      '/api/org/member/remove',
    );
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('MEMBER_NOT_FOUND');
  });
});

// ── Tests: handleRevokeInvite ────────────────────────────────────────────────

describe('handleRevokeInvite', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedOrg(db, { id: 'org1' });
    await seedUser(db, {
      id: 'owner1',
      email: 'owner@clinic.com',
      tenantId: 'org1',
      role: 'owner',
    });
    await seedInvite(db, { id: 'inv1', orgId: 'org1', email: 'pending@test.com' });
    mockGetSession.mockResolvedValue({ user: { id: 'owner1' } });
  });

  it('manager revoking pending invite → ok', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/invite/revoke', { inviteId: 'inv1' }),
      env,
      ctx,
      '/api/org/invite/revoke',
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
    const invite = await db
      .selectFrom('org_member_invite')
      .select(['revokedAt'])
      .where('id', '=', 'inv1')
      .executeTakeFirst();
    expect(invite?.revokedAt).not.toBeNull();
  });

  it('revoking non-existent invite → 404 (numUpdatedRows=0)', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/invite/revoke', { inviteId: 'does-not-exist' }),
      env,
      ctx,
      '/api/org/invite/revoke',
    );
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('INVITE_NOT_FOUND');
  });

  it('revoking already-accepted invite → 404 (conditional WHERE acceptedAt IS NULL fails)', async () => {
    await seedInvite(db, {
      id: 'inv-accepted',
      orgId: 'org1',
      email: 'accepted@test.com',
      acceptedAt: Date.now() - 1000,
    });
    const res = await handleOrgRoute(
      makeReq('/api/org/invite/revoke', { inviteId: 'inv-accepted' }),
      env,
      ctx,
      '/api/org/invite/revoke',
    );
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('INVITE_NOT_FOUND');
  });

  it('non-manager → 403', async () => {
    await seedUser(db, {
      id: 'member1',
      email: 'member@clinic.com',
      tenantId: 'org1',
      role: 'standard',
    });
    mockGetSession.mockResolvedValue({ user: { id: 'member1' } });
    const res = await handleOrgRoute(
      makeReq('/api/org/invite/revoke', { inviteId: 'inv1' }),
      env,
      ctx,
      '/api/org/invite/revoke',
    );
    expect(res.status).toBe(403);
  });
});

// ── Tests: handleListMembers ─────────────────────────────────────────────────

describe('handleListMembers', () => {
  let d1: D1Database;
  let db: ReturnType<typeof makeDb>;
  let env: Env;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    db = makeDb({ DB: d1 } as unknown as Env);
    env = makeEnv(d1);
    await seedOrg(db, { id: 'org1', name: 'Clinic 1' });
    await seedUser(db, {
      id: 'owner1',
      email: 'owner@clinic.com',
      tenantId: 'org1',
      role: 'owner',
    });
    mockGetSession.mockResolvedValue({ user: { id: 'owner1' } });
  });

  it('unauth → 401', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = new Request('https://ptscribe.app/api/org/members', { method: 'GET' });
    const res = await handleOrgRoute(req, env, ctx, '/api/org/members');
    expect(res.status).toBe(401);
  });

  it('member with no org → 403 NOT_IN_ORG', async () => {
    await seedUser(db, { id: 'noorg', email: 'noorg@test.com', tenantId: null });
    mockGetSession.mockResolvedValue({ user: { id: 'noorg' } });
    const req = new Request('https://ptscribe.app/api/org/members', { method: 'GET' });
    const res = await handleOrgRoute(req, env, ctx, '/api/org/members');
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('NOT_IN_ORG');
  });

  it('member with org → returns members + invites, isYou set for caller', async () => {
    await seedUser(db, {
      id: 'member1',
      email: 'member@clinic.com',
      tenantId: 'org1',
      role: 'standard',
    });
    await seedInvite(db, { id: 'inv1', orgId: 'org1', email: 'pending@test.com' });
    const req = new Request('https://ptscribe.app/api/org/members', { method: 'GET' });
    const res = await handleOrgRoute(req, env, ctx, '/api/org/members');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.yourRole).toBe('owner');
    expect(body.canManage).toBe(true);
    const members = body.members as Array<{ id: string; isYou: boolean }>;
    const me = members.find((m) => m.id === 'owner1');
    expect(me?.isYou).toBe(true);
    const other = members.find((m) => m.id === 'member1');
    expect(other?.isYou).toBe(false);
    const invites = body.invites as Array<{ id: string }>;
    expect(invites).toHaveLength(1);
    expect(invites[0].id).toBe('inv1');
  });

  it('canManage is false for non-manager callers', async () => {
    await seedUser(db, { id: 'std', email: 'std@clinic.com', tenantId: 'org1', role: 'standard' });
    mockGetSession.mockResolvedValue({ user: { id: 'std' } });
    const req = new Request('https://ptscribe.app/api/org/members', { method: 'GET' });
    const res = await handleOrgRoute(req, env, ctx, '/api/org/members');
    expect(res.status).toBe(200);
    expect((await json(res)).canManage).toBe(false);
  });
});

// ── Tests: method/route guards ───────────────────────────────────────────────

describe('method and route guards', () => {
  let d1: D1Database;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ db: d1 } = makeD1Fake());
    env = makeEnv(d1);
  });

  it('PATCH to any path → 405 METHOD_NOT_ALLOWED', async () => {
    const req = new Request('https://ptscribe.app/api/org/invite', { method: 'PATCH' });
    const res = await handleOrgRoute(req, env, ctx, '/api/org/invite');
    expect(res.status).toBe(405);
    expect((await json(res)).code).toBe('METHOD_NOT_ALLOWED');
  });

  it('PUT to any path → 405 METHOD_NOT_ALLOWED', async () => {
    const req = new Request('https://ptscribe.app/api/org/invite', { method: 'PUT' });
    const res = await handleOrgRoute(req, env, ctx, '/api/org/invite');
    expect(res.status).toBe(405);
  });

  it('POST to unknown path → 404 NOT_FOUND', async () => {
    const res = await handleOrgRoute(
      makeReq('/api/org/nonexistent', {}),
      env,
      ctx,
      '/api/org/nonexistent',
    );
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('NOT_FOUND');
  });

  it('GET to non-members path → 404 NOT_FOUND', async () => {
    const req = new Request('https://ptscribe.app/api/org/invite', { method: 'GET' });
    const res = await handleOrgRoute(req, env, ctx, '/api/org/invite');
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('NOT_FOUND');
  });
});
