// worker/configLogic.ts
//
// Pure logic for the config-sync endpoints — no DB or auth dependencies, so it
// unit-tests in isolation (jsdom/node) like orgLogic.ts. worker/config.ts uses
// these to validate and reconcile config blobs.

// Hard cap on a single config blob. Settings + clinician profile + a custom
// template/exercise library are small; this is generous but bounds abuse.
export const MAX_CONFIG_BYTES = 512 * 1024; // 512 KB

// Clinical top-level keys that must NEVER appear in a synced config blob. The
// client projection already excludes them; this is defense in depth so a
// tampered client cannot smuggle PHI into D1.
export const FORBIDDEN_TOP_KEYS = ['patients', 'sessions', 'notes', 'plans'] as const;

export interface ParseOk<T> {
  ok: true;
  value: T;
}
export interface ParseErr {
  ok: false;
  code: 'INVALID_JSON' | 'TOO_LARGE' | 'FORBIDDEN_KEY' | 'NOT_OBJECT';
  message: string;
}
export type ParseResult<T> = ParseOk<T> | ParseErr;

/**
 * Parse and validate a raw JSON config string: enforce a byte cap, require a
 * plain object, and reject any forbidden (clinical) top-level key.
 */
export function parseConfigBlob<T = Record<string, unknown>>(
  raw: string,
  maxBytes = MAX_CONFIG_BYTES,
): ParseResult<T> {
  // Byte length (not char length) — multibyte payloads must respect the cap.
  const byteLen = new TextEncoder().encode(raw).length;
  if (byteLen > maxBytes) {
    return { ok: false, code: 'TOO_LARGE', message: `Config exceeds ${maxBytes} bytes` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'INVALID_JSON', message: 'Invalid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, code: 'NOT_OBJECT', message: 'Config must be a JSON object' };
  }

  for (const key of FORBIDDEN_TOP_KEYS) {
    if (key in (parsed as Record<string, unknown>)) {
      return { ok: false, code: 'FORBIDDEN_KEY', message: `Forbidden key: ${key}` };
    }
  }

  return { ok: true, value: parsed as T };
}

/**
 * Last-write-wins decision: apply the incoming write only if its config version
 * is greater than or equal to what's stored. A strictly older version is a
 * stale write (a slow device trying to clobber newer cloud state) and is
 * rejected. Equal versions are allowed (idempotent re-push of the same state).
 */
export function shouldApplyIncoming(
  incomingUpdatedAt: number,
  storedUpdatedAt: number | null | undefined,
): boolean {
  if (storedUpdatedAt == null) return true;
  return incomingUpdatedAt >= storedUpdatedAt;
}

/**
 * Drop any entity flagged builtin:true. The server never stores built-in
 * templates/exercises (they're regenerated locally), even if a client sends
 * them. Non-array input yields an empty array.
 */
export function sanitizeCustomEntities<T extends { builtin?: boolean }>(arr: unknown): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((e): e is T => !!e && typeof e === 'object' && (e as T).builtin !== true);
}
