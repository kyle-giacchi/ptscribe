import { APP_DATA_VERSION, UNASSIGNED_PATIENT_ID, type AppData } from '@/types';
import { BUILTIN_TEMPLATES } from '@/lib/clinical/templates';
import { newId } from '@/utils/ids';
import { AppDataSchema } from '@/schemas';

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
 * - v11 → v12: Adds `Settings.session.autoFinish` (default true) and seeds a
 *   built-in "Unassigned" patient row used by quick-record paths.
 * - v12 → v13: Adds `Settings.recordingLimits` (cost guardrails — 75 min soft warn,
 *   90 min hard cap, 10 min idle auto-stop), `Settings.orgPolicy` (active template
 *   id + tone style), and `Settings.firstRun` (role + onboarding state) to support
 *   business-owner persona work. No structural changes to other slices.
 * - v13 → v14: Adds optional `Note.editedAfterFinalizedAt` (ms timestamp of first
 *   post-finalization edit) and `Note.editedAfterFinalizedCount` (number of saves
 *   after finalization) to all existing notes. Both default to absent.
 * - v14 → v15: Adds `Settings.ui.theme` ('system' | 'light' | 'dark'). Defaults to
 *   'system' so existing users inherit OS preference with no visible change.
 * - v15 → v16: Changes default theme from 'system' to 'light'. Existing 'system'
 *   users are migrated to 'light' so the app always shows the designed light palette
 *   instead of picking up an unexpected OS dark mode. Users can still opt in to dark
 *   or system from Settings.
 */
export function migrate(data: unknown): AppData {
  const version = (data as { version?: unknown }).version;
  if (typeof version !== 'number') {
    throw new Error('migrate: data has no numeric version field');
  }
  if (version > CURRENT_VERSION) {
    console.warn(
      `[migrations] Data version ${version} is newer than this app's CURRENT_VERSION ${CURRENT_VERSION}. ` +
        'Loading as-is — some fields may be unrecognised. Upgrade the app to avoid data loss.',
    );
    return data as AppData;
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
  if ((working as { version?: number }).version === 11) {
    working = migrateV11ToV12(working);
  }
  if ((working as { version?: number }).version === 12) {
    working = migrateV12ToV13(working);
  }
  if ((working as { version?: number }).version === 13) {
    working = migrateV13ToV14(working);
  }
  if ((working as { version?: number }).version === 14) {
    working = migrateV14ToV15(working);
  }
  if ((working as { version?: number }).version === 15) {
    working = migrateV15ToV16(working);
  }

  if ((working as { version?: number }).version !== CURRENT_VERSION) {
    throw new Error(`migrate: no migration registered for version ${version}`);
  }

  const parsed = AppDataSchema.safeParse(working);
  if (!parsed.success) {
    throw new Error(
      `Migration to v${CURRENT_VERSION} produced invalid data: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
    );
  }

  return parsed.data;
}

function migrateV1ToV2(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 2 } as Record<string, unknown>;
  const settings = next.settings as
    | { ai?: { transcription?: Record<string, unknown> } }
    | undefined;
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
  const settings = next.settings as
    | { ai?: { transcription?: Record<string, unknown> } }
    | undefined;
  const tx = settings?.ai?.transcription;
  if (tx && tx.model === '@cf/openai/whisper-large-v3-turbo') {
    tx.model = '@cf/deepgram/nova-3';
  }

  const templates = Array.isArray(next.templates)
    ? (next.templates as Record<string, unknown>[])
    : [];
  const hasPremium1 = templates.some((t) => t.builtin === true && t.name === 'Premium Prompt 1');
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
    const audioRef =
      typeof s.audioRef === 'string' && s.audioRef.length > 0 ? s.audioRef : undefined;
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
  const existingAudio = (settings.audio as { silenceDetection?: unknown } | undefined) ?? undefined;
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
          typeof existingSd?.padMs === 'number' && existingSd.padMs >= 0 && existingSd.padMs <= 2000
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

function migrateV12ToV13(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 13 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};

  const existingLimits = (settings.recordingLimits as Record<string, unknown> | undefined) ?? {};
  const softWarn = existingLimits.softWarnAtMinutes;
  const max = existingLimits.maxMinutes;
  const idle = existingLimits.idleAutoStopMinutes;

  const existingOrg = (settings.orgPolicy as Record<string, unknown> | undefined) ?? {};
  const existingTone = existingOrg.toneStyle;
  const existingActive = existingOrg.activeTemplateId;

  const existingFirstRun = (settings.firstRun as Record<string, unknown> | undefined) ?? {};

  next.settings = {
    ...settings,
    recordingLimits: {
      softWarnAtMinutes:
        typeof softWarn === 'number' && softWarn >= 15 && softWarn <= 240
          ? Math.floor(softWarn)
          : 75,
      maxMinutes:
        typeof max === 'number' && max >= 30 && max <= 240 ? Math.floor(max) : 90,
      idleAutoStopMinutes:
        typeof idle === 'number' && idle >= 0 && idle <= 60 ? Math.floor(idle) : 10,
    },
    orgPolicy: {
      ...(typeof existingActive === 'string' && existingActive.length > 0
        ? { activeTemplateId: existingActive }
        : {}),
      toneStyle:
        existingTone === 'narrative' || existingTone === 'terse' || existingTone === 'clinical'
          ? existingTone
          : 'narrative',
    },
    firstRun: {
      ...(typeof existingFirstRun.role === 'string' &&
      (existingFirstRun.role === 'owner' || existingFirstRun.role === 'clinician')
        ? { role: existingFirstRun.role }
        : {}),
      ...(typeof existingFirstRun.onboardingDoneAt === 'number'
        ? { onboardingDoneAt: existingFirstRun.onboardingDoneAt }
        : {}),
      ...(typeof existingFirstRun.disclosureVersion === 'number'
        ? { disclosureVersion: existingFirstRun.disclosureVersion }
        : {}),
      ...(typeof existingFirstRun.onboardingUrlConsumed === 'boolean'
        ? { onboardingUrlConsumed: existingFirstRun.onboardingUrlConsumed }
        : {}),
    },
  };

  return next;
}

function migrateV11ToV12(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 12 } as Record<string, unknown>;

  // 1. session.autoFinish setting (default false).
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingSession = (settings.session as Record<string, unknown> | undefined) ?? undefined;
  next.settings = {
    ...settings,
    session: {
      autoFinish:
        typeof existingSession?.autoFinish === 'boolean' ? existingSession.autoFinish : false,
    },
  };

  // 2. Seed the built-in "Unassigned" patient if absent. Quick-record paths
  // attach sessions to this row so a session can start before a real patient
  // is selected.
  const patients = Array.isArray(next.patients)
    ? (next.patients as Record<string, unknown>[])
    : [];
  if (!patients.some((p) => p.id === UNASSIGNED_PATIENT_ID)) {
    const now = Date.now();
    patients.unshift({
      id: UNASSIGNED_PATIENT_ID,
      firstName: 'Unassigned',
      lastName: '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    next.patients = patients;
  }

  return next;
}

function migrateV7ToV8(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 8 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingSec = (settings.security as Record<string, unknown> | undefined) ?? undefined;
  const lock = existingSec?.idleLockMinutes;
  next.settings = {
    ...settings,
    security: {
      idleLockMinutes: typeof lock === 'number' && lock >= 0 && lock <= 120 ? Math.floor(lock) : 10,
    },
  };
  return next;
}

function migrateV5ToV6(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 6 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingAudio = (settings.audio as Record<string, unknown> | undefined) ?? {};
  const existingSu = (existingAudio.speedUp as Record<string, unknown> | undefined) ?? undefined;

  next.settings = {
    ...settings,
    audio: {
      ...existingAudio,
      speedUp: {
        enabled: typeof existingSu?.enabled === 'boolean' ? existingSu.enabled : false,
        speed:
          existingSu?.speed === 1.25 || existingSu?.speed === 1.5 || existingSu?.speed === 1.75
            ? existingSu.speed
            : 1.25,
      },
    },
  };
  return next;
}

function migrateV13ToV14(input: Record<string, unknown>): Record<string, unknown> {
  // New fields are optional and default to absent — no structural transformation needed.
  // editedAfterFinalizedAt and editedAfterFinalizedCount are written at runtime by
  // NotesProvider when a finalized note is unlocked and then saved.
  return { ...input, version: 14 };
}

function migrateV14ToV15(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 15 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingUi = (settings.ui as Record<string, unknown> | undefined) ?? {};
  const existingTheme = existingUi.theme;
  next.settings = {
    ...settings,
    ui: {
      ...existingUi,
      theme:
        existingTheme === 'system' || existingTheme === 'light' || existingTheme === 'dark'
          ? existingTheme
          : 'light',
    },
  };
  return next;
}

function migrateV15ToV16(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input, version: 16 } as Record<string, unknown>;
  const settings = (next.settings as Record<string, unknown> | undefined) ?? {};
  const existingUi = (settings.ui as Record<string, unknown> | undefined) ?? {};
  next.settings = {
    ...settings,
    ui: {
      ...existingUi,
      theme: existingUi.theme === 'system' ? 'light' : existingUi.theme,
    },
  };
  return next;
}
