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
        return null;
      }
      return result.data;
    } catch (e) {
      console.error('Failed to load AppData', e);
      return null;
    }
  },

  async save(data: AppData): Promise<void> {
    const json = JSON.stringify(data);
    const out = vault.isUnlocked() ? await vault.encryptUtf8(json) : json;
    safeLocalStorage.setItem(STORAGE_KEYS.appData, out);
  },

  clear(): void {
    safeLocalStorage.removeItem(STORAGE_KEYS.appData);
  },
};
