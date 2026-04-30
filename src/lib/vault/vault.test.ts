import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vault } from './vault';
import { PASSPHRASE_MIN_CHARS } from './crypto';
import { STORAGE_KEYS } from '@/lib/storageKeys';

beforeEach(() => {
  localStorage.clear();
  vault.lock();
});

afterEach(() => {
  vault.lock();
});

describe('vault.isInitialized', () => {
  it('is false when no envelope is stored', () => {
    expect(vault.isInitialized()).toBe(false);
  });
});

describe('vault.setup', () => {
  it('rejects passphrases under the minimum length', async () => {
    await expect(vault.setup('short')).rejects.toThrow(/passphrase/i);
    expect(localStorage.getItem(STORAGE_KEYS.vault)).toBeNull();
  });

  it('writes a wrapped-key envelope and unlocks the vault', async () => {
    const passphrase = 'a'.repeat(PASSPHRASE_MIN_CHARS);
    await vault.setup(passphrase);
    expect(vault.isInitialized()).toBe(true);
    expect(vault.isUnlocked()).toBe(true);
    const env = JSON.parse(localStorage.getItem(STORAGE_KEYS.vault) ?? 'null');
    expect(env.v).toBe(1);
    expect(env.kdf.name).toBe('Argon2id');
    expect(env.kdf.memoryKib).toBeGreaterThanOrEqual(64 * 1024);
    expect(env.kdf.iterations).toBeGreaterThanOrEqual(3);
    expect(env.kdf.parallelism).toBeGreaterThanOrEqual(1);
    expect(typeof env.kdf.salt).toBe('string');
    expect(typeof env.wrappedDek.iv).toBe('string');
    expect(typeof env.wrappedDek.ciphertext).toBe('string');
  });

  it('refuses to setup if already initialized', async () => {
    const passphrase = 'a'.repeat(PASSPHRASE_MIN_CHARS);
    await vault.setup(passphrase);
    vault.lock();
    await expect(vault.setup(passphrase)).rejects.toThrow(/already/i);
  });
});

describe('vault.unlock', () => {
  it('returns ok with the right passphrase', async () => {
    const passphrase = 'a'.repeat(PASSPHRASE_MIN_CHARS);
    await vault.setup(passphrase);
    vault.lock();
    const result = await vault.unlock(passphrase);
    expect(result.ok).toBe(true);
    expect(vault.isUnlocked()).toBe(true);
  });

  it('returns bad_passphrase with the wrong passphrase', async () => {
    const passphrase = 'a'.repeat(PASSPHRASE_MIN_CHARS);
    await vault.setup(passphrase);
    vault.lock();
    const result = await vault.unlock('b'.repeat(PASSPHRASE_MIN_CHARS));
    expect(result).toEqual({ ok: false, reason: 'bad_passphrase' });
    expect(vault.isUnlocked()).toBe(false);
  });

  it('returns corrupt when the envelope is malformed', async () => {
    localStorage.setItem(STORAGE_KEYS.vault, '{not json');
    const result = await vault.unlock('whatever123');
    expect(result).toEqual({ ok: false, reason: 'corrupt' });
  });
});

describe('vault.encryptUtf8 / decryptUtf8', () => {
  it('round-trips a JSON string', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const json = JSON.stringify({ hello: 'world', n: 1 });
    const env = await vault.encryptUtf8(json);
    expect(env).not.toContain('hello');
    const back = await vault.decryptUtf8(env);
    expect(back).toBe(json);
  });

  it('throws when the vault is locked', async () => {
    await expect(vault.encryptUtf8('x')).rejects.toThrow(/locked/i);
  });
});

describe('vault.encryptBlob / decryptBlob', () => {
  it('round-trips a Blob and preserves MIME', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const original = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const enc = await vault.encryptBlob(original);
    expect(enc.type).toBe('application/octet-stream');
    expect(enc.size).toBeGreaterThan(original.size);
    const dec = await vault.decryptBlob(enc, 'audio/webm');
    expect(dec.type).toBe('audio/webm');
    expect(new Uint8Array(await dec.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});

describe('vault.lock', () => {
  it('clears the in-memory key', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    expect(vault.isUnlocked()).toBe(true);
    vault.lock();
    expect(vault.isUnlocked()).toBe(false);
  });
});

describe('vault.changePassphrase', () => {
  const OLD = 'a'.repeat(PASSPHRASE_MIN_CHARS);
  const NEW = 'b'.repeat(PASSPHRASE_MIN_CHARS);

  it('returns locked when vault is not unlocked', async () => {
    await vault.setup(OLD);
    vault.lock();
    const result = await vault.changePassphrase(OLD, NEW);
    expect(result).toEqual({ ok: false, reason: 'locked' });
  });

  it('returns bad_passphrase when current passphrase is wrong', async () => {
    await vault.setup(OLD);
    const result = await vault.changePassphrase('wrong-passphrase!!', NEW);
    expect(result).toEqual({ ok: false, reason: 'bad_passphrase' });
  });

  it('rewraps the DEK and the new passphrase unlocks successfully', async () => {
    await vault.setup(OLD);
    const plaintext = JSON.stringify({ x: 1 });
    const encrypted = await vault.encryptUtf8(plaintext);

    const result = await vault.changePassphrase(OLD, NEW);
    expect(result).toEqual({ ok: true });

    // Old passphrase should no longer unlock
    vault.lock();
    const oldUnlock = await vault.unlock(OLD);
    expect(oldUnlock.ok).toBe(false);

    // New passphrase should unlock and data should still decrypt
    const newUnlock = await vault.unlock(NEW);
    expect(newUnlock.ok).toBe(true);
    const decrypted = await vault.decryptUtf8(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('rejects a new passphrase that is too short', async () => {
    await vault.setup(OLD);
    await expect(vault.changePassphrase(OLD, 'short')).rejects.toThrow(/passphrase/i);
  });
});
