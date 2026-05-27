// worker/caller.ts
//
// Caller-resolution helpers shared by the org and config routes. These re-check
// auth via the BetterAuth session and re-derive the caller's org + role from the
// DB on every request — never trust a role or org id supplied by the client.
//
// `resolveCaller` / `requireManager` require org membership (used by /api/org/*
// and /api/config/org). `getSessionUserId` only requires authentication (used by
// /api/config/user, which a personal-account user without an org can still call).

import type { Kysely } from 'kysely';
import { createAuth } from './auth';
import { canManageMembers } from './orgLogic';
import type { AppDb } from './db';
import type { Env } from './index';

export interface OrgCaller {
  userId: string;
  email: string;
  orgId: string;
  role: string;
}

/** JSON error response shaped like the org/config error payloads. */
function callerError(code: string, error: string, status: number): Response {
  return new Response(JSON.stringify({ code, error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Resolve the authenticated user id, or a Response on failure. Does NOT require
 * org membership — for routes that are meaningful to personal accounts.
 */
export async function getSessionUserId(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<string | Response> {
  const session = await createAuth(env, ctx).api.getSession({ headers: request.headers });
  if (!session?.user) return callerError('UNAUTHORIZED', 'Not authenticated', 401);
  return session.user.id;
}

/**
 * Resolve the authenticated caller and their org membership from the DB.
 * Returns a Response on any failure (so callers can `return` it directly).
 */
export async function resolveCaller(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<OrgCaller | Response> {
  const session = await createAuth(env, ctx).api.getSession({ headers: request.headers });
  if (!session?.user) return callerError('UNAUTHORIZED', 'Not authenticated', 401);

  const row = await db
    .selectFrom('user')
    .select(['email', 'tenantId', 'role'])
    .where('id', '=', session.user.id)
    .executeTakeFirst();

  if (!row?.tenantId) return callerError('NOT_IN_ORG', 'Not a member of any organization', 403);

  return { userId: session.user.id, email: row.email, orgId: row.tenantId, role: row.role };
}

/** Resolve a manager caller, or a Response if unauthorized/forbidden. */
export async function requireManager(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<OrgCaller | Response> {
  const caller = await resolveCaller(request, env, ctx, db);
  if (caller instanceof Response) return caller;
  if (!canManageMembers(caller.role)) {
    return callerError('FORBIDDEN', 'Only owners and admins can manage members', 403);
  }
  return caller;
}
