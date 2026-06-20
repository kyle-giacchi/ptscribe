import { AppDataSchema } from '@/schemas';
import type { AppData } from '@/types';

/**
 * Validates that stored data is at the current schema version.
 * No migration ladder — this app performs a clean-slate reset when
 * old data is detected. DataRepository.load() handles the null/quarantine path.
 */
export function migrate(data: unknown): AppData {
  const version = (data as { version?: unknown }).version;
  if (version !== 1) {
    throw new Error(
      `Stored data version ${version} is not supported. ` +
        `Clear localStorage and reload to start fresh.`,
    );
  }
  const parsed = AppDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Schema validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}
