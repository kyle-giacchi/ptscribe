import { APP_DATA_VERSION, type AppData } from '@/types';

export const CURRENT_VERSION = APP_DATA_VERSION;

/**
 * v1 baseline. The PTScribe pivot started clean — no v0 migration is registered.
 * Old finance-app data in localStorage is rejected by `safeParse` and replaced
 * with the default empty state.
 */
export function migrate(data: unknown): AppData {
  const version = (data as { version?: unknown }).version;
  if (typeof version !== 'number') {
    throw new Error('migrate: data has no numeric version field');
  }
  if (version > CURRENT_VERSION) {
    throw new Error(
      `migrate: data version ${version} is newer than CURRENT_VERSION ${CURRENT_VERSION}`,
    );
  }
  if (version < CURRENT_VERSION) {
    throw new Error(`migrate: no migration registered for version ${version}`);
  }
  return data as AppData;
}
