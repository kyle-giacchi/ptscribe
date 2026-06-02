/**
 * Thin wrapper around `fetch` for our hosted Worker `/api/*` routes. Adds the
 * gate header on every request and surfaces a friendly error for the 401 the
 * Worker returns when the gate code is missing or wrong.
 */

import { getStoredGateHash, clearGateCode } from '@/lib/gate';

const GATE_HEADER = 'x-ptscribe-key';

export class GateRejectedError extends Error {
  constructor() {
    super('Access code rejected by server. Reload the page and re-enter it.');
    this.name = 'GateRejectedError';
  }
}

export interface ApiFetchOptions {
  /** When true (default), a 401 is treated as a rejected gate code: the stored
   *  code is cleared and {@link GateRejectedError} is thrown. Session-authed
   *  routes (BYOK /api/generate, /api/keys/*) pass `false` so their 401s —
   *  SIGNIN_REQUIRED / KEY_REJECTED — reach the caller intact instead of nuking
   *  the unrelated gate code. */
  interceptGate?: boolean;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  opts: ApiFetchOptions = {},
): Promise<Response> {
  const { interceptGate = true } = opts;
  const hash = getStoredGateHash();
  const headers = new Headers(init.headers);
  if (hash) headers.set(GATE_HEADER, hash);

  // credentials:'include' so the BetterAuth session cookie reaches the Worker —
  // /api/generate is session-first (BYOK), and the gate path no longer carries auth.
  const res = await fetch(path, { credentials: 'include', ...init, headers });

  if (interceptGate && res.status === 401) {
    clearGateCode();
    throw new GateRejectedError();
  }
  return res;
}
