import { APP_DATA_VERSION, type AppData } from '@/types';
import { BUILTIN_TEMPLATES } from '@/lib/clinical/templates';
import { newId } from '@/utils/ids';

export const CURRENT_VERSION = APP_DATA_VERSION;

/**
 * Migration ladder. Each step takes a working object and returns the next-version
 * shape. v0/v1 finance-app data is still rejected by `safeParse` and replaced with
 * the default empty state — these migrations only handle PTScribe v1+ data.
 *
 * - v1 → v2: OpenAI Whisper provider replaced with Cloudflare Workers AI Whisper.
 * - v2 → v3: `Session.audioRef` collapsed into `Session.clips: SessionClip[]` so
 *   a session can hold multiple discrete recordings. The legacy IDB Blob keyed
 *   by sessionId is reused as the first clip's audio (clip.id = old audioRef).
 * - v3 → v4: Default transcription model swapped from `@cf/openai/whisper-large-v3-turbo`
 *   to `@cf/deepgram/nova-3` for built-in speaker diarization. User overrides preserved.
 *   Also backfills the new "Premium Prompt 1" built-in template (only seeded by
 *   `defaultAppData()` on first-run, so existing users would otherwise miss it).
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

  if ((working as { version?: number }).version === 1) {
    working = migrateV1ToV2(working);
  }
  if ((working as { version?: number }).version === 2) {
    working = migrateV2ToV3(working);
  }
  if ((working as { version?: number }).version === 3) {
    working = migrateV3ToV4(working);
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

function migrateV3ToV4(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 4 } as Record<string, unknown>;
  const settings = next.settings as { ai?: { transcription?: Record<string, unknown> } } | undefined;
  const tx = settings?.ai?.transcription;
  if (tx && tx.model === '@cf/openai/whisper-large-v3-turbo') {
    tx.model = '@cf/deepgram/nova-3';
  }

  const templates = Array.isArray(next.templates)
    ? (next.templates as Record<string, unknown>[])
    : [];
  const hasPremium1 = templates.some(
    (t) => t.builtin === true && t.name === 'Premium Prompt 1',
  );
  if (!hasPremium1) {
    const seed = BUILTIN_TEMPLATES.find((t) => t.name === 'Premium Prompt 1');
    if (seed) {
      const now = Date.now();
      templates.unshift({
        ...seed,
        id: newId(),
        builtin: true,
        createdAt: now,
        updatedAt: now,
      });
      next.templates = templates;
    }
  }
  return next;
}

function migrateV2ToV3(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 3 } as Record<string, unknown>;
  const sessions = Array.isArray(next.sessions) ? (next.sessions as unknown[]) : [];

  next.sessions = sessions.map((raw) => {
    const s = raw as Record<string, unknown>;
    const audioRef = typeof s.audioRef === 'string' && s.audioRef.length > 0 ? s.audioRef : undefined;
    const transcript = typeof s.transcript === 'string' ? s.transcript : undefined;
    const createdAt = typeof s.createdAt === 'number' ? s.createdAt : Date.now();
    const updatedAt = typeof s.updatedAt === 'number' ? s.updatedAt : createdAt;
    const durationMin = typeof s.durationMin === 'number' ? s.durationMin : 0;

    const clips: Record<string, unknown>[] = audioRef
      ? [
          {
            id: audioRef,
            index: 0,
            durationSec: Math.round(durationMin * 60),
            status: transcript && transcript.length > 0 ? 'transcribed' : 'ready',
            ...(transcript ? { transcript, transcriptedAt: updatedAt } : {}),
            createdAt,
            updatedAt,
          },
        ]
      : [];

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(s)) {
      if (key === 'audioRef') continue;
      out[key] = value;
    }
    out.clips = clips;
    return out;
  });

  return next;
}
