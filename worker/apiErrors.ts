/**
 * Shared retryability table for `{ code }` error responses across index.ts
 * (transcribe/generate) and keys.ts (BYOK key management). The client's
 * retryFetch harness reads this flag to stop retrying deterministic failures
 * (bad config, rejected key, disabled feature) that happen to carry a status
 * code that's normally worth retrying (e.g. 503).
 *
 * Default is non-retryable — only genuinely transient upstream/rate-limit
 * codes are worth another attempt.
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'RATE_LIMITED',
  'UPSTREAM_FAILED',
  'UPSTREAM_TIMEOUT',
  'PROVIDER_LIMITED',
  'PROVIDER_UNREACHABLE',
]);

export function isRetryableCode(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}
