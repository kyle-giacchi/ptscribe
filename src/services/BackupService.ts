/**
 * Backup export/import codec.
 *
 * When the vault is unlocked, exports are wrapped under the same AES-GCM key
 * that protects on-disk AppData — a backup file is useless without the
 * passphrase. When no vault is initialized, exports fall back to plaintext
 * for backwards compatibility with pre-vault deployments.
 *
 * On import we accept three shapes:
 *   1. New encrypted envelope:  { kind: 'ptnotes-backup', v: 1, encrypted: true,  iv, ciphertext }
 *   2. New plaintext envelope:  { kind: 'ptnotes-backup', v: 1, encrypted: false, data: AppData }
 *   3. Legacy bare AppData JSON (no `kind` field) — preserved so existing
 *      backup files keep working.
 */
import type { AppData } from '@/types';
import { AppDataSchema } from '@/schemas';
import { vault } from '@/lib/vault/vault';

export const BACKUP_KIND = 'ptnotes-backup';
export const BACKUP_VERSION = 1;

export interface EncryptedBackup {
  kind: typeof BACKUP_KIND;
  v: typeof BACKUP_VERSION;
  encrypted: true;
  /** AES-GCM envelope produced by `vault.encryptUtf8(JSON.stringify(appData))`. */
  envelope: string;
}

export interface PlaintextBackup {
  kind: typeof BACKUP_KIND;
  v: typeof BACKUP_VERSION;
  encrypted: false;
  data: AppData;
}

export type BackupFile = EncryptedBackup | PlaintextBackup;

export type ImportError =
  | { code: 'INVALID_JSON'; message: string }
  | { code: 'VAULT_LOCKED'; message: string }
  | { code: 'WRONG_PASSPHRASE'; message: string }
  | { code: 'SCHEMA_INVALID'; message: string };

export type ImportResult =
  | { ok: true; data: AppData; encrypted: boolean }
  | { ok: false; error: ImportError };

/**
 * Produce the JSON string that should be written to disk. When the vault is
 * unlocked the AppData payload is encrypted; otherwise it is wrapped in a
 * `encrypted: false` envelope so the file shape is consistent across modes.
 */
export async function exportBackup(appData: AppData): Promise<string> {
  if (vault.isUnlocked()) {
    const envelope = await vault.encryptUtf8(JSON.stringify(appData));
    const file: EncryptedBackup = {
      kind: BACKUP_KIND,
      v: BACKUP_VERSION,
      encrypted: true,
      envelope,
    };
    return JSON.stringify(file, null, 2);
  }
  const file: PlaintextBackup = {
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    encrypted: false,
    data: appData,
  };
  return JSON.stringify(file, null, 2);
}

export async function importBackup(text: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INVALID_JSON',
        message: `Backup file is not valid JSON: ${(e as Error).message}`,
      },
    };
  }

  if (isEncryptedBackup(parsed)) {
    if (!vault.isUnlocked()) {
      return {
        ok: false,
        error: {
          code: 'VAULT_LOCKED',
          message:
            'This backup is encrypted. Unlock the vault with the passphrase used when the backup was created, then try again.',
        },
      };
    }
    let plaintext: string;
    try {
      plaintext = await vault.decryptUtf8(parsed.envelope);
    } catch {
      return {
        ok: false,
        error: {
          code: 'WRONG_PASSPHRASE',
          message:
            'Could not decrypt this backup. It was encrypted with a different vault passphrase than the one currently unlocked.',
        },
      };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(plaintext);
    } catch (e) {
      return {
        ok: false,
        error: {
          code: 'INVALID_JSON',
          message: `Decrypted backup is not valid JSON: ${(e as Error).message}`,
        },
      };
    }
    return validateAppData(payload, true);
  }

  if (isPlaintextBackup(parsed)) {
    return validateAppData(parsed.data, false);
  }

  // Legacy bare-AppData export (no `kind` field). Preserve compatibility.
  return validateAppData(parsed, false);
}

function validateAppData(payload: unknown, encrypted: boolean): ImportResult {
  const result = AppDataSchema.safeParse(payload);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        message: 'Backup file is invalid or from a different version.',
      },
    };
  }
  return { ok: true, data: result.data, encrypted };
}

function isEncryptedBackup(v: unknown): v is EncryptedBackup {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === BACKUP_KIND &&
    o.v === BACKUP_VERSION &&
    o.encrypted === true &&
    typeof o.envelope === 'string'
  );
}

function isPlaintextBackup(v: unknown): v is PlaintextBackup {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === BACKUP_KIND &&
    o.v === BACKUP_VERSION &&
    o.encrypted === false &&
    typeof o.data === 'object' &&
    o.data !== null
  );
}
