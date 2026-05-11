import { describe, expect, it, vi } from 'vitest';
import { migrate, CURRENT_VERSION } from './migrations';
import { AppDataSchema, defaultAppData } from '@/schemas';
import { UNASSIGNED_PATIENT_ID } from '@/types';

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
  it('returns data as-is when version is newer than CURRENT_VERSION', () => {
    const data = { ...defaultAppData(), version: CURRENT_VERSION + 1 };
    const result = migrate(data);
    expect(result.version).toBe(CURRENT_VERSION + 1);
  });

  it('logs a warning when data version is newer than CURRENT_VERSION', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const data = { ...defaultAppData(), version: CURRENT_VERSION + 1 };
      migrate(data);
      expect(warnSpy).toHaveBeenCalledOnce();
      const warnMsg = warnSpy.mock.calls[0][0] as string;
      expect(warnMsg).toContain(`${CURRENT_VERSION + 1}`);
      expect(warnMsg).toContain('newer than');
    } finally {
      warnSpy.mockRestore();
    }
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
    ((data.settings as Record<string, unknown>).ai as Record<string, unknown>).transcription = {
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
      (t) =>
        t.name === 'Premium Prompt 1' &&
        (t as unknown as Record<string, unknown>)['builtin'] === true,
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

    expect(result.version).toBe(CURRENT_VERSION);
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

    expect(result.version).toBe(CURRENT_VERSION);
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

function v7AppData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  return {
    ...seed,
    version: 7,
    settings: {
      ...seed.settings,
      // Strip the v8 security block to simulate persisted v7 data.
      security: undefined,
    } as unknown,
    ...overrides,
  };
}

function v8AppData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  // Strip the v9-introduced field to simulate persisted v8 clinician.
  const clinicianSansAck = { ...seed.clinician };
  delete (clinicianSansAck as { acknowledgedDisclosureAt?: number }).acknowledgedDisclosureAt;
  return {
    ...seed,
    version: 8,
    clinician: clinicianSansAck,
    ...overrides,
  };
}

describe('migrate v7 → v8', () => {
  it('injects default security.idleLockMinutes (10) when missing', () => {
    const result = migrate(v7AppData());
    expect(result.settings.security).toEqual({ idleLockMinutes: 10 });
  });

  it('preserves an existing idleLockMinutes value when provided', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 7,
      settings: {
        ...seed.settings,
        security: { idleLockMinutes: 30 },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.security.idleLockMinutes).toBe(30);
  });

  it('clamps an out-of-range idleLockMinutes back to default', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 7,
      settings: {
        ...seed.settings,
        security: { idleLockMinutes: 9999 },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.security.idleLockMinutes).toBe(10);
  });

  it('produces output that satisfies AppDataSchema', () => {
    const result = migrate(v7AppData());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

describe('migrate v8 → v9', () => {
  it('leaves clinician.acknowledgedDisclosureAt absent for legacy data', () => {
    const result = migrate(v8AppData());
    expect(result.clinician.acknowledgedDisclosureAt).toBeUndefined();
  });

  it('preserves acknowledgedDisclosureAt when already present', () => {
    const result = migrate(
      v8AppData({
        clinician: { ...defaultAppData().clinician, acknowledgedDisclosureAt: 1700000000000 },
      }),
    );
    expect(result.clinician.acknowledgedDisclosureAt).toBe(1700000000000);
  });

  it('produces output that satisfies AppDataSchema', () => {
    const result = migrate(v8AppData());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

describe('migrate v5 → v6', () => {
  it('injects default audio.speedUp (disabled, 1.25×) when missing', () => {
    const data = v5AppData();
    const result = migrate(data);

    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.settings.audio.speedUp).toEqual({ enabled: false, speed: 1.25 });
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

function v12AppData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = defaultAppData();
  // Strip the v13-only slices so we test that the migration adds them.
  const settings = { ...seed.settings } as Record<string, unknown>;
  delete settings.recordingLimits;
  delete settings.orgPolicy;
  delete settings.firstRun;
  return {
    ...seed,
    version: 12,
    settings,
    ...overrides,
  };
}

describe('migrate v12 → v13', () => {
  it('seeds default recordingLimits when missing', () => {
    const result = migrate(v12AppData());
    expect(result.settings.recordingLimits).toEqual({
      softWarnAtMinutes: 75,
      maxMinutes: 90,
      idleAutoStopMinutes: 10,
    });
  });

  it('seeds default orgPolicy.toneStyle to narrative', () => {
    const result = migrate(v12AppData());
    expect(result.settings.orgPolicy.toneStyle).toBe('narrative');
    expect(result.settings.orgPolicy.activeTemplateId).toBeUndefined();
  });

  it('seeds an empty firstRun block', () => {
    const result = migrate(v12AppData());
    expect(result.settings.firstRun).toEqual({});
  });

  it('preserves an existing recordingLimits block within bounds', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        recordingLimits: {
          softWarnAtMinutes: 30,
          maxMinutes: 60,
          idleAutoStopMinutes: 0,
        },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.recordingLimits).toEqual({
      softWarnAtMinutes: 30,
      maxMinutes: 60,
      idleAutoStopMinutes: 0,
    });
  });

  it('clamps out-of-range recordingLimits to defaults', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        recordingLimits: {
          softWarnAtMinutes: 5, // below min
          maxMinutes: 999, // above max
          idleAutoStopMinutes: -3, // below min
        },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.recordingLimits).toEqual({
      softWarnAtMinutes: 75,
      maxMinutes: 90,
      idleAutoStopMinutes: 10,
    });
  });

  it('preserves an existing orgPolicy with valid tone and template id', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        orgPolicy: { activeTemplateId: 'tpl-123', toneStyle: 'terse' },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.orgPolicy).toEqual({
      activeTemplateId: 'tpl-123',
      toneStyle: 'terse',
    });
  });

  it('falls back to narrative tone when an unknown style is encountered', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        orgPolicy: { toneStyle: 'colloquial' },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.orgPolicy.toneStyle).toBe('narrative');
  });

  it('preserves an existing firstRun block', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        firstRun: {
          role: 'owner',
          onboardingDoneAt: 1700000000000,
          disclosureVersion: 1,
          onboardingUrlConsumed: true,
        },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.firstRun).toEqual({
      role: 'owner',
      onboardingDoneAt: 1700000000000,
      disclosureVersion: 1,
      onboardingUrlConsumed: true,
    });
  });

  it('drops an invalid firstRun.role value', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        firstRun: { role: 'admin' },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.firstRun.role).toBeUndefined();
  });

  it('produces output that passes AppDataSchema.safeParse', () => {
    const result = migrate(v12AppData());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

// ─── Migration robustness: missing-fields at boundary ───────────────────────

/**
 * v10 → v11: adds tenantId. Test with an object that has no tenantId at all.
 */
describe('migrate v10 → v11: missing-fields robustness', () => {
  function v10Minimal(): Record<string, unknown> {
    const seed = defaultAppData();
    // Remove tenantId to simulate data that never had it.
    const { tenantId: _t, ...rest } = seed as unknown as Record<string, unknown>;
    void _t;
    return { ...rest, version: 10 };
  }

  it('does not throw when tenantId is absent', () => {
    expect(() => migrate(v10Minimal())).not.toThrow();
  });

  it("defaults tenantId to 'local' when absent", () => {
    const result = migrate(v10Minimal());
    expect(result.tenantId).toBe('local');
  });

  it('preserves an existing tenantId', () => {
    const data = { ...v10Minimal(), tenantId: 'org-abc' };
    const result = migrate(data);
    expect(result.tenantId).toBe('org-abc');
  });

  it('does not throw when tenantId is null (corrupt)', () => {
    const data = { ...v10Minimal(), tenantId: null };
    expect(() => migrate(data)).not.toThrow();
  });

  it('produces output that passes AppDataSchema.safeParse', () => {
    const result = migrate(v10Minimal());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

/**
 * v11 → v12: adds settings.session.autoFinish + seeds Unassigned patient.
 * Test with settings that have no session block and patients array that is missing.
 */
describe('migrate v11 → v12: missing-fields robustness', () => {
  function v11Minimal(): Record<string, unknown> {
    const seed = defaultAppData();
    const settings = { ...(seed.settings as unknown as Record<string, unknown>) } as Record<string, unknown>;
    delete settings.session;
    return {
      ...seed,
      version: 11,
      settings,
      // Also remove patients to ensure it seeds Unassigned even from empty array.
      patients: [],
    };
  }

  it('does not throw when settings.session is absent', () => {
    expect(() => migrate(v11Minimal())).not.toThrow();
  });

  it('defaults autoFinish to false when settings.session is absent', () => {
    const result = migrate(v11Minimal());
    expect(result.settings.session.autoFinish).toBe(false);
  });

  it('seeds the Unassigned patient when patients array is empty', () => {
    const result = migrate(v11Minimal());
    const unassigned = result.patients.find(
      (p) => p.id === UNASSIGNED_PATIENT_ID,
    );
    expect(unassigned).toBeDefined();
    expect(unassigned?.firstName).toBe('Unassigned');
  });

  it('does not duplicate the Unassigned patient when already present', () => {
    const base = v11Minimal();
    const now = Date.now();
    (base.patients as Record<string, unknown>[]).push({
      id: UNASSIGNED_PATIENT_ID,
      firstName: 'Unassigned',
      lastName: '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const result = migrate(base);
    const count = result.patients.filter((p) => p.id === UNASSIGNED_PATIENT_ID).length;
    expect(count).toBe(1);
  });

  it('does not throw when patients is null (corrupt)', () => {
    const base = { ...v11Minimal(), patients: null };
    expect(() => migrate(base)).not.toThrow();
  });

  it('seeds Unassigned patient even when patients field is null (corrupt)', () => {
    const base = { ...v11Minimal(), patients: null };
    const result = migrate(base);
    const unassigned = result.patients.find(
      (p) => p.id === UNASSIGNED_PATIENT_ID,
    );
    expect(unassigned).toBeDefined();
  });

  it('produces output that passes AppDataSchema.safeParse', () => {
    const result = migrate(v11Minimal());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

/**
 * v12 → v13: adds recordingLimits, orgPolicy, firstRun.
 * Test with settings that have all three blocks missing (already covered above)
 * plus null values on each field.
 */
describe('migrate v12 → v13: null/corrupt field robustness', () => {
  it('does not throw when recordingLimits fields are null', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        recordingLimits: {
          softWarnAtMinutes: null,
          maxMinutes: null,
          idleAutoStopMinutes: null,
        },
      } as unknown,
    };
    expect(() => migrate(data)).not.toThrow();
  });

  it('falls back to defaults when recordingLimits fields are null', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        recordingLimits: {
          softWarnAtMinutes: null,
          maxMinutes: null,
          idleAutoStopMinutes: null,
        },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.recordingLimits).toEqual({
      softWarnAtMinutes: 75,
      maxMinutes: 90,
      idleAutoStopMinutes: 10,
    });
  });

  it('does not throw when orgPolicy.toneStyle is null', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        orgPolicy: { toneStyle: null, activeTemplateId: null },
      } as unknown,
    };
    expect(() => migrate(data)).not.toThrow();
  });

  it('falls back to narrative toneStyle when value is null', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        orgPolicy: { toneStyle: null },
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.orgPolicy.toneStyle).toBe('narrative');
  });

  it('does not throw when firstRun is null', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        firstRun: null,
      } as unknown,
    };
    expect(() => migrate(data)).not.toThrow();
  });

  it('produces an empty firstRun object when the field is null (corrupt)', () => {
    const seed = defaultAppData();
    const data: Record<string, unknown> = {
      ...seed,
      version: 12,
      settings: {
        ...seed.settings,
        firstRun: null,
      } as unknown,
    };
    const result = migrate(data);
    expect(result.settings.firstRun).toEqual({});
  });
});

// ─── Chain-migration robustness ──────────────────────────────────────────────

describe('full chain migration from v1', () => {
  it('migrates v1 data all the way to CURRENT_VERSION without throwing', () => {
    expect(() => migrate(v1AppData())).not.toThrow();
  });

  it('produces CURRENT_VERSION output from v1 data', () => {
    const result = migrate(v1AppData());
    expect(result.version).toBe(CURRENT_VERSION);
  });

  it('produces schema-valid output from v1 data', () => {
    const result = migrate(v1AppData());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

describe('full chain migration from v5', () => {
  function v5Minimal(): Record<string, unknown> {
    const seed = defaultAppData();
    return {
      ...seed,
      version: 5,
      settings: {
        ...seed.settings,
        // Strip fields added in later migrations to simulate genuine v5 data.
        audio: { silenceDetection: seed.settings.audio.silenceDetection },
        security: undefined,
        session: undefined,
        recordingLimits: undefined,
        orgPolicy: undefined,
        firstRun: undefined,
      } as unknown,
      tenantId: undefined,
      patients: [],
    };
  }

  it('migrates v5 data all the way to CURRENT_VERSION without throwing', () => {
    expect(() => migrate(v5Minimal())).not.toThrow();
  });

  it('produces CURRENT_VERSION output from v5 data', () => {
    const result = migrate(v5Minimal());
    expect(result.version).toBe(CURRENT_VERSION);
  });

  it('produces schema-valid output from v5 data', () => {
    const result = migrate(v5Minimal());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});

describe('full chain migration from v9', () => {
  function v9Minimal(): Record<string, unknown> {
    const seed = defaultAppData();
    return {
      ...seed,
      version: 9,
      // Omit tenantId, session settings, and v13 slices to simulate genuine v9 data.
      settings: {
        ...seed.settings,
        session: undefined,
        recordingLimits: undefined,
        orgPolicy: undefined,
        firstRun: undefined,
      } as unknown,
      tenantId: undefined,
      patients: [],
    };
  }

  it('migrates v9 data all the way to CURRENT_VERSION without throwing', () => {
    expect(() => migrate(v9Minimal())).not.toThrow();
  });

  it('produces CURRENT_VERSION output from v9 data', () => {
    const result = migrate(v9Minimal());
    expect(result.version).toBe(CURRENT_VERSION);
  });

  it('produces schema-valid output from v9 data', () => {
    const result = migrate(v9Minimal());
    expect(AppDataSchema.safeParse(result).success).toBe(true);
  });
});
