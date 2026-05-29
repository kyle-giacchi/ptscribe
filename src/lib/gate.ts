/**
 * Soft gate that blocks the UI behind a 6-digit code. The plaintext lives only
 * in the user's head and (after they enter it) in their localStorage; this
 * module stores a SHA-256 hash so a casual repo grep doesn't surface it.
 *
 * Real protection comes from the Worker's `x-ptscribe-key` header check —
 * the gate here is just to discourage drive-by visitors and provide the
 * value the API client sends as that header.
 */

const GATE_HASH = 'e0bc60c82713f64ef8a57c0c40d02ce24fd0141d5cc3086259c19b1e62a62bea';

const STORAGE_KEY = 'ptnotes.gate';

export async function checkGateCode(code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const hash = await sha256Hex(code);
  return timingSafeEqualHex(hash, GATE_HASH);
}

export function checkStoredGateHash(hash: string): boolean {
  return timingSafeEqualHex(hash, GATE_HASH);
}

export function getStoredGateHash(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && /^[0-9a-f]{64}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function storeGateCode(code: string): Promise<void> {
  try {
    const hash = await sha256Hex(code);
    localStorage.setItem(STORAGE_KEY, hash);
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

/**
 * Unlock the gate without entering the code — writes the known good hash
 * directly. Used by the demo-only "Login as Test User" action, which needs to
 * satisfy both AppGate and the Worker's `x-ptscribe-key` header (the stored
 * hash is the value `apiFetch` sends). Keeps the hash as this module's single
 * source of truth — no plaintext code duplicated at the call site.
 */
export function unlockGateForDemo(): void {
  try {
    localStorage.setItem(STORAGE_KEY, GATE_HASH);
  } catch {
    /* ignore — gate prompts again next reload */
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
