import { describe, it, expect } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  IV_BYTES,
  SALT_BYTES,
  bytesToBase64,
  base64ToBytes,
  randomBytes,
  deriveKek,
  generateDek,
  wrapDek,
  unwrapDek,
  encryptBytes,
  decryptBytes,
} from './crypto';

describe('base64 round-trip', () => {
  it('encodes and decodes arbitrary bytes', () => {
    const input = new Uint8Array([0, 1, 2, 250, 251, 252]);
    const encoded = bytesToBase64(input);
    const decoded = base64ToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(input));
  });

  it('handles empty input', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0))).length).toBe(0);
  });
});

describe('randomBytes', () => {
  it('returns the requested length', () => {
    expect(randomBytes(IV_BYTES).length).toBe(IV_BYTES);
    expect(randomBytes(SALT_BYTES).length).toBe(SALT_BYTES);
  });

  it('returns different bytes on successive calls', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('PBKDF2 derivation', () => {
  it('uses 600k iterations and is deterministic for the same passphrase + salt', async () => {
    const salt = new Uint8Array(SALT_BYTES);
    const k1 = await deriveKek('correct horse battery staple', salt);
    const k2 = await deriveKek('correct horse battery staple', salt);
    const dek = await generateDek();
    const w1 = await wrapDek(dek, k1);
    const dek2 = await unwrapDek(w1, k2);
    const probe = new TextEncoder().encode('probe');
    const enc = await encryptBytes(probe.buffer, dek);
    const dec = await decryptBytes(enc, dek2);
    expect(new TextDecoder().decode(dec)).toBe('probe');
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('different passphrase or salt yields a key that fails to unwrap', async () => {
    const salt1 = new Uint8Array(SALT_BYTES);
    const salt2 = new Uint8Array(SALT_BYTES);
    salt2[0] = 1;
    const kekA = await deriveKek('alpha', salt1);
    const kekB = await deriveKek('beta', salt1);
    const kekC = await deriveKek('alpha', salt2);
    const dek = await generateDek();
    const wrapped = await wrapDek(dek, kekA);
    await expect(unwrapDek(wrapped, kekB)).rejects.toThrow();
    await expect(unwrapDek(wrapped, kekC)).rejects.toThrow();
  });
});

describe('AES-GCM round-trip', () => {
  it('encrypts and decrypts arbitrary bytes', async () => {
    const dek = await generateDek();
    const message = new TextEncoder().encode('hello, vault');
    const enc = await encryptBytes(message.buffer, dek);
    expect(enc.byteLength).toBeGreaterThan(message.byteLength);
    const dec = await decryptBytes(enc, dek);
    expect(new TextDecoder().decode(dec)).toBe('hello, vault');
  });

  it('rejects tampered ciphertext', async () => {
    const dek = await generateDek();
    const enc = await encryptBytes(new TextEncoder().encode('payload').buffer, dek);
    const tampered = new Uint8Array(enc);
    tampered[tampered.length - 1] ^= 0x01;
    await expect(decryptBytes(tampered.buffer, dek)).rejects.toThrow();
  });

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const dek = await generateDek();
    const m = new TextEncoder().encode('same').buffer;
    const a = new Uint8Array(await encryptBytes(m, dek));
    const b = new Uint8Array(await encryptBytes(m, dek));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});
