import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, importBackup, BACKUP_KIND, BACKUP_VERSION } from './BackupService';
import { defaultAppData } from '@/schemas';
import { vault } from '@/lib/vault/vault';
import { PASSPHRASE_MIN_CHARS } from '@/lib/vault/crypto';

beforeEach(() => {
  localStorage.clear();
  vault.lock();
});

describe('BackupService', () => {
  it('produces a plaintext envelope when the vault is locked', async () => {
    const data = defaultAppData();
    const text = await exportBackup(data);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.kind).toBe(BACKUP_KIND);
    expect(parsed.v).toBe(BACKUP_VERSION);
    expect(parsed.encrypted).toBe(false);
    expect((parsed.data as { version?: number }).version).toBe(data.version);
  });

  it('produces an encrypted envelope when the vault is unlocked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const data = defaultAppData();
    const text = await exportBackup(data);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.kind).toBe(BACKUP_KIND);
    expect(parsed.encrypted).toBe(true);
    expect(typeof parsed.envelope).toBe('string');
    expect(text).not.toContain('"clinician"');
    expect(text).not.toContain('"templates"');
  });

  it('round-trips an encrypted backup', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const data = defaultAppData();
    const text = await exportBackup(data);

    const result = await importBackup(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.encrypted).toBe(true);
      expect(result.data.version).toBe(data.version);
      expect(result.data.templates.length).toBe(data.templates.length);
    }
  });

  it('round-trips a plaintext backup', async () => {
    const data = defaultAppData();
    const text = await exportBackup(data);
    const result = await importBackup(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.encrypted).toBe(false);
      expect(result.data.version).toBe(data.version);
    }
  });

  it('accepts a legacy bare-AppData JSON file', async () => {
    const data = defaultAppData();
    const result = await importBackup(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.encrypted).toBe(false);
      expect(result.data.version).toBe(data.version);
    }
  });

  it('rejects an encrypted backup when the vault is locked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const data = defaultAppData();
    const text = await exportBackup(data);
    vault.lock();

    const result = await importBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VAULT_LOCKED');
    }
  });

  it('rejects an encrypted backup decrypted with a different passphrase', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));
    const data = defaultAppData();
    const text = await exportBackup(data);

    // Wipe and re-init vault with a different passphrase
    vault.lock();
    localStorage.clear();
    await vault.setup('b'.repeat(PASSPHRASE_MIN_CHARS));

    const result = await importBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRONG_PASSPHRASE');
    }
  });

  it('rejects malformed JSON', async () => {
    const result = await importBackup('this is not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_JSON');
    }
  });

  it('rejects a backup whose payload fails schema validation', async () => {
    const bogus = { kind: BACKUP_KIND, v: BACKUP_VERSION, encrypted: false, data: { foo: 1 } };
    const result = await importBackup(JSON.stringify(bogus));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });
});
