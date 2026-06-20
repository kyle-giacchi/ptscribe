import { describe, it, expect } from 'vitest';
import { migrate } from './migrations';
import { AppDataSchema, defaultAppData } from '@/schemas';

// ─── migrate() guard ──────────────────────────────────────────────────────────

describe('migrate()', () => {
  it('accepts valid v1 data and returns typed AppData', () => {
    const data = defaultAppData();
    const result = migrate(data);
    expect(result.version).toBe(1);
    expect(result.patients).toBeDefined();
    expect(result.sessions).toBeDefined();
  });

  it('throws when version is missing', () => {
    expect(() => migrate({})).toThrow('is not supported');
  });

  it('throws when version is 0', () => {
    expect(() => migrate({ version: 0 })).toThrow('is not supported');
  });

  it('throws when version is 25 (old schema)', () => {
    expect(() => migrate({ version: 25 })).toThrow('is not supported');
  });

  it('throws when version is 2 (future unknown version)', () => {
    expect(() => migrate({ version: 2 })).toThrow('is not supported');
  });

  it('throws when version is 1 but data is structurally invalid', () => {
    expect(() => migrate({ version: 1, clinician: null })).toThrow();
  });
});

// ─── AppDataSchema ────────────────────────────────────────────────────────────

describe('AppDataSchema', () => {
  it('accepts defaultAppData() output without errors', () => {
    const result = AppDataSchema.safeParse(defaultAppData());
    expect(result.success).toBe(true);
  });

  it('rejects data without a version field', () => {
    const { version: _v, ...rest } = defaultAppData();
    const result = AppDataSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects data with version !== 1', () => {
    const result = AppDataSchema.safeParse({ ...defaultAppData(), version: 25 });
    expect(result.success).toBe(false);
  });

  it('rejects data with a missing required field (clinician)', () => {
    const { clinician: _c, ...rest } = defaultAppData();
    const result = AppDataSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects data with a missing required field (settings)', () => {
    const { settings: _s, ...rest } = defaultAppData();
    const result = AppDataSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ─── defaultAppData() ─────────────────────────────────────────────────────────

describe('defaultAppData()', () => {
  it('produces version 1', () => {
    expect(defaultAppData().version).toBe(1);
  });

  it('produces a non-empty templates array (built-ins seeded)', () => {
    expect(defaultAppData().templates.length).toBeGreaterThan(0);
  });

  it('produces a non-empty exercises array (built-ins seeded)', () => {
    expect(defaultAppData().exercises.length).toBeGreaterThan(0);
  });

  it('produces an Unassigned patient', () => {
    const data = defaultAppData();
    expect(data.patients.some((p) => p.id === 'patient:unassigned')).toBe(true);
  });

  it('produces valid settings defaults', () => {
    const { settings } = defaultAppData();
    expect(settings.ui.theme).toBe('light');
    expect(settings.audio.silenceDetection.enabled).toBe(true);
    expect(settings.security.idleLockMinutes).toBe(10);
    expect(settings.recordingLimits.maxMinutes).toBe(90);
  });

  it('produces unique IDs across multiple calls', () => {
    const a = defaultAppData();
    const b = defaultAppData();
    const aTemplateIds = a.templates.map((t) => t.id);
    const bTemplateIds = b.templates.map((t) => t.id);
    expect(aTemplateIds).not.toEqual(bTemplateIds);
  });

  it('produces two fresh calls with identical structure but different IDs', () => {
    const a = defaultAppData();
    const b = defaultAppData();
    expect(a.templates.length).toBe(b.templates.length);
    expect(a.exercises.length).toBe(b.exercises.length);
  });
});
