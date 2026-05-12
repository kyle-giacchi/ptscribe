// worker/org.ts
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import { createAuth } from './auth';
import { sendOrgInviteEmail } from './email';
import type { Env } from './index';

const VALID_ROLES = new Set(['admin', 'manager', 'standard', 'student']);

interface OrgDb {
  org_invite_token: {
    token: string;
    orgName: string | null;
    expiresAt: number;
    consumedAt: number | null;
  };
  organization: {
    id: string;
    name: string;
    contactEmail: string;
    phone: string;
    createdAt: number;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: number;
    image: string | null;
    planTier: string;
    tenantId: string | null;
    role: string;
    createdAt: number;
    updatedAt: number;
  };
}

export async function handleOrgRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return orgError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }
  if (pathname === '/api/org/validate-token') {
    return handleValidateToken(request, env);
  }
  if (pathname === '/api/org/create') {
    return handleCreateOrg(request, env, ctx);
  }
  return orgError('NOT_FOUND', 'Not found', 404);
}

async function handleValidateToken(request: Request, env: Env): Promise<Response> {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return orgError('INVALID_JSON', 'Invalid JSON', 400);
  }
  if (!body.token || typeof body.token !== 'string') {
    return orgError('MISSING_FIELDS', 'token is required', 400);
  }

  const db = new Kysely<OrgDb>({ dialect: new D1Dialect({ database: env.DB }) });
  const row = await db
    .selectFrom('org_invite_token')
    .select(['orgName', 'expiresAt', 'consumedAt'])
    .where('token', '=', body.token)
    .executeTakeFirst();

  if (!row) return orgJson({ valid: false, consumed: false });
  if (row.consumedAt !== null) return orgJson({ valid: false, consumed: true });
  if (row.expiresAt < Date.now()) return orgJson({ valid: false, consumed: false });
  return orgJson({ valid: true, consumed: false, orgName: row.orgName ?? undefined });
}

async function handleCreateOrg(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
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

  const db = new Kysely<OrgDb>({ dialect: new D1Dialect({ database: env.DB }) });

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
    .values({ id: orgId, name: org.name, contactEmail: org.contactEmail, phone: org.phone, createdAt: now })
    .execute();

  await db
    .updateTable('user')
    .set({ tenantId: orgId, role: 'owner' })
    .where('id', '=', userId)
    .execute();

  await db
    .updateTable('org_invite_token')
    .set({ consumedAt: now })
    .where('token', '=', token)
    .execute();

  const validInvites = (invites as Array<{ email?: string; role?: string }>).filter(
    (inv): inv is { email: string; role?: string } =>
      typeof inv.email === 'string' && inv.email.length > 0,
  );
  for (const inv of validInvites) {
    const role = VALID_ROLES.has(inv.role ?? '') ? inv.role! : 'standard';
    ctx.waitUntil(sendOrgInviteEmail(env, inv.email, org.name, role));
  }

  return orgJson({ ok: true, orgId });
}

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
  | 'INVALID_TOKEN'
  | 'TOKEN_CONSUMED'
  | 'TOKEN_EXPIRED'
  | 'ALREADY_IN_ORG';

function orgError(code: OrgErrorCode, error: string, status: number): Response {
  return orgJson({ code, error }, status);
}
