// worker/keyCrypto.test.ts
//
// Unit tests for the BYOK at-rest crypto helper (worker/keyCrypto.ts):
// round-trip fidelity, IV uniqueness, last4 derivation, and fail-closed
// behavior when the KEY_ENC_MASTER binding/secret is unavailable.

import { describe, it, expect } from 'vitest';
import { encryptKey, decryptKey, KeyCryptoError } from './keyCrypto';
import type { Env } from './index';

// Minimal Env fakes — only KEY_ENC_MASTER is exercised here.
function envWithSecret(secret: string): Env {
  return { KEY_ENC_MASTER: { get: async () => secret } } as unknown as Env;
}

const MASTER = 'test-master-key-with-plenty-of-entropy-0123456789';

describe('keyCrypto', () => {
  it('round-trips a plaintext key through encrypt/decrypt', async () => {
    const env = envWithSecret(MASTER);
    const plaintext = 'sk-ant-api03-abcdef1234567890';
    const enc = await encryptKey(env, plaintext);
    expect(await decryptKey(env, enc)).toBe(plaintext);
  });

  it('round-trips unicode and empty-ish values', async () => {
    const env = envWithSecret(MASTER);
    for (const plaintext of ['a', 'kéy-✓-😀-末', 'x'.repeat(500)]) {
      const enc = await encryptKey(env, plaintext);
      expect(await decryptKey(env, enc)).toBe(plaintext);
    }
  });

  it('uses a distinct IV (and ciphertext) for two encrypts of the same input', async () => {
    const env = envWithSecret(MASTER);
    const plaintext = 'sk-ant-api03-samesame';
    const a = await encryptKey(env, plaintext);
    const b = await encryptKey(env, plaintext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    // ...yet both decrypt back to the same plaintext.
    expect(await decryptKey(env, a)).toBe(plaintext);
    expect(await decryptKey(env, b)).toBe(plaintext);
  });

  it('derives last4 from the plaintext tail', async () => {
    const env = envWithSecret(MASTER);
    expect((await encryptKey(env, 'sk-ant-api03-WXYZ')).last4).toBe('WXYZ');
  });

  it('fails to decrypt when the master key differs (GCM auth tag rejects)', async () => {
    const enc = await encryptKey(envWithSecret(MASTER), 'sk-secret');
    await expect(decryptKey(envWithSecret('a-different-master'), enc)).rejects.toThrow();
  });

  it('throws KeyCryptoError when the binding is absent (fail closed)', async () => {
    const env = {} as Env;
    await expect(encryptKey(env, 'sk-secret')).rejects.toBeInstanceOf(KeyCryptoError);
    await expect(decryptKey(env, { ciphertext: 'x', iv: 'y' })).rejects.toBeInstanceOf(
      KeyCryptoError,
    );
  });

  it('throws KeyCryptoError when the secret read throws', async () => {
    const env = {
      KEY_ENC_MASTER: {
        get: async () => {
          throw new Error('secrets store unavailable');
        },
      },
    } as unknown as Env;
    await expect(encryptKey(env, 'sk-secret')).rejects.toBeInstanceOf(KeyCryptoError);
  });

  it('throws KeyCryptoError when the secret is empty', async () => {
    await expect(encryptKey(envWithSecret(''), 'sk-secret')).rejects.toBeInstanceOf(KeyCryptoError);
  });
});
