import { STORAGE_KEYS } from '@/lib/storageKeys';
import { auditLog } from '@/lib/audit/auditLog';
import {
  ARGON2_ITERATIONS,
  ARGON2_MEMORY_KIB,
  ARGON2_PARALLELISM,
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  deriveKek,
  encryptBytes,
  generateDek,
  IV_BYTES,
  PASSPHRASE_MIN_CHARS,
  randomBytes,
  SALT_BYTES,
  unwrapDek,
  VAULT_VERSION,
  wrapDek,
} from './crypto';
import { generateRecoveryCode, normalizeRecoveryCode } from './recoveryCode';

interface KdfDescriptor {
  name: 'Argon2id';
  memoryKib: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

interface WrappedDekJson {
  iv: string;
  ciphertext: string;
}

export interface VaultEnvelope {
  v: 1;
  kdf: KdfDescriptor;
  wrappedDek: WrappedDekJson;
  /**
   * Optional second wrapping of the *same* DEK under a recovery-code-derived KEK
   * (ADR-0003). Present once a recovery code has been generated; absent on vaults
   * created before that step or where the user never set one up. Survives
   * passphrase changes because it wraps the DEK, not the passphrase.
   */
  recovery?: {
    kdf: KdfDescriptor;
    wrappedDek: WrappedDekJson;
  };
}

interface DataEnvelope {
  v: 1;
  iv: string;
  ciphertext: string;
}

export type UnlockResult = { ok: true } | { ok: false; reason: 'bad_passphrase' | 'corrupt' };

let dek: CryptoKey | null = null;

// ── Two-tab conflict detection ────────────────────────────────────────────────
// If another tab has the vault unlocked while we don't, our saves would write
// plaintext over encrypted data. BroadcastChannel lets tabs coordinate.

type VaultMsg = { type: 'vault:unlocked' } | { type: 'vault:locked' } | { type: 'vault:query' };
type ConflictHandler = (conflicted: boolean) => void;
type RemoteLockHandler = () => void;

let otherTabHasVault = false;
const conflictHandlers = new Set<ConflictHandler>();
const remoteLockHandlers = new Set<RemoteLockHandler>();
let bc: BroadcastChannel | null = null;

function notifyConflict(conflicted: boolean): void {
  conflictHandlers.forEach((h) => h(conflicted));
}

function notifyRemoteLock(): void {
  remoteLockHandlers.forEach((h) => h());
}

if (typeof BroadcastChannel !== 'undefined') {
  bc = new BroadcastChannel('ptnotes-vault');
  bc.onmessage = (e: MessageEvent<VaultMsg>) => {
    if (e.data.type === 'vault:unlocked') {
      otherTabHasVault = true;
      if (dek === null) notifyConflict(true);
    } else if (e.data.type === 'vault:locked') {
      otherTabHasVault = false;
      notifyConflict(false);
      // If this tab is still unlocked, lock it too so all tabs stay in sync.
      if (dek !== null) {
        dek = null;
        void auditLog.append('vault:locked');
        notifyRemoteLock();
      }
    } else if (e.data.type === 'vault:query') {
      if (dek !== null) bc?.postMessage({ type: 'vault:unlocked' });
    }
  };
  // Ask existing tabs if they already have the vault open
  bc.postMessage({ type: 'vault:query' });
}
// ─────────────────────────────────────────────────────────────────────────────

function readEnvelope(): VaultEnvelope | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.vault);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultEnvelope;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeEnvelope(env: VaultEnvelope): void {
  localStorage.setItem(STORAGE_KEYS.vault, JSON.stringify(env));
}

function kdfDescriptor(salt: Uint8Array): KdfDescriptor {
  return {
    name: 'Argon2id',
    memoryKib: ARGON2_MEMORY_KIB,
    iterations: ARGON2_ITERATIONS,
    parallelism: ARGON2_PARALLELISM,
    salt: bytesToBase64(salt),
  };
}

function ensureUnlocked(): CryptoKey {
  if (!dek) throw new Error('vault: locked');
  return dek;
}

export const vault = {
  isInitialized(): boolean {
    return readEnvelope() !== null;
  },

  isUnlocked(): boolean {
    return dek !== null;
  },

  /**
   * The stored KDF parameters + passphrase-wrapped DEK from the on-disk vault
   * envelope. Used by the portable (v2) backup codec to embed a self-contained,
   * cross-device-restorable copy of the wrapped DEK. Returns null when no vault
   * is initialized. The bytes returned are already in localStorage — exposing
   * them in a user-controlled backup file adds no new at-rest exposure.
   */
  getKeyMaterial(): {
    kdf: VaultEnvelope['kdf'];
    wrappedDek: VaultEnvelope['wrappedDek'];
    recovery?: NonNullable<VaultEnvelope['recovery']>;
  } | null {
    const env = readEnvelope();
    if (!env) return null;
    return { kdf: env.kdf, wrappedDek: env.wrappedDek, recovery: env.recovery };
  },

  /** True once a recovery code has been generated for this vault. */
  hasRecoveryCode(): boolean {
    return readEnvelope()?.recovery != null;
  },

  /**
   * Generate (or regenerate) a recovery code. Requires the vault to be unlocked
   * so the in-memory DEK can be wrapped under a fresh recovery-KEK. Returns the
   * code in display form — show it once; it is never stored in plaintext.
   * Regenerating overwrites the prior recovery envelope, invalidating the old code.
   */
  async setupRecoveryCode(): Promise<string> {
    const liveDek = ensureUnlocked();
    const env = readEnvelope();
    if (!env) throw new Error('vault: not initialized');

    const code = generateRecoveryCode();
    const salt = randomBytes(SALT_BYTES);
    const recoveryKek = await deriveKek(normalizeRecoveryCode(code), salt);
    const wrapped = await wrapDek(liveDek, recoveryKek);

    writeEnvelope({
      ...env,
      recovery: {
        kdf: kdfDescriptor(salt),
        wrappedDek: {
          iv: bytesToBase64(wrapped.iv),
          ciphertext: bytesToBase64(wrapped.ciphertext),
        },
      },
    });
    void auditLog.append('vault:recovery_code_set');
    return code;
  },

  /** Unlock using the recovery code instead of the passphrase (same device). */
  async unlockWithRecoveryCode(code: string): Promise<UnlockResult> {
    const env = readEnvelope();
    if (!env?.recovery) return { ok: false, reason: 'corrupt' };
    let salt: Uint8Array;
    let iv: Uint8Array;
    let ciphertext: Uint8Array;
    try {
      salt = base64ToBytes(env.recovery.kdf.salt);
      iv = base64ToBytes(env.recovery.wrappedDek.iv);
      ciphertext = base64ToBytes(env.recovery.wrappedDek.ciphertext);
    } catch {
      return { ok: false, reason: 'corrupt' };
    }
    try {
      const recoveryKek = await deriveKek(normalizeRecoveryCode(code), salt);
      dek = await unwrapDek({ iv, ciphertext }, recoveryKek);
      bc?.postMessage({ type: 'vault:unlocked' });
      void auditLog.append('vault:unlocked_with_recovery_code');
      return { ok: true };
    } catch {
      dek = null;
      return { ok: false, reason: 'bad_passphrase' };
    }
  },

  async setup(passphrase: string): Promise<void> {
    if (passphrase.length < PASSPHRASE_MIN_CHARS) {
      throw new Error(`vault: passphrase must be at least ${PASSPHRASE_MIN_CHARS} characters`);
    }
    if (vault.isInitialized()) throw new Error('vault: already initialized');

    const salt = randomBytes(SALT_BYTES);
    const kek = await deriveKek(passphrase, salt);
    const newDek = await generateDek();
    const wrapped = await wrapDek(newDek, kek);

    writeEnvelope({
      v: VAULT_VERSION,
      kdf: {
        name: 'Argon2id',
        memoryKib: ARGON2_MEMORY_KIB,
        iterations: ARGON2_ITERATIONS,
        parallelism: ARGON2_PARALLELISM,
        salt: bytesToBase64(salt),
      },
      wrappedDek: {
        iv: bytesToBase64(wrapped.iv),
        ciphertext: bytesToBase64(wrapped.ciphertext),
      },
    });
    dek = newDek;
    bc?.postMessage({ type: 'vault:unlocked' });
    void auditLog.append('vault:unlocked');
  },

  async unlock(passphrase: string): Promise<UnlockResult> {
    const env = readEnvelope();
    if (!env) return { ok: false, reason: 'corrupt' };
    let salt: Uint8Array;
    let iv: Uint8Array;
    let ciphertext: Uint8Array;
    try {
      salt = base64ToBytes(env.kdf.salt);
      iv = base64ToBytes(env.wrappedDek.iv);
      ciphertext = base64ToBytes(env.wrappedDek.ciphertext);
    } catch {
      return { ok: false, reason: 'corrupt' };
    }
    try {
      const kek = await deriveKek(passphrase, salt);
      dek = await unwrapDek({ iv, ciphertext }, kek);
      bc?.postMessage({ type: 'vault:unlocked' });
      void auditLog.append('vault:unlocked');
      return { ok: true };
    } catch {
      dek = null;
      return { ok: false, reason: 'bad_passphrase' };
    }
  },

  lock(): void {
    dek = null;
    bc?.postMessage({ type: 'vault:locked' });
    otherTabHasVault = false;
    void auditLog.append('vault:locked');
  },

  async changePassphrase(
    currentPassphrase: string,
    newPassphrase: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'bad_passphrase' | 'locked' | 'corrupt' }> {
    if (!dek) return { ok: false, reason: 'locked' };
    if (newPassphrase.length < PASSPHRASE_MIN_CHARS) {
      throw new Error(`vault: new passphrase must be at least ${PASSPHRASE_MIN_CHARS} characters`);
    }

    const env = readEnvelope();
    if (!env) return { ok: false, reason: 'corrupt' };

    let currentSalt: Uint8Array;
    let wrappedIv: Uint8Array;
    let wrappedCt: Uint8Array;
    try {
      currentSalt = base64ToBytes(env.kdf.salt);
      wrappedIv = base64ToBytes(env.wrappedDek.iv);
      wrappedCt = base64ToBytes(env.wrappedDek.ciphertext);
    } catch {
      return { ok: false, reason: 'corrupt' };
    }

    // Verify current passphrase before rewrapping.
    try {
      const currentKek = await deriveKek(currentPassphrase, currentSalt);
      await unwrapDek({ iv: wrappedIv, ciphertext: wrappedCt }, currentKek);
    } catch {
      return { ok: false, reason: 'bad_passphrase' };
    }

    // Rewrap the in-memory DEK under a new salt + KEK — no data re-encryption needed.
    const newSalt = randomBytes(SALT_BYTES);
    const newKek = await deriveKek(newPassphrase, newSalt);
    const wrapped = await wrapDek(dek, newKek);

    writeEnvelope({
      v: VAULT_VERSION,
      kdf: kdfDescriptor(newSalt),
      wrappedDek: {
        iv: bytesToBase64(wrapped.iv),
        ciphertext: bytesToBase64(wrapped.ciphertext),
      },
      // The recovery code wraps the DEK independently, so it survives a passphrase
      // change untouched — preserve it rather than dropping it.
      recovery: env.recovery,
    });

    void auditLog.append('vault:passphrase_changed');
    return { ok: true };
  },

  async encryptUtf8(plaintext: string): Promise<string> {
    const key = ensureUnlocked();
    const buf = new TextEncoder().encode(plaintext).buffer;
    const env = await encryptBytes(buf, key);
    const view = new Uint8Array(env);
    const envelope: DataEnvelope = {
      v: VAULT_VERSION,
      iv: bytesToBase64(view.subarray(0, IV_BYTES)),
      ciphertext: bytesToBase64(view.subarray(IV_BYTES)),
    };
    return JSON.stringify(envelope);
  },

  async decryptUtf8(envelopeJson: string): Promise<string> {
    const key = ensureUnlocked();
    const parsed = JSON.parse(envelopeJson) as DataEnvelope;
    if (parsed?.v !== 1) throw new Error('vault: unknown envelope version');
    const iv = base64ToBytes(parsed.iv);
    const ct = base64ToBytes(parsed.ciphertext);
    const combined = new Uint8Array(iv.length + ct.length);
    combined.set(iv, 0);
    combined.set(ct, iv.length);
    const plain = await decryptBytes(combined.buffer, key);
    return new TextDecoder().decode(plain);
  },

  async encryptBlob(blob: Blob): Promise<Blob> {
    const key = ensureUnlocked();
    const buf = await blob.arrayBuffer();
    const env = await encryptBytes(buf, key);
    return new Blob([env], { type: 'application/octet-stream' });
  },

  async decryptBlob(blob: Blob, mimeType: string): Promise<Blob> {
    const key = ensureUnlocked();
    const buf = await blob.arrayBuffer();
    const plain = await decryptBytes(buf, key);
    return new Blob([plain], { type: mimeType });
  },

  isTwoTabConflict(): boolean {
    return otherTabHasVault && dek === null;
  },

  onConflictChange(handler: ConflictHandler): () => void {
    conflictHandlers.add(handler);
    return () => conflictHandlers.delete(handler);
  },

  /** Subscribe to be notified when another tab locks the vault. */
  onRemoteLock(handler: RemoteLockHandler): () => void {
    remoteLockHandlers.add(handler);
    return () => remoteLockHandlers.delete(handler);
  },
};
