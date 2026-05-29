/**
 * Backup export/import codec.
 *
 * Export shapes:
 *   - **Portable v2 (vault unlocked)** — `{ kind, v: 2, encrypted: true, portable: true,
 *     kdf, wrappedDek_passphrase, payload }`. AppData is encrypted under the vault DEK;
 *     the DEK is carried wrapped by the passphrase-derived KEK (copied from the on-disk
 *     vault envelope). Restorable on **any** device by deriving the KEK from the
 *     passphrase → unwrapping the DEK → decrypting the payload. (D2 will add a second
 *     `wrappedDek_recoveryCode` so a recovery code also restores.)
 *   - **Plaintext v1 (no vault)** — `{ kind, v: 1, encrypted: false, data }`. For
 *     pre-vault deployments; inherently portable since it carries no key.
 *
 * Import accepts (newest → oldest):
 *   1. Portable v2 envelope (above).
 *   2. Legacy v1 encrypted envelope `{ kind, v: 1, encrypted: true, envelope }` — only
 *      restorable on the *same* vault (decrypted with the live DEK). Kept for files
 *      created before v2 shipped.
 *   3. Plaintext v1 envelope.
 *   4. Legacy bare AppData JSON (no `kind` field).
 */
import type { AppData } from '@/types';
import { AppDataSchema } from '@/schemas';
import { vault } from '@/lib/vault/vault';
import { base64ToBytes, decryptBytes, deriveKek, unwrapDek } from '@/lib/vault/crypto';
import { normalizeRecoveryCode } from '@/lib/vault/recoveryCode';

export const BACKUP_KIND = 'ptnotes-backup';
export const BACKUP_VERSION = 1;
export const PORTABLE_BACKUP_VERSION = 2;

/** A raw AES-GCM ciphertext split into its IV and ciphertext halves (base64). */
interface CipherParts {
  iv: string;
  ciphertext: string;
}

export interface PortableBackup {
  kind: typeof BACKUP_KIND;
  v: typeof PORTABLE_BACKUP_VERSION;
  encrypted: true;
  portable: true;
  /** Argon2id parameters + salt used to derive the passphrase-KEK. */
  kdf: {
    name: 'Argon2id';
    memoryKib: number;
    iterations: number;
    parallelism: number;
    salt: string;
  };
  /** The DEK wrapped by the passphrase-derived KEK (copied from the vault envelope). */
  wrappedDek_passphrase: CipherParts;
  /** The same DEK wrapped by a recovery-code-derived KEK, if a recovery code is set. */
  wrappedDek_recoveryCode?: CipherParts & {
    kdf: {
      name: 'Argon2id';
      memoryKib: number;
      iterations: number;
      parallelism: number;
      salt: string;
    };
  };
  /** AppData JSON encrypted under the DEK. */
  payload: CipherParts;
}

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

export type BackupFile = PortableBackup | EncryptedBackup | PlaintextBackup;

export type ImportError =
  | { code: 'INVALID_JSON'; message: string }
  | { code: 'VAULT_LOCKED'; message: string }
  | { code: 'PASSPHRASE_REQUIRED'; message: string }
  | { code: 'WRONG_PASSPHRASE'; message: string }
  | { code: 'SCHEMA_INVALID'; message: string };

export type ImportResult =
  | { ok: true; data: AppData; encrypted: boolean }
  | { ok: false; error: ImportError };

export interface ImportOptions {
  /** Passphrase for restoring a portable backup on a device whose vault can't decrypt it. */
  passphrase?: string;
  /** Recovery code, as an alternative to the passphrase, for the same restore. */
  recoveryCode?: string;
}

/**
 * Produce the JSON string written to disk. When the vault is unlocked the AppData
 * payload is encrypted into a portable v2 envelope; otherwise it is wrapped in a
 * plaintext v1 envelope so the file shape is consistent across modes.
 */
export async function exportBackup(appData: AppData): Promise<string> {
  if (vault.isUnlocked()) {
    const material = vault.getKeyMaterial();
    if (material) {
      // Encrypt under the live DEK, then reuse the on-disk wrapped-DEK so the file
      // is self-contained and restorable on any device with the passphrase.
      const dataEnvelope = JSON.parse(
        await vault.encryptUtf8(JSON.stringify(appData)),
      ) as CipherParts;
      const file: PortableBackup = {
        kind: BACKUP_KIND,
        v: PORTABLE_BACKUP_VERSION,
        encrypted: true,
        portable: true,
        kdf: material.kdf,
        wrappedDek_passphrase: material.wrappedDek,
        payload: { iv: dataEnvelope.iv, ciphertext: dataEnvelope.ciphertext },
      };
      // Carry the recovery-code wrapping too, so the file restores with either secret.
      if (material.recovery) {
        file.wrappedDek_recoveryCode = {
          kdf: material.recovery.kdf,
          iv: material.recovery.wrappedDek.iv,
          ciphertext: material.recovery.wrappedDek.ciphertext,
        };
      }
      return JSON.stringify(file, null, 2);
    }
    // Vault unlocked but no stored envelope (shouldn't happen) — fall back to the
    // same-vault encrypted v1 shape rather than silently leaking plaintext.
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

export async function importBackup(text: string, opts?: ImportOptions): Promise<ImportResult> {
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

  if (isPortableBackup(parsed)) {
    return importPortable(parsed, opts);
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
    return parsePayload(plaintext, true);
  }

  if (isPlaintextBackup(parsed)) {
    return validateAppData(parsed.data, false);
  }

  // Legacy bare-AppData export (no `kind` field). Preserve compatibility.
  return validateAppData(parsed, false);
}

/**
 * Restore a portable v2 backup. Fast path: if the vault is unlocked with the DEK
 * that produced the payload (same device), decrypt directly — no secret needed.
 * Otherwise derive a KEK from the supplied passphrase and/or recovery code, unwrap
 * the DEK, and decrypt the payload.
 */
async function importPortable(file: PortableBackup, opts?: ImportOptions): Promise<ImportResult> {
  if (vault.isUnlocked()) {
    try {
      const plaintext = await vault.decryptUtf8(
        JSON.stringify({ v: 1, iv: file.payload.iv, ciphertext: file.payload.ciphertext }),
      );
      return parsePayload(plaintext, true);
    } catch {
      // Different vault on this device — fall through to the secret-derivation path.
    }
  }

  const { passphrase, recoveryCode } = opts ?? {};
  if (!passphrase && !recoveryCode) {
    return {
      ok: false,
      error: {
        code: 'PASSPHRASE_REQUIRED',
        message:
          'This backup is encrypted. Enter the vault passphrase (or recovery code) it was created with to restore it on this device.',
      },
    };
  }

  // Try the passphrase wrapping first, then the recovery-code wrapping. The UI may
  // pass the same entered string for both, so a recovery code typed into a
  // passphrase field still resolves via the recovery path.
  if (passphrase) {
    const dek = await tryUnwrap(file.wrappedDek_passphrase, file.kdf, passphrase);
    const result = dek && (await decryptPayload(file, dek));
    if (result) return result;
  }
  if (recoveryCode && file.wrappedDek_recoveryCode) {
    const dek = await tryUnwrap(
      file.wrappedDek_recoveryCode,
      file.wrappedDek_recoveryCode.kdf,
      normalizeRecoveryCode(recoveryCode),
    );
    const result = dek && (await decryptPayload(file, dek));
    if (result) return result;
  }

  return {
    ok: false,
    error: {
      code: 'WRONG_PASSPHRASE',
      message: 'Could not decrypt this backup. The passphrase or recovery code is incorrect.',
    },
  };
}

/** Derive a KEK from `secret` + the wrapping's KDF params and unwrap the DEK. Null on failure. */
async function tryUnwrap(
  wrapped: CipherParts,
  kdf: PortableBackup['kdf'],
  secret: string,
): Promise<CryptoKey | null> {
  try {
    const kek = await deriveKek(secret, base64ToBytes(kdf.salt), {
      memoryKib: kdf.memoryKib,
      iterations: kdf.iterations,
      parallelism: kdf.parallelism,
    });
    return await unwrapDek(
      { iv: base64ToBytes(wrapped.iv), ciphertext: base64ToBytes(wrapped.ciphertext) },
      kek,
    );
  } catch {
    return null;
  }
}

/** Decrypt the AppData payload under an unwrapped DEK, then parse + validate. */
async function decryptPayload(file: PortableBackup, dek: CryptoKey): Promise<ImportResult | null> {
  try {
    const iv = base64ToBytes(file.payload.iv);
    const ct = base64ToBytes(file.payload.ciphertext);
    const combined = new Uint8Array(iv.length + ct.length);
    combined.set(iv, 0);
    combined.set(ct, iv.length);
    const buf = await decryptBytes(combined.buffer, dek);
    return parsePayload(new TextDecoder().decode(buf), true);
  } catch {
    return null;
  }
}

/** JSON.parse a decrypted payload, then schema-validate it. */
function parsePayload(plaintext: string, encrypted: boolean): ImportResult {
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
  return validateAppData(payload, encrypted);
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

function isCipherParts(v: unknown): v is CipherParts {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.iv === 'string' && typeof o.ciphertext === 'string';
}

function isPortableBackup(v: unknown): v is PortableBackup {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === BACKUP_KIND &&
    o.v === PORTABLE_BACKUP_VERSION &&
    o.encrypted === true &&
    typeof o.kdf === 'object' &&
    o.kdf !== null &&
    typeof (o.kdf as Record<string, unknown>).salt === 'string' &&
    isCipherParts(o.wrappedDek_passphrase) &&
    isCipherParts(o.payload)
  );
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
