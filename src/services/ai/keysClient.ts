/**
 * Browser client for the BYOK provider-key management API (ADR-0009, issue 04/05).
 * Talks to the session-authed Worker routes at /api/keys/user. Raw keys are
 * WRITE-ONLY server-side — reads return only masked status. We pass
 * `interceptGate:false` so a 401 (not signed in) surfaces as `signinRequired`
 * instead of clearing the unrelated x-ptscribe gate code.
 */

import { apiFetch } from '@/lib/apiClient';
import type { GenerationProvider } from '@/types';

/** The three BYOK providers — `none` is the manual-only path, never a key owner. */
export type KeyProvider = Exclude<GenerationProvider, 'none'>;

/** Masked, read-only key status for one provider (never the key itself). */
export interface KeyStatus {
  provider: KeyProvider;
  set: boolean;
  last4: string | null;
  status: 'unset' | 'verified' | string;
  verifiedAt: number | null;
}

/** Returned by every mutating call: ok, or an actionable failure reason. */
export type KeyMutationResult =
  | { ok: true; status: KeyStatus }
  | { ok: false; code: string; message: string };

/** GET result: the masked statuses, or a sentinel meaning "sign in first". */
export type KeyListResult = { signinRequired: true } | { signinRequired: false; keys: KeyStatus[] };

const NOT_OK = (res: Response, body: { code?: unknown; error?: unknown }): KeyMutationResult => ({
  ok: false,
  code: typeof body.code === 'string' ? body.code : `HTTP_${res.status}`,
  message: typeof body.error === 'string' ? body.error : 'Request failed',
});

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Fetch the masked status for every provider (or signinRequired on a 401). */
export async function getUserKeys(): Promise<KeyListResult> {
  const res = await apiFetch('/api/keys/user', { method: 'GET' }, { interceptGate: false });
  if (res.status === 401) return { signinRequired: true };
  const body = await readJson(res);
  const keys = Array.isArray(body.keys) ? (body.keys as KeyStatus[]) : [];
  return { signinRequired: false, keys };
}

/**
 * Fetch the org's masked key status (any member may read it — used only as an
 * onboarding hint: "your organization provides a key"). Never returns a key.
 */
export async function getOrgKeys(): Promise<KeyListResult> {
  const res = await apiFetch('/api/keys/org', { method: 'GET' }, { interceptGate: false });
  if (res.status === 401 || res.status === 403) return { signinRequired: true };
  const body = await readJson(res);
  const keys = Array.isArray(body.keys) ? (body.keys as KeyStatus[]) : [];
  return { signinRequired: false, keys };
}

/** Key owner: a clinician's personal keys vs. the org's shared keys. */
export type KeyScope = 'user' | 'org';
const scopeBase = (scope: KeyScope) => (scope === 'org' ? '/api/keys/org' : '/api/keys/user');

/** Live-validate + store a key. The server rejects an invalid key (it is NOT stored). */
async function putKey(
  scope: KeyScope,
  provider: KeyProvider,
  key: string,
): Promise<KeyMutationResult> {
  const res = await apiFetch(
    scopeBase(scope),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key }),
    },
    { interceptGate: false },
  );
  const body = await readJson(res);
  if (!res.ok) return NOT_OK(res, body);
  return { ok: true, status: maskFrom(provider, body) };
}

/** Remove the stored key for a provider. Idempotent — succeeds even if unset. */
async function deleteKey(scope: KeyScope, provider: KeyProvider): Promise<KeyMutationResult> {
  const res = await apiFetch(
    `${scopeBase(scope)}?provider=${encodeURIComponent(provider)}`,
    { method: 'DELETE' },
    { interceptGate: false },
  );
  const body = await readJson(res);
  if (!res.ok) return NOT_OK(res, body);
  return {
    ok: true,
    status: { provider, set: false, last4: null, status: 'unset', verifiedAt: null },
  };
}

/** Re-validate the stored key against the provider. Never auto-invalidates on failure. */
async function verifyKey(scope: KeyScope, provider: KeyProvider): Promise<KeyMutationResult> {
  const res = await apiFetch(
    `${scopeBase(scope)}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    },
    { interceptGate: false },
  );
  const body = await readJson(res);
  if (!res.ok) return NOT_OK(res, body);
  return { ok: true, status: maskFrom(provider, body) };
}

export const putUserKey = (provider: KeyProvider, key: string) => putKey('user', provider, key);
export const deleteUserKey = (provider: KeyProvider) => deleteKey('user', provider);
export const verifyUserKey = (provider: KeyProvider) => verifyKey('user', provider);

export const putOrgKey = (provider: KeyProvider, key: string) => putKey('org', provider, key);
export const deleteOrgKey = (provider: KeyProvider) => deleteKey('org', provider);
export const verifyOrgKey = (provider: KeyProvider) => verifyKey('org', provider);

/** Mutation trio for a scope — lets a shared component (ProviderKeyCard) drive either owner. */
export interface KeyOps {
  put: (provider: KeyProvider, key: string) => Promise<KeyMutationResult>;
  remove: (provider: KeyProvider) => Promise<KeyMutationResult>;
  verify: (provider: KeyProvider) => Promise<KeyMutationResult>;
}

export function keyOps(scope: KeyScope): KeyOps {
  return {
    put: (provider, key) => putKey(scope, provider, key),
    remove: (provider) => deleteKey(scope, provider),
    verify: (provider) => verifyKey(scope, provider),
  };
}

/** Build a KeyStatus from a successful mutation response (set/last4/status/verifiedAt). */
function maskFrom(provider: KeyProvider, body: Record<string, unknown>): KeyStatus {
  return {
    provider,
    set: body.set !== false,
    last4: typeof body.last4 === 'string' ? body.last4 : null,
    status: typeof body.status === 'string' ? body.status : 'verified',
    verifiedAt: typeof body.verifiedAt === 'number' ? body.verifiedAt : null,
  };
}
