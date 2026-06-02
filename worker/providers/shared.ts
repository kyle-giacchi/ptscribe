// worker/providers/shared.ts
//
// Helpers shared by the provider adapters. Kept separate from types.ts (types
// only) and index.ts (registry) to avoid import cycles.

import type { ValidateResult } from './types';

/** Live key-validation calls are cheap GETs; keep the timeout short. */
export const VALIDATE_TIMEOUT_MS = 10_000;

/**
 * Compose the final system prompt from the base system + an optional modifier
 * block. Identical across providers (ported from the original handleGenerate).
 */
export function composeSystem(system: string, modifierBlock?: string): string {
  const mb = modifierBlock?.trim();
  return mb ? `${system.trimEnd()}\n\n${mb}` : system.trimEnd();
}

/** Map an HTTP status from a validation probe to a uniform result. */
export function mapValidateStatus(status: number): ValidateResult {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 401 || status === 403) return { ok: false, reason: 'invalid_key' };
  if (status === 429) return { ok: false, reason: 'rate_limited' };
  return { ok: false, reason: 'upstream_error' };
}

/**
 * Run a validation probe (a models-list GET) and map status/errors to a uniform
 * result. Network/timeout failures become `network_error` rather than throwing,
 * so the caller never leaks an exception into the response path.
 */
export async function probeValidate(
  url: string,
  headers: Record<string, string>,
): Promise<ValidateResult> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });
    return mapValidateStatus(res.status);
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}
