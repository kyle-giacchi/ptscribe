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
 * - v4 → v5: Adds `Settings.audio.silenceDetection` (default OFF) for opt-in client-side
 *   silence trimming before transcription.
 * - v5 → v6: Adds `Settings.audio.speedUp` (default OFF, 1.5×) for opt-in pitch-preserving
 *   time-stretch before transcription.
 * - v6 → v7: Adds optional `liveTranscript` field to Session and SessionClip for per-clip
 *   Web Speech capture. No structural changes — new fields default to absent.
 * - v7 → v8: Adds `Settings.security.idleLockMinutes` (default 10). Auto-lock the vault
 *   after this many minutes of inactivity. `0` disables the timer.
 * - v8 → v9: Adds optional `Clinician.acknowledgedDisclosureAt` (ms timestamp). Captured
 * - v9 → v10: Adds optional `SessionClip.localTranscript` (whisper-tiny result kept as revert target).
 *   when the clinician checks the consent box during Setup; absence is fine for
 *   pre-existing data. No structural changes.
 * - v10 → v11: Adds `AppData.tenantId` (string). Defaults to `'local'` for all
 *   existing single-tenant vaults. Reserved for future multi-tenant routing.
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
  if ((working as { version?: number }).version === 4) {
    working = migrateV4ToV5(working);
  }
  if ((working as { version?: number }).version === 5) {
    working = migrateV5ToV6(working);
  }
  if ((working as { version?: number }).version === 6) {
    working = migrateV6ToV7(working);
  }
  if ((working as { version?: number }).version === 7) {
    working = migrateV7ToV8(working);
  }
  if ((working as { version?: number }).version === 8) {
    working = migrateV8ToV9(working);
  }
  if ((working as { version?: number }).version === 9) {
    working = migrateV9ToV10(working);
  }
  if ((working as { version?: number }).version === 10) {
    working = migrateV10ToV11(working);
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

function migrateV4ToV5(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 5 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingAudio =
    (settings.audio as { silenceDetection?: unknown } | undefined) ?? undefined;
  const existingSd =
    (existingAudio?.silenceDetection as Record<string, unknown> | undefined) ?? undefined;

  next.settings = {
    ...settings,
    audio: {
      silenceDetection: {
        enabled: typeof existingSd?.enabled === 'boolean' ? existingSd.enabled : false,
        sensitivity:
          existingSd?.sensitivity === 'low' ||
          existingSd?.sensitivity === 'medium' ||
          existingSd?.sensitivity === 'high'
            ? existingSd.sensitivity
            : 'medium',
        padMs:
          typeof existingSd?.padMs === 'number' &&
          existingSd.padMs >= 0 &&
          existingSd.padMs <= 2000
            ? existingSd.padMs
            : 400,
      },
    },
  };
  return next;
}

function migrateV6ToV7(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, version: 7 };
}

function migrateV8ToV9(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, version: 9 };
}

function migrateV9ToV10(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, version: 10 };
}

function migrateV10ToV11(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, version: 11, tenantId: input.tenantId ?? 'local' };
}

function migrateV7ToV8(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 8 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingSec =
    (settings.security as Record<string, unknown> | undefined) ?? undefined;
  const lock = existingSec?.idleLockMinutes;
  next.settings = {
    ...settings,
    security: {
      idleLockMinutes:
        typeof lock === 'number' && lock >= 0 && lock <= 120 ? Math.floor(lock) : 10,
    },
  };
  return next;
}

function migrateV5ToV6(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 6 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingAudio = (settings.audio as Record<string, unknown> | undefined) ?? {};
  const existingSu =
    (existingAudio.speedUp as Record<string, unknown> | undefined) ?? undefined;

  next.settings = {
    ...settings,
    audio: {
      ...existingAudio,
      speedUp: {
        enabled: typeof existingSu?.enabled === 'boolean' ? existingSu.enabled : false,
        speed:
          existingSu?.speed === 1.25 || existingSu?.speed === 1.5 || existingSu?.speed === 1.75
            ? existingSu.speed
            : 1.5,
      },
    },
  };
  return next;
}
