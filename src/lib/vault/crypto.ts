import { argon2id } from 'hash-wasm';

export const VAULT_VERSION = 1;
export const AES_KEY_BITS = 256;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const PASSPHRASE_MIN_CHARS = 12;

// Argon2id parameters. OWASP "moderate" defaults for interactive auth:
// 64 MiB memory, t=3 iterations, p=1 parallelism, 32-byte output.
// Memory dominates cost — far harder to brute-force on GPUs/ASICs than PBKDF2.
export const ARGON2_MEMORY_KIB = 64 * 1024;
export const ARGON2_ITERATIONS = 3;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LENGTH = 32;

const subtle = (): SubtleCrypto => {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('WebCrypto SubtleCrypto is unavailable in this context');
  }
  return c.subtle;
};

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKek(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  // Convert to Uint8Array so we can zero the bytes after KDF.
  // The original string is immutable in JS and cannot be zeroed, but minimizing
  // how long a secondary copy lives in a typed buffer is still worthwhile.
  const passphraseBytes = new TextEncoder().encode(passphrase);
  try {
    const raw = await argon2id({
      password: passphraseBytes,
      salt,
      parallelism: ARGON2_PARALLELISM,
      iterations: ARGON2_ITERATIONS,
      memorySize: ARGON2_MEMORY_KIB,
      hashLength: ARGON2_HASH_LENGTH,
      outputType: 'binary',
    });
    return subtle().importKey(
      'raw',
      raw as BufferSource,
      { name: 'AES-GCM', length: AES_KEY_BITS },
      false,
      ['wrapKey', 'unwrapKey'],
    );
  } finally {
    passphraseBytes.fill(0);
  }
}

export async function generateDek(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: AES_KEY_BITS }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export interface WrappedDek {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<WrappedDek> {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await subtle().wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return { iv, ciphertext: new Uint8Array(wrapped) };
}

export async function unwrapDek(envelope: WrappedDek, kek: CryptoKey): Promise<CryptoKey> {
  return subtle().unwrapKey(
    'raw',
    envelope.ciphertext as BufferSource,
    kek,
    { name: 'AES-GCM', iv: envelope.iv as BufferSource },
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBytes(plaintext: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext,
  );
  const out = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), IV_BYTES);
  return out.buffer;
}

export async function decryptBytes(envelope: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const view = new Uint8Array(envelope);
  if (view.length < IV_BYTES + 1) throw new Error('decryptBytes: envelope too short');
  const iv = view.subarray(0, IV_BYTES);
  const ciphertext = view.subarray(IV_BYTES);
  return subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext);
}
