// worker/config.ts
//
// User + org NON-CLINICAL config sync. Registered users persist their settings,
// clinician profile, and custom templates/exercises here so they follow across
// devices; orgs persist policy + a shared library. Reconciliation is last-write-
// wins at the blob level (see configLogic.shouldApplyIncoming).
//
// HARD BOUNDARY: patient data and audio never reach these routes. parseConfigBlob
// rejects any forbidden top-level key as defense in depth; the client projection
// (src/services/configSync.ts) is the authoritative exclusion point.
//
// Auth: like /api/org/*, these routes are session-authenticated (no x-ptscribe
// gate). User routes need only a session; org routes need org membership, and
// org PUT additionally needs a manager role.

import { makeDb } from './db';
import { getSessionUserId, resolveCaller, requireManager } from './caller';
import {
  MAX_CONFIG_BYTES,
  parseConfigBlob,
  shouldApplyIncoming,
  sanitizeCustomEntities,
} from './configLogic';
import { canManageMembers } from './orgLogic';
import type { Env } from './index';

interface UserConfigBody {
  settings?: unknown;
  clinician?: unknown;
  templates?: unknown;
  exercises?: unknown;
  updatedAt?: unknown;
}

interface OrgConfigBody {
  policy?: unknown;
  templates?: unknown;
  exercises?: unknown;
  updatedAt?: unknown;
}

export async function handleConfigRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
): Promise<Response> {
  const db = makeDb(env);

  if (pathname === '/api/config/user') {
    if (request.method === 'GET') return getUserConfig(request, env, ctx, db);
    if (request.method === 'PUT') return putUserConfig(request, env, ctx, db);
    return cfgError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  if (pathname === '/api/config/org') {
    if (request.method === 'GET') return getOrgConfig(request, env, ctx, db);
    if (request.method === 'PUT') return putOrgConfig(request, env, ctx, db);
    return cfgError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  return cfgError('NOT_FOUND', 'Not found', 404);
}

// ── User config ──────────────────────────────────────────────────────────────

async function getUserConfig(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: ReturnType<typeof makeDb>,
): Promise<Response> {
  const userId = await getSessionUserId(request, env, ctx);
  if (userId instanceof Response) return userId;

  const row = await db
    .selectFrom('user_config')
    .select(['settings', 'clinician', 'templates', 'exercises', 'updatedAt'])
    .where('userId', '=', userId)
    .executeTakeFirst();

  if (!row) return cfgJson({ config: null });

  return cfgJson({
    config: {
      settings: safeJson(row.settings),
      clinician: safeJson(row.clinician),
      templates: safeJson(row.templates) ?? [],
      exercises: safeJson(row.exercises) ?? [],
      updatedAt: row.updatedAt,
    },
  });
}

async function putUserConfig(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: ReturnType<typeof makeDb>,
): Promise<Response> {
  const userId = await getSessionUserId(request, env, ctx);
  if (userId instanceof Response) return userId;

  const raw = await request.text();
  const parsed = parseConfigBlob<UserConfigBody>(raw, MAX_CONFIG_BYTES);
  if (!parsed.ok)
    return cfgError(parsed.code, parsed.message, parsed.code === 'TOO_LARGE' ? 413 : 400);

  const updatedAt = Number(parsed.value.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return cfgError('MISSING_FIELDS', 'updatedAt (number) is required', 400);
  }

  const stored = await db
    .selectFrom('user_config')
    .select(['updatedAt'])
    .where('userId', '=', userId)
    .executeTakeFirst();

  if (!shouldApplyIncoming(updatedAt, stored?.updatedAt)) {
    return cfgError('STALE_WRITE', 'A newer config exists on the server', 409);
  }

  const settings = JSON.stringify(parsed.value.settings ?? {});
  const clinician = JSON.stringify(parsed.value.clinician ?? {});
  const templates = JSON.stringify(sanitizeCustomEntities(parsed.value.templates));
  const exercises = JSON.stringify(sanitizeCustomEntities(parsed.value.exercises));

  await db
    .insertInto('user_config')
    .values({ userId, settings, clinician, templates, exercises, updatedAt })
    .onConflict((oc) =>
      oc.column('userId').doUpdateSet({ settings, clinician, templates, exercises, updatedAt }),
    )
    .execute();

  return cfgJson({ ok: true, updatedAt });
}

// ── Org config ─────────────────────────────────────────────────────────────

async function getOrgConfig(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: ReturnType<typeof makeDb>,
): Promise<Response> {
  const caller = await resolveCaller(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  const row = await db
    .selectFrom('org_config')
    .select(['policy', 'templates', 'exercises', 'updatedAt'])
    .where('orgId', '=', caller.orgId)
    .executeTakeFirst();

  if (!row) return cfgJson({ config: null, canManage: canManageMembers(caller.role) });

  return cfgJson({
    config: {
      policy: safeJson(row.policy) ?? {},
      templates: safeJson(row.templates) ?? [],
      exercises: safeJson(row.exercises) ?? [],
      updatedAt: row.updatedAt,
    },
    canManage: canManageMembers(caller.role),
  });
}

async function putOrgConfig(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: ReturnType<typeof makeDb>,
): Promise<Response> {
  const caller = await requireManager(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  const raw = await request.text();
  const parsed = parseConfigBlob<OrgConfigBody>(raw, MAX_CONFIG_BYTES);
  if (!parsed.ok)
    return cfgError(parsed.code, parsed.message, parsed.code === 'TOO_LARGE' ? 413 : 400);

  const updatedAt = Number(parsed.value.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return cfgError('MISSING_FIELDS', 'updatedAt (number) is required', 400);
  }

  const stored = await db
    .selectFrom('org_config')
    .select(['updatedAt'])
    .where('orgId', '=', caller.orgId)
    .executeTakeFirst();

  if (!shouldApplyIncoming(updatedAt, stored?.updatedAt)) {
    return cfgError('STALE_WRITE', 'A newer config exists on the server', 409);
  }

  const policy = JSON.stringify(parsed.value.policy ?? {});
  const templates = JSON.stringify(sanitizeCustomEntities(parsed.value.templates));
  const exercises = JSON.stringify(sanitizeCustomEntities(parsed.value.exercises));

  await db
    .insertInto('org_config')
    .values({ orgId: caller.orgId, policy, templates, exercises, updatedAt })
    .onConflict((oc) => oc.column('orgId').doUpdateSet({ policy, templates, exercises, updatedAt }))
    .execute();

  return cfgJson({ ok: true, updatedAt });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cfgJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

type CfgErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'INVALID_JSON'
  | 'NOT_OBJECT'
  | 'TOO_LARGE'
  | 'FORBIDDEN_KEY'
  | 'MISSING_FIELDS'
  | 'STALE_WRITE'
  | 'UNAUTHORIZED'
  | 'NOT_IN_ORG'
  | 'FORBIDDEN';

function cfgError(code: CfgErrorCode, error: string, status: number): Response {
  return cfgJson({ code, error }, status);
}
