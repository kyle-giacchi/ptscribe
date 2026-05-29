// worker/org.ts
//
// Organization backend: creation gate (validate-token, create) plus the ongoing
// management surface (members, invites, roles). All clinical data stays on the
// client — these routes only touch account metadata (org membership + roles).
//
// Security notes:
//  - /api/org/* bypasses handleApi's gate-code guard, so each handler re-checks
//    auth via the BetterAuth session and re-derives the caller's org + role from
//    the DB. Never trust a role supplied by the client.
//  - Mutations that depend on a prior read use TOCTOU-safe conditional updates
//    (an extra WHERE on the value we expect) and inspect numUpdatedRows.
import type { Kysely } from 'kysely';
import { createAuth } from './auth';
import { sendOrgInviteEmail } from './email';
import {
  INVITABLE_ROLES,
  INVITE_TTL_MS,
  canManageMembers,
  isValidEmail,
  normalizeEmail,
  normalizeInviteRole,
  pickAcceptableInvite,
} from './orgLogic';
import { makeDb, type AppDb } from './db';
import { resolveCaller, requireManager } from './caller';
import type { Env } from './index';

// ── DB-backed acceptance ────────────────────────────────────────────────────

export interface ReconcileResult {
  joined: boolean;
  orgId?: string;
  role?: string;
}

/**
 * If `userId` has no org yet and a live invite exists for their email, join them
 * to that org with the invited role and mark the invite accepted. Idempotent and
 * safe to call on every sign-in. Never throws (used inside auth hooks/waitUntil).
 */
export async function reconcileInvite(db: Kysely<AppDb>, userId: string): Promise<ReconcileResult> {
  try {
    const user = await db
      .selectFrom('user')
      .select(['email', 'tenantId'])
      .where('id', '=', userId)
      .executeTakeFirst();

    // Unknown user, or already a member of some org — nothing to do.
    if (!user || user.tenantId) return { joined: false };

    const email = normalizeEmail(user.email);
    const now = Date.now();

    const candidates = await db
      .selectFrom('org_member_invite')
      .select(['id', 'orgId', 'role', 'createdAt', 'expiresAt', 'acceptedAt', 'revokedAt'])
      .where('email', '=', email)
      .execute();

    const invite = pickAcceptableInvite(candidates, now);
    if (!invite) return { joined: false };

    // The org must still exist (it could have been deleted after the invite).
    const org = await db
      .selectFrom('organization')
      .select(['id'])
      .where('id', '=', invite.orgId)
      .executeTakeFirst();
    if (!org) return { joined: false };

    const role = normalizeInviteRole(invite.role);

    // TOCTOU-safe: only join if still unassigned.
    const upd = await db
      .updateTable('user')
      .set({ tenantId: invite.orgId, role })
      .where('id', '=', userId)
      .where('tenantId', 'is', null)
      .executeTakeFirst();

    if ((upd.numUpdatedRows ?? 0n) === 0n) return { joined: false };

    await db
      .updateTable('org_member_invite')
      .set({ acceptedAt: now })
      .where('id', '=', invite.id)
      .execute();

    return { joined: true, orgId: invite.orgId, role };
  } catch (err) {
    // Worker logs go to operator tail only (see worker/email.ts); never throws
    // since this runs inside auth hooks / waitUntil.
    console.error(`[org] reconcileInvite failed: ${(err as Error).message}`);
    return { joined: false };
  }
}

// ── Routing ─────────────────────────────────────────────────────────────────

export async function handleOrgRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
): Promise<Response> {
  const db = makeDb(env);

  // Read-only members view supports GET.
  if (request.method === 'GET') {
    if (pathname === '/api/org/members') return handleListMembers(request, env, ctx, db);
    return orgError('NOT_FOUND', 'Not found', 404);
  }

  if (request.method !== 'POST') {
    return orgError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  switch (pathname) {
    case '/api/org/validate-token':
      return handleValidateToken(request, env, ctx, db);
    case '/api/org/create':
      return handleCreateOrg(request, env, ctx, db);
    case '/api/org/invite':
      return handleInvite(request, env, ctx, db);
    case '/api/org/invite/resend':
      return handleResendInvite(request, env, ctx, db);
    case '/api/org/invite/revoke':
      return handleRevokeInvite(request, env, ctx, db);
    case '/api/org/member/role':
      return handleChangeRole(request, env, ctx, db);
    case '/api/org/member/remove':
      return handleRemoveMember(request, env, ctx, db);
    default:
      return orgError('NOT_FOUND', 'Not found', 404);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────

async function handleValidateToken(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }
  if (!body.token || typeof body.token !== 'string') {
    return orgError('MISSING_FIELDS', 'token is required', 400);
  }

  const row = await db
    .selectFrom('org_invite_token')
    .select(['orgName', 'expiresAt', 'consumedAt'])
    .where('token', '=', body.token)
    .executeTakeFirst();

  if (!row) return orgJson({ valid: false, consumed: false });
  if (row.consumedAt !== null) return orgJson({ valid: false, consumed: true });
  if (row.expiresAt < Date.now()) return orgJson({ valid: false, consumed: false });

  // If the authenticated user is already assigned to an org, surface that.
  // If their tenantId points to a deleted org (orphaned), auto-repair by clearing it.
  const sessionData = await createAuth(env, ctx).api.getSession({ headers: request.headers });
  if (sessionData?.user) {
    const userRow = await db
      .selectFrom('user')
      .select(['tenantId'])
      .where('id', '=', sessionData.user.id)
      .executeTakeFirst();

    if (userRow?.tenantId) {
      const orgRow = await db
        .selectFrom('organization')
        .select(['id'])
        .where('id', '=', userRow.tenantId)
        .executeTakeFirst();

      if (orgRow) {
        return orgJson({ valid: true, consumed: false, alreadyInOrg: true });
      }
      // Orphaned tenantId — org no longer exists; clear it so the user can proceed.
      await db
        .updateTable('user')
        .set({ tenantId: null })
        .where('id', '=', sessionData.user.id)
        .execute();
    }
  }

  return orgJson({ valid: true, consumed: false, orgName: row.orgName ?? undefined });
}

async function handleCreateOrg(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  const auth = createAuth(env, ctx);
  const sessionData = await auth.api.getSession({ headers: request.headers });
  if (!sessionData?.user) return orgError('UNAUTHORIZED', 'Not authenticated', 401);
  const userId = sessionData.user.id;

  let body: {
    token?: string;
    org?: { name?: string; contactEmail?: string; phone?: string };
    invites?: Array<{ email?: string; role?: string }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }

  const { token, org, invites = [] } = body;
  if (!token || !org?.name || !org?.contactEmail || !org?.phone) {
    return orgError('MISSING_FIELDS', 'token, org.name, org.contactEmail, org.phone required', 400);
  }

  const tokenRow = await db
    .selectFrom('org_invite_token')
    .select(['expiresAt', 'consumedAt'])
    .where('token', '=', token)
    .executeTakeFirst();

  if (!tokenRow) return orgError('INVALID_TOKEN', 'Invalid token', 400);
  if (tokenRow.consumedAt !== null) return orgError('TOKEN_CONSUMED', 'Token already used', 400);
  if (tokenRow.expiresAt < Date.now()) return orgError('TOKEN_EXPIRED', 'Token expired', 400);

  const userRow = await db
    .selectFrom('user')
    .select(['tenantId'])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (userRow?.tenantId) return orgError('ALREADY_IN_ORG', 'User already in an org', 409);

  const orgId = crypto.randomUUID();
  const now = Date.now();

  // Create org and assign owner first; consume token last so it remains valid on any failure.
  await db
    .insertInto('organization')
    .values({
      id: orgId,
      name: org.name,
      contactEmail: org.contactEmail,
      phone: org.phone,
      createdAt: now,
    })
    .execute();

  // Conditional update: only succeeds if tenantId is still NULL (guards concurrent submissions).
  const userUpdate = await db
    .updateTable('user')
    .set({ tenantId: orgId, role: 'owner' })
    .where('id', '=', userId)
    .where('tenantId', 'is', null)
    .executeTakeFirst();

  if ((userUpdate.numUpdatedRows ?? 0n) === 0n) {
    // A concurrent request assigned an org between our check and this write — roll back.
    await db.deleteFrom('organization').where('id', '=', orgId).execute();
    return orgError('ALREADY_IN_ORG', 'User already in an org', 409);
  }

  await db
    .updateTable('org_invite_token')
    .set({ consumedAt: now })
    .where('token', '=', token)
    .execute();

  // Persist initial invites as member invites, then email them.
  const seen = new Set<string>();
  for (const inv of invites) {
    if (typeof inv.email !== 'string') continue;
    const email = normalizeEmail(inv.email);
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    const role = normalizeInviteRole(inv.role);
    await db
      .insertInto('org_member_invite')
      .values({
        id: crypto.randomUUID(),
        orgId,
        email,
        role,
        token: crypto.randomUUID(),
        invitedBy: userId,
        createdAt: now,
        expiresAt: now + INVITE_TTL_MS,
        acceptedAt: null,
        revokedAt: null,
      })
      .execute();
    ctx.waitUntil(sendOrgInviteEmail(env, email, org.name, role));
  }

  return orgJson({ ok: true, orgId });
}

async function handleListMembers(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  const caller = await resolveCaller(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  const org = await db
    .selectFrom('organization')
    .select(['id', 'name', 'contactEmail', 'phone'])
    .where('id', '=', caller.orgId)
    .executeTakeFirst();
  if (!org) return orgError('ORG_NOT_FOUND', 'Organization not found', 404);

  const members = await db
    .selectFrom('user')
    .select(['id', 'name', 'email', 'role'])
    .where('tenantId', '=', caller.orgId)
    .execute();

  const invites = await db
    .selectFrom('org_member_invite')
    .select(['id', 'email', 'role', 'createdAt', 'expiresAt'])
    .where('orgId', '=', caller.orgId)
    .where('acceptedAt', 'is', null)
    .where('revokedAt', 'is', null)
    .execute();

  const now = Date.now();
  return orgJson({
    org,
    yourRole: caller.role,
    canManage: canManageMembers(caller.role),
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      isYou: m.id === caller.userId,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      expired: i.expiresAt <= now,
    })),
  });
}

async function handleInvite(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  const caller = await requireManager(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  let body: { email?: string; role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }

  const email = normalizeEmail(body.email ?? '');
  if (!isValidEmail(email)) return orgError('INVALID_EMAIL', 'A valid email is required', 400);
  if (email === normalizeEmail(caller.email)) {
    return orgError('CANNOT_INVITE_SELF', 'You are already a member', 400);
  }
  const role = normalizeInviteRole(body.role);

  // Already a member of this org?
  const existingMember = await db
    .selectFrom('user')
    .select(['id'])
    .where('email', '=', email)
    .where('tenantId', '=', caller.orgId)
    .executeTakeFirst();
  if (existingMember) return orgError('ALREADY_MEMBER', 'That person is already a member', 409);

  const org = await db
    .selectFrom('organization')
    .select(['name'])
    .where('id', '=', caller.orgId)
    .executeTakeFirst();
  if (!org) return orgError('ORG_NOT_FOUND', 'Organization not found', 404);

  const now = Date.now();
  const expiresAt = now + INVITE_TTL_MS;

  // Reuse an existing pending invite for this email+org (re-invite = refresh).
  const pending = await db
    .selectFrom('org_member_invite')
    .select(['id'])
    .where('orgId', '=', caller.orgId)
    .where('email', '=', email)
    .where('acceptedAt', 'is', null)
    .where('revokedAt', 'is', null)
    .executeTakeFirst();

  let inviteId: string;
  if (pending) {
    inviteId = pending.id;
    await db
      .updateTable('org_member_invite')
      .set({ role, expiresAt, invitedBy: caller.userId, createdAt: now })
      .where('id', '=', inviteId)
      .execute();
  } else {
    inviteId = crypto.randomUUID();
    await db
      .insertInto('org_member_invite')
      .values({
        id: inviteId,
        orgId: caller.orgId,
        email,
        role,
        token: crypto.randomUUID(),
        invitedBy: caller.userId,
        createdAt: now,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
      })
      .execute();
  }

  ctx.waitUntil(sendOrgInviteEmail(env, email, org.name, role));
  return orgJson({ ok: true, invite: { id: inviteId, email, role, createdAt: now, expiresAt } });
}

async function handleResendInvite(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  const caller = await requireManager(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  let body: { inviteId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }
  if (!body.inviteId) return orgError('MISSING_FIELDS', 'inviteId is required', 400);

  const invite = await db
    .selectFrom('org_member_invite')
    .select(['id', 'email', 'role'])
    .where('id', '=', body.inviteId)
    .where('orgId', '=', caller.orgId)
    .where('acceptedAt', 'is', null)
    .where('revokedAt', 'is', null)
    .executeTakeFirst();
  if (!invite) return orgError('INVITE_NOT_FOUND', 'No pending invite found', 404);

  const org = await db
    .selectFrom('organization')
    .select(['name'])
    .where('id', '=', caller.orgId)
    .executeTakeFirst();
  if (!org) return orgError('ORG_NOT_FOUND', 'Organization not found', 404);

  const expiresAt = Date.now() + INVITE_TTL_MS;
  await db
    .updateTable('org_member_invite')
    .set({ expiresAt })
    .where('id', '=', invite.id)
    .execute();

  ctx.waitUntil(sendOrgInviteEmail(env, invite.email, org.name, invite.role));
  return orgJson({ ok: true, expiresAt });
}

async function handleRevokeInvite(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  const caller = await requireManager(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  let body: { inviteId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }
  if (!body.inviteId) return orgError('MISSING_FIELDS', 'inviteId is required', 400);

  const res = await db
    .updateTable('org_member_invite')
    .set({ revokedAt: Date.now() })
    .where('id', '=', body.inviteId)
    .where('orgId', '=', caller.orgId)
    .where('acceptedAt', 'is', null)
    .where('revokedAt', 'is', null)
    .executeTakeFirst();

  if ((res.numUpdatedRows ?? 0n) === 0n) {
    return orgError('INVITE_NOT_FOUND', 'No pending invite found', 404);
  }
  return orgJson({ ok: true });
}

async function handleChangeRole(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  const caller = await requireManager(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  let body: { userId?: string; role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }
  if (!body.userId || !body.role)
    return orgError('MISSING_FIELDS', 'userId and role are required', 400);
  if (body.userId === caller.userId)
    return orgError('CANNOT_CHANGE_SELF', 'You cannot change your own role', 400);
  if (!INVITABLE_ROLES.has(body.role)) return orgError('INVALID_ROLE', 'Invalid role', 400);

  // Conditional: target must be in this org and must not be the owner.
  const res = await db
    .updateTable('user')
    .set({ role: body.role })
    .where('id', '=', body.userId)
    .where('tenantId', '=', caller.orgId)
    .where('role', '!=', 'owner')
    .executeTakeFirst();

  if ((res.numUpdatedRows ?? 0n) === 0n) {
    return orgError('MEMBER_NOT_FOUND', 'Member not found, or is the owner', 404);
  }
  return orgJson({ ok: true });
}

async function handleRemoveMember(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  db: Kysely<AppDb>,
): Promise<Response> {
  const caller = await requireManager(request, env, ctx, db);
  if (caller instanceof Response) return caller;

  let body: { userId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }
  if (!body.userId) return orgError('MISSING_FIELDS', 'userId is required', 400);
  if (body.userId === caller.userId)
    return orgError('CANNOT_REMOVE_SELF', 'You cannot remove yourself', 400);

  // Clear org membership; reset to the personal-account default role.
  // Conditional: target must be in this org and must not be the owner.
  const res = await db
    .updateTable('user')
    .set({ tenantId: null, role: 'owner' })
    .where('id', '=', body.userId)
    .where('tenantId', '=', caller.orgId)
    .where('role', '!=', 'owner')
    .executeTakeFirst();

  if ((res.numUpdatedRows ?? 0n) === 0n) {
    return orgError('MEMBER_NOT_FOUND', 'Member not found, or is the owner', 404);
  }
  return orgJson({ ok: true });
}

// ── Response helpers ──────────────────────────────────────────────────────

function orgJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

type OrgErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_JSON'
  | 'MISSING_FIELDS'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_IN_ORG'
  | 'ORG_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'TOKEN_CONSUMED'
  | 'TOKEN_EXPIRED'
  | 'ALREADY_IN_ORG'
  | 'INVALID_EMAIL'
  | 'INVALID_ROLE'
  | 'CANNOT_INVITE_SELF'
  | 'CANNOT_CHANGE_SELF'
  | 'CANNOT_REMOVE_SELF'
  | 'ALREADY_MEMBER'
  | 'INVITE_NOT_FOUND'
  | 'MEMBER_NOT_FOUND';

function orgError(code: OrgErrorCode, error: string, status: number): Response {
  return orgJson({ code, error }, status);
}
