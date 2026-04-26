import { AppDataSchema } from '@/schemas';
import { safeLocalStorage } from '@/lib/safeStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { migrate } from '@/utils/migrations';
import type { AppData } from '@/types';

export const dataRepository = {
  load(): AppData | null {
    const raw = safeLocalStorage.getItem(STORAGE_KEYS.appData);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
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

  save(data: AppData): void {
    safeLocalStorage.setItem(STORAGE_KEYS.appData, JSON.stringify(data));
  },

  clear(): void {
    safeLocalStorage.removeItem(STORAGE_KEYS.appData);
  },
};
