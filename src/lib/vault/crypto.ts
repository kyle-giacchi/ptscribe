export const VAULT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_HASH = 'SHA-256' as const;
export const AES_KEY_BITS = 256;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const PASSPHRASE_MIN_CHARS = 12;

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
  const baseKey = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    {
      name: 'PBKDF2',
      hash: PBKDF2_HASH,
      iterations: PBKDF2_ITERATIONS,
      salt: salt as BufferSource,
    },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey'],
  );
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
