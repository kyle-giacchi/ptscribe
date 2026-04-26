/**
 * Soft gate that blocks the UI behind a 6-digit code. The plaintext lives only
 * in the user's head and (after they enter it) in their localStorage; this
 * module stores a SHA-256 hash so a casual repo grep doesn't surface it.
 *
 * Real protection comes from the Worker's `x-ptscribe-key` header check —
 * the gate here is just to discourage drive-by visitors and provide the
 * value the API client sends as that header.
 */

// SHA-256 of "112233". Keep the plaintext OUT of source.
const GATE_HASH = 'e0bc60c82713f64ef8a57c0c40d02ce24fd0141d5cc3086259c19b1e62a62bea';

const STORAGE_KEY = 'ptnotes.gate';

export async function checkGateCode(code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const hash = await sha256Hex(code);
  return timingSafeEqualHex(hash, GATE_HASH);
}

export function getStoredGateCode(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && /^\d{6}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeGateCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore — gate prompts again next reload */
  }
}

export function clearGateCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
