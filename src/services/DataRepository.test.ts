import { beforeEach, describe, expect, it } from 'vitest';
import { dataRepository } from './DataRepository';
import { defaultAppData } from '@/schemas';
import { vault } from '@/lib/vault/vault';
import { PASSPHRASE_MIN_CHARS } from '@/lib/vault/crypto';
import { STORAGE_KEYS } from '@/lib/storageKeys';

beforeEach(() => {
  localStorage.clear();
  vault.lock();
});

describe('DataRepository (vault-aware)', () => {
  it('returns null when nothing is stored', async () => {
    expect(await dataRepository.load()).toBeNull();
  });

  it('round-trips AppData when the vault is unlocked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const data = defaultAppData();
    await dataRepository.save(data);
    const stored = localStorage.getItem(STORAGE_KEYS.appData) ?? '';
    expect(stored).not.toContain('"clinician"');
    const loaded = await dataRepository.load();
    expect(loaded?.version).toBe(data.version);
    expect(loaded?.templates.length).toBe(data.templates.length);
  });

  it('saves plaintext when vault is locked', async () => {
    const data = defaultAppData();
    await dataRepository.save(data);
    const stored = localStorage.getItem(STORAGE_KEYS.appData) ?? '';
    expect(stored).toContain('"clinician"');
  });

  it('reads legacy plaintext AppData without vault', async () => {
    const legacy = JSON.stringify(defaultAppData());
    localStorage.setItem(STORAGE_KEYS.appData, legacy);
    const loaded = await dataRepository.load();
    expect(loaded?.version).toBe(defaultAppData().version);
  });

  it('returns null when ciphertext envelope is present but vault is locked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    await dataRepository.save(defaultAppData());
    vault.lock();
    expect(await dataRepository.load()).toBeNull();
  });

  it('returns null on invalid stored data', async () => {
    localStorage.setItem(STORAGE_KEYS.appData, '{ "garbage": true }');
    expect(await dataRepository.load()).toBeNull();
  });

  it('clears stored data', async () => {
    await dataRepository.save(defaultAppData());
    dataRepository.clear();
    expect(await dataRepository.load()).toBeNull();
  });
});
