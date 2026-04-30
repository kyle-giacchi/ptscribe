import { AppDataSchema } from '@/schemas';
import { safeLocalStorage } from '@/lib/safeStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { migrate } from '@/utils/migrations';
import { vault } from '@/lib/vault/vault';
import type { AppData } from '@/types';

function looksLikeEnvelope(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return (
      parsed?.v === 1 && typeof parsed.iv === 'string' && typeof parsed.ciphertext === 'string'
    );
  } catch {
    return false;
  }
}

function quarantineCorrupt(raw: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.appDataCorrupt, raw);
  } catch {
    // If we can't quarantine (e.g. quota), just log — don't throw.
  }
}

/**
 * Persistence boundary for `AppData`. When the vault is unlocked, every
 * read/write here round-trips through AES-GCM — callers always see plaintext.
 * Do not add a second persistence path that writes to `ptnotes.appData`
 * outside this module; see docs/invariants.md#vault-and-at-rest-encryption.
 */
export const dataRepository = {
  async load(): Promise<AppData | null> {
    const raw = safeLocalStorage.getItem(STORAGE_KEYS.appData);
    if (!raw) return null;

    try {
      let json: string;
      if (looksLikeEnvelope(raw)) {
        if (!vault.isUnlocked()) return null;
        json = await vault.decryptUtf8(raw);
      } else {
        json = raw;
      }
      const parsed = JSON.parse(json);
      const migrated = migrate(parsed);
      const result = AppDataSchema.safeParse(migrated);
      if (!result.success) {
        console.error('AppData failed schema validation', result.error);
        quarantineCorrupt(raw);
        return null;
      }
      return result.data;
    } catch (e) {
      console.error('Failed to load AppData', e);
      quarantineCorrupt(raw);
      return null;
    }
  },

  async save(data: AppData): Promise<void> {
    if (vault.isTwoTabConflict()) {
      throw new Error(
        'vault: open in another tab — save blocked to prevent plaintext overwriting encrypted data',
      );
    }
    const json = JSON.stringify(data);
    // AES-GCM + base64 adds ~37% overhead; cap plaintext to keep the
    // encrypted envelope safely under the 5 MB safeStorage guard.
    if (vault.isUnlocked() && new Blob([json]).size > 3.5 * 1024 * 1024) {
      throw new Error(
        'AppData exceeds 3.5 MB plaintext limit; encryption overhead would exceed localStorage quota',
      );
    }
    const out = vault.isUnlocked() ? await vault.encryptUtf8(json) : json;
    safeLocalStorage.setItem(STORAGE_KEYS.appData, out);
  },

  clear(): void {
    safeLocalStorage.removeItem(STORAGE_KEYS.appData);
  },

  hasCorruptData(): boolean {
    return safeLocalStorage.getItem(STORAGE_KEYS.appDataCorrupt) !== null;
  },

  clearCorruptData(): void {
    safeLocalStorage.removeItem(STORAGE_KEYS.appDataCorrupt);
  },
};
