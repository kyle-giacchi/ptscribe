import { describe, expect, it } from 'vitest';
import { migrate, CURRENT_VERSION } from './migrations';
import { AppDataSchema, defaultAppData } from '@/schemas';

const baseV2Session = {
  id: 'session-1',
  patientId: 'patient-1',
  type: 'follow_up',
  date: 1700000000000,
  status: 'draft',
  durationMin: 12,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

function v2AppData(overrides: Partial<{ sessions: unknown[] }> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  return {
    ...seed,
    version: 2,
    sessions: overrides.sessions ?? [],
  };
}

function v1AppData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  return {
    ...seed,
    version: 1,
    settings: {
      ...seed.settings,
      ai: {
        ...seed.settings.ai,
        transcription: { provider: 'openai', apiKey: 'sk-old-key', model: 'whisper-1' },
      },
      audio: undefined,
    } as unknown,
    ...overrides,
  };
}

function v3AppData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  return {
    ...seed,
    version: 3,
    settings: {
      ...seed.settings,
      ai: {
        ...seed.settings.ai,
        transcription: {
          ...seed.settings.ai.transcription,
          model: '@cf/openai/whisper-large-v3-turbo',
        },
      },
      audio: undefined,
    } as unknown,
    templates: (seed.templates as unknown as Record<string, unknown>[]).filter(
      (t) => t['name'] !== 'Premium Prompt 1',
    ),
    ...overrides,
  };
}

describe('migrate: future-version guard', () => {
  it('throws when data version is newer than CURRENT_VERSION', () => {
    const data = { ...defaultAppData(), version: CURRENT_VERSION + 1 };
    expect(() => migrate(data)).toThrow(
      `data version ${CURRENT_VERSION + 1} is newer than CURRENT_VERSION`,
    );
  });

  it('throws when data has no version field', () => {
    const { version: _v, ...noVersion } = defaultAppData();
    expect(() => migrate(noVersion as unknown)).toThrow('data has no numeric version field');
  });
});

describe('migrate v1 → v2', () => {
  it('replaces openai provider with webspeech', () => {
    const result = migrate(v1AppData());
    expect(result.settings.ai.transcription.provider).toBe('webspeech');
  });

  it('removes the apiKey from transcription settings', () => {
    const result = migrate(v1AppData());
    expect((result.settings.ai.transcription as Record<string, unknown>).apiKey).toBeUndefined();
  });

  it('resets whisper-1 model to a current CF model', () => {
    const result = migrate(v1AppData());
    expect(result.settings.ai.transcription.model).toBeTruthy();
    expect(result.settings.ai.transcription.model).not.toBe('whisper-1');
  });

  it('preserves a non-openai provider unchanged', () => {
    const data = v1AppData();
    (data.settings as Record<string, unknown>).ai = {
      ...((data.settings as Record<string, unknown>).ai as Record<string, unknown>),
      transcription: { provider: 'webspeech', model: 'default' },
    };
    const result = migrate(data);
    expect(result.settings.ai.transcription.provider).toBe('webspeech');
  });

  it('produces output that satisfies AppDataSchema', () => {
    const result = migrate(v1AppData());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

describe('migrate v3 → v4', () => {
  it('replaces whisper-large-v3-turbo model with nova-3', () => {
    const result = migrate(v3AppData());
    expect(result.settings.ai.transcription.model).toBe('@cf/deepgram/nova-3');
  });

  it('preserves a non-turbo custom model override', () => {
    const data = v3AppData();
    (
      (data.settings as Record<string, unknown>).ai as Record<string, unknown>
    ).transcription = {
      ...(((data.settings as Record<string, unknown>).ai as Record<string, unknown>)
        .transcription as Record<string, unknown>),
      model: '@cf/openai/whisper-sherpa',
    };
    const result = migrate(data);
    expect(result.settings.ai.transcription.model).toBe('@cf/openai/whisper-sherpa');
  });

  it('backfills the Premium Prompt 1 built-in template when missing', () => {
    const result = migrate(v3AppData());
    const hasPremium1 = result.templates.some(
      (t) => t.name === 'Premium Prompt 1' && (t as unknown as Record<string, unknown>)['builtin'] === true,
    );
    expect(hasPremium1).toBe(true);
  });

  it('does not duplicate Premium Prompt 1 if already present', () => {
    const base = v3AppData();
    const seed = defaultAppData();
    const premium1 = seed.templates.find((t) => t.name === 'Premium Prompt 1');
    if (premium1) {
      (base.templates as unknown[]).push(premium1);
    }
    const result = migrate(base);
    const count = result.templates.filter((t) => t.name === 'Premium Prompt 1').length;
    expect(count).toBe(1);
  });

  it('produces output that satisfies AppDataSchema', () => {
    const result = migrate(v3AppData());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

describe('migrate v2 → v3', () => {
  it('converts a session with audioRef into a single ready clip', () => {
    const data = v2AppData({
      sessions: [{ ...baseV2Session, audioRef: 'session-1' }],
    });

    const result = migrate(data);

    expect(result.version).toBe(7);
    expect(result.sessions).toHaveLength(1);
    const session = result.sessions[0];
    expect((session as { audioRef?: unknown }).audioRef).toBeUndefined();
    expect(session.clips).toEqual([
      {
        id: 'session-1',
        index: 0,
        durationSec: 720,
        status: 'ready',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
    ]);
  });

  it('marks a clip transcribed when the migrated session already has transcript text', () => {
    const data = v2AppData({
      sessions: [
        {
          ...baseV2Session,
          audioRef: 'session-1',
          transcript: 'Patient reports left knee pain.',
        },
      ],
    });

    const result = migrate(data);

    expect(result.sessions[0].clips[0].status).toBe('transcribed');
    expect(result.sessions[0].clips[0].transcript).toBe('Patient reports left knee pain.');
    expect(result.sessions[0].clips[0].transcriptedAt).toBe(baseV2Session.updatedAt);
  });

  it('emits an empty clips array when the session never had audio', () => {
    const data = v2AppData({
      sessions: [{ ...baseV2Session }],
    });

    const result = migrate(data);

    expect(result.sessions[0].clips).toEqual([]);
  });

  it('produces output that satisfies the v3 schema', () => {
    const data = v2AppData({
      sessions: [
        { ...baseV2Session, audioRef: 'session-1', transcript: 'Hello.' },
        { ...baseV2Session, id: 'session-2', audioRef: undefined },
      ],
    });

    const result = migrate(data);
    const parsed = AppDataSchema.safeParse(result);

    expect(parsed.success).toBe(true);
  });
});

function v4AppData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  return {
    ...seed,
    version: 4,
    settings: {
      ...seed.settings,
      // Strip the v5/v6 audio block to simulate persisted v4 data.
      audio: undefined,
    } as unknown,
    ...overrides,
  };
}

function v5AppData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  return {
    ...seed,
    version: 5,
    settings: {
      ...seed.settings,
      // Strip speedUp to simulate persisted v5 data (no speedUp field yet).
      audio: { silenceDetection: seed.settings.audio.silenceDetection },
    } as unknown,
    ...overrides,
  };
}

describe('migrate v4 → v5', () => {
  it('injects default audio.silenceDetection (disabled) when missing', () => {
    const data = v4AppData();
    const result = migrate(data);

    expect(result.version).toBe(7);
    expect(result.settings.audio.silenceDetection).toEqual({
      enabled: false,
      sensitivity: 'medium',
      padMs: 400,
    });
  });

  it('preserves an existing audio.silenceDetection block if one is somehow present', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 4,
      settings: {
        ...seed.settings,
        audio: { silenceDetection: { enabled: true, sensitivity: 'high', padMs: 600 } },
      } as unknown,
    };

    const result = migrate(data);
    expect(result.settings.audio.silenceDetection).toEqual({
      enabled: true,
      sensitivity: 'high',
      padMs: 600,
    });
  });

  it('produces output that passes AppDataSchema.safeParse', () => {
    const data = v4AppData();
    const result = migrate(data);
    const parsed = AppDataSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('migrate v5 → v6', () => {
  it('injects default audio.speedUp (disabled, 1.5×) when missing', () => {
    const data = v5AppData();
    const result = migrate(data);

    expect(result.version).toBe(7);
    expect(result.settings.audio.speedUp).toEqual({ enabled: false, speed: 1.5 });
  });

  it('preserves an existing audio.speedUp block if one is somehow present', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 5,
      settings: {
        ...seed.settings,
        audio: {
          silenceDetection: seed.settings.audio.silenceDetection,
          speedUp: { enabled: true, speed: 1.75 },
        },
      } as unknown,
    };

    const result = migrate(data);
    expect(result.settings.audio.speedUp).toEqual({ enabled: true, speed: 1.75 });
  });

  it('preserves silenceDetection through the v5→v6 migration', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 5,
      settings: {
        ...seed.settings,
        audio: { silenceDetection: { enabled: true, sensitivity: 'high', padMs: 600 } },
      } as unknown,
    };

    const result = migrate(data);
    expect(result.settings.audio.silenceDetection).toEqual({
      enabled: true,
      sensitivity: 'high',
      padMs: 600,
    });
  });

  it('produces output that passes AppDataSchema.safeParse', () => {
    const data = v5AppData();
    const result = migrate(data);
    const parsed = AppDataSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
