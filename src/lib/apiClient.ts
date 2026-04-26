/**
 * Thin wrapper around `fetch` for our hosted Worker `/api/*` routes. Adds the
 * gate header on every request and surfaces a friendly error for the 401 the
 * Worker returns when the gate code is missing or wrong.
 */

import { getStoredGateCode, clearGateCode } from '@/lib/gate';

const GATE_HEADER = 'x-ptscribe-key';

export class GateRejectedError extends Error {
  constructor() {
    super('Access code rejected by server. Reload the page and re-enter it.');
    this.name = 'GateRejectedError';
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const code = getStoredGateCode();
  const headers = new Headers(init.headers);
  if (code) headers.set(GATE_HEADER, code);

  const res = await fetch(path, { ...init, headers });

  if (res.status === 401) {
    clearGateCode();
    throw new GateRejectedError();
  }
  return res;
}
