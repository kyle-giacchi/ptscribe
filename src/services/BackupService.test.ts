import { beforeEach, describe, expect, it } from 'vitest';
import {
  exportBackup,
  importBackup,
  BACKUP_KIND,
  BACKUP_VERSION,
  PORTABLE_BACKUP_VERSION,
} from './BackupService';
import { defaultAppData } from '@/schemas';
import { vault } from '@/lib/vault/vault';
import { PASSPHRASE_MIN_CHARS } from '@/lib/vault/crypto';

const PASS = 'a'.repeat(PASSPHRASE_MIN_CHARS);

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

  it('produces a portable v2 envelope when the vault is unlocked', async () => {
    await vault.setup(PASS);
    const data = defaultAppData();
    const text = await exportBackup(data);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.kind).toBe(BACKUP_KIND);
    expect(parsed.v).toBe(PORTABLE_BACKUP_VERSION);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.portable).toBe(true);
    expect((parsed.kdf as { salt?: string }).salt).toBeTypeOf('string');
    expect(parsed.wrappedDek_passphrase).toBeTypeOf('object');
    expect(parsed.payload).toBeTypeOf('object');
    // No clinical data leaks in cleartext.
    expect(text).not.toContain('"clinician"');
    expect(text).not.toContain('"templates"');
  });

  it('round-trips a portable backup on the same device (no passphrase needed)', async () => {
    await vault.setup(PASS);
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

  it('restores a portable backup on a different device using the passphrase', async () => {
    await vault.setup(PASS);
    const data = defaultAppData();
    const text = await exportBackup(data);

    // Simulate a fresh device: no vault at all.
    vault.lock();
    localStorage.clear();

    const result = await importBackup(text, { passphrase: PASS });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.encrypted).toBe(true);
      expect(result.data.version).toBe(data.version);
    }
  });

  it('asks for a passphrase when a portable backup cannot be decrypted locally', async () => {
    await vault.setup(PASS);
    const data = defaultAppData();
    const text = await exportBackup(data);

    // Different vault on this device — the live DEK cannot decrypt the payload.
    vault.lock();
    localStorage.clear();
    await vault.setup('b'.repeat(PASSPHRASE_MIN_CHARS));

    const result = await importBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PASSPHRASE_REQUIRED');
    }
  });

  it('rejects a portable backup restored with the wrong passphrase', async () => {
    await vault.setup(PASS);
    const data = defaultAppData();
    const text = await exportBackup(data);

    vault.lock();
    localStorage.clear();

    const result = await importBackup(text, { passphrase: 'z'.repeat(PASSPHRASE_MIN_CHARS) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRONG_PASSPHRASE');
    }
  });

  it('restores a portable backup with the recovery code on a different device', async () => {
    await vault.setup(PASS);
    const code = await vault.setupRecoveryCode();
    const data = defaultAppData();
    const text = await exportBackup(data);
    // The file carries the recovery wrapping.
    expect((JSON.parse(text) as Record<string, unknown>).wrappedDek_recoveryCode).toBeTypeOf(
      'object',
    );

    // Fresh device.
    vault.lock();
    localStorage.clear();

    const result = await importBackup(text, { recoveryCode: code });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.version).toBe(data.version);
    }
  });

  it('resolves a recovery code typed into the passphrase slot', async () => {
    await vault.setup(PASS);
    const code = await vault.setupRecoveryCode();
    const data = defaultAppData();
    const text = await exportBackup(data);

    vault.lock();
    localStorage.clear();

    // UI passes the entered secret as both — the recovery path still resolves it.
    const result = await importBackup(text, { passphrase: code, recoveryCode: code });
    expect(result.ok).toBe(true);
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

  it('imports a legacy v1 encrypted envelope on the same vault', async () => {
    await vault.setup(PASS);
    const data = defaultAppData();
    // Hand-build the legacy v1 encrypted shape the old exporter produced.
    const envelope = await vault.encryptUtf8(JSON.stringify(data));
    const legacy = JSON.stringify({
      kind: BACKUP_KIND,
      v: BACKUP_VERSION,
      encrypted: true,
      envelope,
    });

    const result = await importBackup(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.encrypted).toBe(true);
      expect(result.data.version).toBe(data.version);
    }
  });

  it('rejects a legacy v1 encrypted envelope when the vault is locked', async () => {
    await vault.setup(PASS);
    const data = defaultAppData();
    const envelope = await vault.encryptUtf8(JSON.stringify(data));
    const legacy = JSON.stringify({
      kind: BACKUP_KIND,
      v: BACKUP_VERSION,
      encrypted: true,
      envelope,
    });
    vault.lock();

    const result = await importBackup(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VAULT_LOCKED');
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
