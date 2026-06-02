// worker/keyCrypto.ts
//
// At-rest encryption for BYOK provider keys (ADR-0009). The plaintext provider
// key is NEVER persisted — D1 stores only AES-256-GCM ciphertext + a per-write
// random IV (worker/migrations/0007_byok_keys.sql), plus a non-secret last4 for
// display. This protects against a D1 dump, not against Worker compromise (the
// Worker can always decrypt to make the upstream call) — that trade-off is
// accepted in ADR-0009.
//
// The 256-bit AES key is derived (SHA-256) from the KEY_ENC_MASTER secret held in
// Cloudflare Secrets Store, so the secret can be any high-entropy string. FAIL
// CLOSED: if the binding is missing or the secret can't be read, every operation
// throws KeyCryptoError — there is no plaintext fallback path. Callers turn that
// into a 5xx rather than running unencrypted.

import type { Env } from './index';

export interface EncryptedKey {
  /** base64 AES-256-GCM ciphertext (includes the GCM auth tag). */
  ciphertext: string;
  /** base64 of the 12-byte random IV used for this ciphertext. */
  iv: string;
  /** Last 4 chars of the plaintext key — display only, non-secret. */
  last4: string;
}

/** Thrown when the master key is unavailable. Caller → 5xx (never plaintext). */
export class KeyCryptoError extends Error {
  readonly code = 'MASTER_KEY_UNAVAILABLE' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KeyCryptoError';
  }
}

const IV_BYTES = 12;

async function deriveAesKey(env: Env): Promise<CryptoKey> {
  const binding = env.KEY_ENC_MASTER;
  if (!binding) {
    throw new KeyCryptoError('KEY_ENC_MASTER binding is not configured');
  }
  let secret: string;
  try {
    secret = await binding.get();
  } catch (cause) {
    throw new KeyCryptoError('KEY_ENC_MASTER secret could not be read', { cause });
  }
  if (!secret) {
    throw new KeyCryptoError('KEY_ENC_MASTER secret is empty');
  }
  const material = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptKey(env: Env, plaintext: string): Promise<EncryptedKey> {
  const key = await deriveAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    ciphertext: bytesToBase64(new Uint8Array(buf)),
    iv: bytesToBase64(iv),
    last4: plaintext.slice(-4),
  };
}

export async function decryptKey(
  env: Env,
  enc: Pick<EncryptedKey, 'ciphertext' | 'iv'>,
): Promise<string> {
  const key = await deriveAesKey(env);
  const iv = base64ToBytes(enc.iv);
  const data = base64ToBytes(enc.ciphertext);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(buf);
}

// ── base64 <-> bytes (binary-safe; Workers has btoa/atob) ─────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
