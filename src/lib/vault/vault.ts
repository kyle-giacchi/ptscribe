import { STORAGE_KEYS } from '@/lib/storageKeys';
import {
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  deriveKek,
  encryptBytes,
  generateDek,
  IV_BYTES,
  PASSPHRASE_MIN_CHARS,
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  randomBytes,
  SALT_BYTES,
  unwrapDek,
  VAULT_VERSION,
  wrapDek,
} from './crypto';

interface VaultEnvelope {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  wrappedDek: { iv: string; ciphertext: string };
}

interface DataEnvelope {
  v: 1;
  iv: string;
  ciphertext: string;
}

export type UnlockResult = { ok: true } | { ok: false; reason: 'bad_passphrase' | 'corrupt' };

let dek: CryptoKey | null = null;

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
        name: 'PBKDF2',
        hash: PBKDF2_HASH,
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
      },
      wrappedDek: {
        iv: bytesToBase64(wrapped.iv),
        ciphertext: bytesToBase64(wrapped.ciphertext),
      },
    });
    dek = newDek;
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
      return { ok: true };
    } catch {
      dek = null;
      return { ok: false, reason: 'bad_passphrase' };
    }
  },

  lock(): void {
    dek = null;
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
};
