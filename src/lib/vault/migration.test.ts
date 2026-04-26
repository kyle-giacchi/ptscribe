import { beforeEach, describe, expect, it } from 'vitest';
import { isLikelyEncryptedAudio, migrateLegacyPlaintext } from './migration';
import { vault } from './vault';
import { PASSPHRASE_MIN_CHARS } from './crypto';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { audioRepository } from '@/services/AudioRepository';

beforeEach(async () => {
  localStorage.clear();
  vault.lock();
  await audioRepository.clear().catch(() => {});
});

describe('isLikelyEncryptedAudio', () => {
  it('returns false for a WebM/Matroska header', () => {
    const buf = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    expect(isLikelyEncryptedAudio(buf)).toBe(false);
  });

  it('returns true for arbitrary non-WebM bytes', () => {
    const buf = new Uint8Array([0xab, 0xcd, 0xef, 0x12, 0, 0, 0, 0]);
    expect(isLikelyEncryptedAudio(buf)).toBe(true);
  });

  it('returns true for buffers shorter than the magic prefix', () => {
    expect(isLikelyEncryptedAudio(new Uint8Array([0x1a, 0x45]))).toBe(true);
  });
});

describe('migrateLegacyPlaintext', () => {
  it('encrypts existing plaintext AppData', async () => {
    localStorage.setItem(
      STORAGE_KEYS.appData,
      JSON.stringify({ version: 3, marker: 'plaintext' }),
    );
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const result = await migrateLegacyPlaintext();
    expect(result.migratedAppData).toBe(true);
    const stored = localStorage.getItem(STORAGE_KEYS.appData) ?? '';
    expect(stored).not.toContain('plaintext');
    const env = JSON.parse(stored);
    expect(env.v).toBe(1);
    expect(typeof env.iv).toBe('string');
    expect(typeof env.ciphertext).toBe('string');
  });

  it('skips already-encrypted AppData (envelope shape)', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const env = await vault.encryptUtf8(JSON.stringify({ version: 3 }));
    localStorage.setItem(STORAGE_KEYS.appData, env);
    const result = await migrateLegacyPlaintext();
    expect(result.migratedAppData).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.appData)).toBe(env);
  });

  it('encrypts existing plaintext audio Blobs', async () => {
    const plain = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], {
      type: 'audio/webm',
    });
    await audioRepository.saveRaw('clip-plain', plain);

    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const result = await migrateLegacyPlaintext();
    expect(result.migratedClips).toBeGreaterThanOrEqual(1);

    const reloaded = await audioRepository.load('clip-plain');
    expect(reloaded?.type).toBe('audio/webm');
    expect(new Uint8Array(await (reloaded as Blob).arrayBuffer())[0]).toBe(0x1a);
  });

  it('skips already-encrypted audio Blobs', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const encBlob = await vault.encryptBlob(
      new Blob([new Uint8Array([9, 9, 9])], { type: 'audio/webm' }),
    );
    await audioRepository.saveRaw('clip-enc', encBlob);

    const result = await migrateLegacyPlaintext();
    expect(result.migratedClips).toBe(0);
  });

  it('throws when the vault is locked', async () => {
    await expect(migrateLegacyPlaintext()).rejects.toThrow(/locked/i);
  });
});
