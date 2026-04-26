/**
 * Thin wrapper around the Screen Wake Lock API. Every helper is
 * null-tolerant and never throws — the recorder treats wake lock as
 * best-effort.
 */

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  if (!isWakeLockSupported()) return null;
  try {
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}

export async function releaseWakeLock(sentinel: WakeLockSentinel | null): Promise<void> {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    /* sentinel may already be released; ignore */
  }
}
