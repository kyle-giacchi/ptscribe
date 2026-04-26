import { APP_DATA_VERSION, type AppData } from '@/types';

export const CURRENT_VERSION = APP_DATA_VERSION;

/**
 * v2 swaps the OpenAI Whisper transcription provider for Cloudflare Workers AI Whisper.
 * v0/v1 finance-app data is still rejected by `safeParse` and replaced with the default
 * empty state — this migration only handles v1 PTScribe data.
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

  let working = data as Record<string, unknown>;

  if (version === 1) {
    working = migrateV1ToV2(working);
  }

  if ((working as { version?: number }).version !== CURRENT_VERSION) {
    throw new Error(`migrate: no migration registered for version ${version}`);
  }

  return working as unknown as AppData;
}

function migrateV1ToV2(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 2 } as Record<string, unknown>;
  const settings = next.settings as { ai?: { transcription?: Record<string, unknown> } } | undefined;
  const tx = settings?.ai?.transcription;
  if (tx) {
    if (tx.provider === 'openai') {
      // OpenAI Whisper is gone; user must re-enter Cloudflare credentials in Settings.
      tx.provider = 'webspeech';
      delete tx.apiKey;
    }
    if (typeof tx.model !== 'string' || tx.model === 'whisper-1' || tx.model.length === 0) {
      tx.model = '@cf/openai/whisper-large-v3-turbo';
    }
  }
  return next;
}
