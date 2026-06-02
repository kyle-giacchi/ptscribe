// worker/keys.ts
//
// BYOK provider-key management API (ADR-0009, issue 04). Session-authenticated
// endpoints to set / verify / remove provider keys and read MASKED status, for
// both personal (userId) and org (orgId) keys.
//
// HARD INVARIANT: raw keys are WRITE-ONLY. No endpoint ever returns the plaintext
// or the ciphertext — reads return only { provider, set, last4, status,
// verifiedAt }. Keys are live-validated against the provider before storage and
// encrypted at rest via keyCrypto (which fails closed if KEY_ENC_MASTER is
// absent). Per ADR-0009 a stored key is NEVER auto-invalidated; only an explicit
// /verify may flip unverified→verified.
//
// Auth mirrors /api/config/*: session-authed, no x-ptscribe gate, no-store. Org
// writes require a manager (requireManager); org GET is any member (so onboarding
// can detect an org key exists).

import { makeDb } from './db';
import { getSessionUserId, resolveCaller, requireManager } from './caller';
import { getProvider, isProviderId, PROVIDER_IDS, type ProviderId } from './providers';
import type { ValidateReason } from './providers';
import { encryptKey, decryptKey, KeyCryptoError, type EncryptedKey } from './keyCrypto';
import type { Env } from './index';

interface KeyRow {
  provider: string;
  ciphertext: string;
  iv: string;
  last4: string;
  status: string;
  verifiedAt: number | null;
}

/** Abstracts the user_api_keys vs org_api_keys table behind one owner-scoped API. */
interface KeyStore {
  get(provider: ProviderId): Promise<KeyRow | undefined>;
  list(): Promise<KeyRow[]>;
  upsert(provider: ProviderId, enc: EncryptedKey, now: number): Promise<void>;
  remove(provider: ProviderId): Promise<void>;
  setVerified(provider: ProviderId, now: number): Promise<void>;
}

const ROW_COLS = ['provider', 'ciphertext', 'iv', 'last4', 'status', 'verifiedAt'] as const;

function userStore(db: ReturnType<typeof makeDb>, userId: string): KeyStore {
  return {
    get: (provider) =>
      db
        .selectFrom('user_api_keys')
        .select(ROW_COLS)
        .where('userId', '=', userId)
        .where('provider', '=', provider)
        .executeTakeFirst(),
    list: () =>
      db.selectFrom('user_api_keys').select(ROW_COLS).where('userId', '=', userId).execute(),
    upsert: async (provider, enc, now) => {
      await db
        .insertInto('user_api_keys')
        .values({
          userId,
          provider,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          last4: enc.last4,
          status: 'verified',
          verifiedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflict((oc) =>
          oc.columns(['userId', 'provider']).doUpdateSet({
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            last4: enc.last4,
            status: 'verified',
            verifiedAt: now,
            updatedAt: now,
          }),
        )
        .execute();
    },
    remove: async (provider) => {
      await db
        .deleteFrom('user_api_keys')
        .where('userId', '=', userId)
        .where('provider', '=', provider)
        .execute();
    },
    setVerified: async (provider, now) => {
      await db
        .updateTable('user_api_keys')
        .set({ status: 'verified', verifiedAt: now, updatedAt: now })
        .where('userId', '=', userId)
        .where('provider', '=', provider)
        .execute();
    },
  };
}

function orgStore(db: ReturnType<typeof makeDb>, orgId: string): KeyStore {
  return {
    get: (provider) =>
      db
        .selectFrom('org_api_keys')
        .select(ROW_COLS)
        .where('orgId', '=', orgId)
        .where('provider', '=', provider)
        .executeTakeFirst(),
    list: () => db.selectFrom('org_api_keys').select(ROW_COLS).where('orgId', '=', orgId).execute(),
    upsert: async (provider, enc, now) => {
      await db
        .insertInto('org_api_keys')
        .values({
          orgId,
          provider,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          last4: enc.last4,
          status: 'verified',
          verifiedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflict((oc) =>
          oc.columns(['orgId', 'provider']).doUpdateSet({
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            last4: enc.last4,
            status: 'verified',
            verifiedAt: now,
            updatedAt: now,
          }),
        )
        .execute();
    },
    remove: async (provider) => {
      await db
        .deleteFrom('org_api_keys')
        .where('orgId', '=', orgId)
        .where('provider', '=', provider)
        .execute();
    },
    setVerified: async (provider, now) => {
      await db
        .updateTable('org_api_keys')
        .set({ status: 'verified', verifiedAt: now, updatedAt: now })
        .where('orgId', '=', orgId)
        .where('provider', '=', provider)
        .execute();
    },
  };
}

// ── Route entry ───────────────────────────────────────────────────────────────

export async function handleKeysRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
): Promise<Response> {
  const db = makeDb(env);

  if (pathname === '/api/keys/user' || pathname === '/api/keys/user/verify') {
    const userId = await getSessionUserId(request, env, ctx);
    if (userId instanceof Response) return userId;
    return dispatch(request, env, pathname.endsWith('/verify'), userStore(db, userId));
  }

  if (pathname === '/api/keys/org' || pathname === '/api/keys/org/verify') {
    // GET is any member (onboarding org-key detection); writes need a manager.
    const caller =
      request.method === 'GET'
        ? await resolveCaller(request, env, ctx, db)
        : await requireManager(request, env, ctx, db);
    if (caller instanceof Response) return caller;
    return dispatch(request, env, pathname.endsWith('/verify'), orgStore(db, caller.orgId));
  }

  return keysError('NOT_FOUND', 'Not found', 404);
}

async function dispatch(
  request: Request,
  env: Env,
  isVerify: boolean,
  store: KeyStore,
): Promise<Response> {
  if (isVerify) {
    if (request.method !== 'POST') return methodNotAllowed();
    return handleVerify(request, env, store);
  }
  if (request.method === 'GET') return handleGet(store);
  if (request.method === 'PUT') return handlePut(request, env, store);
  if (request.method === 'DELETE') return handleDelete(request, store);
  return methodNotAllowed();
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleGet(store: KeyStore): Promise<Response> {
  const rows = await store.list();
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return keysJson({ keys: PROVIDER_IDS.map((p) => maskRow(p, byProvider.get(p))) });
}

async function handlePut(request: Request, env: Env, store: KeyStore): Promise<Response> {
  const body = await parseJson(request);
  if (body instanceof Response) return body;
  const provider = asProvider(body.provider);
  if (!provider) return keysError('INVALID_PROVIDER', 'Unknown or missing provider', 400);
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return keysError('MISSING_FIELDS', 'key (non-empty string) is required', 400);

  const v = await getProvider(provider)!.validateKey(key);
  if (!v.ok) return validationError(v.reason);

  let enc: EncryptedKey;
  try {
    enc = await encryptKey(env, key);
  } catch (err) {
    return cryptoUnavailable(err);
  }

  const now = Date.now();
  await store.upsert(provider, enc, now);
  return keysJson({
    ok: true,
    provider,
    set: true,
    status: 'verified',
    last4: enc.last4,
    verifiedAt: now,
  });
}

async function handleDelete(request: Request, store: KeyStore): Promise<Response> {
  const provider = asProvider(new URL(request.url).searchParams.get('provider'));
  if (!provider) return keysError('INVALID_PROVIDER', 'Unknown or missing provider', 400);
  await store.remove(provider);
  return keysJson({ ok: true, provider, set: false });
}

async function handleVerify(request: Request, env: Env, store: KeyStore): Promise<Response> {
  const body = await parseJson(request);
  if (body instanceof Response) return body;
  const provider = asProvider(body.provider);
  if (!provider) return keysError('INVALID_PROVIDER', 'Unknown or missing provider', 400);

  const row = await store.get(provider);
  if (!row) return keysError('NO_KEY', 'No key set for this provider', 404);

  let plaintext: string;
  try {
    plaintext = await decryptKey(env, row);
  } catch (err) {
    return cryptoUnavailable(err);
  }

  const v = await getProvider(provider)!.validateKey(plaintext);
  // ADR-0009: never auto-invalidate. On failure we report but leave status as-is.
  if (!v.ok) return validationError(v.reason);

  const now = Date.now();
  await store.setVerified(provider, now);
  return keysJson({ ok: true, provider, set: true, status: 'verified', verifiedAt: now });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskRow(provider: ProviderId, row: KeyRow | undefined) {
  if (!row) return { provider, set: false, last4: null, status: 'unset', verifiedAt: null };
  return { provider, set: true, last4: row.last4, status: row.status, verifiedAt: row.verifiedAt };
}

function asProvider(value: unknown): ProviderId | null {
  return isProviderId(value) ? value : null;
}

async function parseJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const v = await request.json();
    if (!v || typeof v !== 'object')
      return keysError('NOT_OBJECT', 'Body must be a JSON object', 400);
    return v as Record<string, unknown>;
  } catch {
    return keysError('INVALID_JSON', 'Invalid JSON body', 400);
  }
}

/** Map a failed live validation to an actionable client error (key is NOT stored). */
function validationError(reason: ValidateReason | undefined): Response {
  switch (reason) {
    case 'rate_limited':
      return keysError(
        'PROVIDER_LIMITED',
        'The provider rate-limited the request; try again shortly',
        429,
      );
    case 'upstream_error':
    case 'network_error':
      return keysError(
        'PROVIDER_UNREACHABLE',
        'Could not reach the provider to validate the key',
        502,
      );
    case 'invalid_key':
    default:
      return keysError('KEY_REJECTED', 'The provider rejected this API key', 400);
  }
}

function cryptoUnavailable(err: unknown): Response {
  if (err instanceof KeyCryptoError) {
    console.error(`[keys] key crypto unavailable: ${err.message}`);
    return keysError('KEY_ENC_UNAVAILABLE', 'Key storage is temporarily unavailable', 503);
  }
  throw err;
}

function methodNotAllowed(): Response {
  return keysError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
}

function keysJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

type KeysErrorCode =
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_JSON'
  | 'NOT_OBJECT'
  | 'MISSING_FIELDS'
  | 'INVALID_PROVIDER'
  | 'KEY_REJECTED'
  | 'PROVIDER_LIMITED'
  | 'PROVIDER_UNREACHABLE'
  | 'KEY_ENC_UNAVAILABLE'
  | 'NO_KEY';

function keysError(code: KeysErrorCode, error: string, status: number): Response {
  return keysJson({ code, error }, status);
}
