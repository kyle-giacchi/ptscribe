import { describe, expect, it } from 'vitest';
import { AppDataSchema, defaultAppData } from './index';

describe('AppDataSchema', () => {
  it('parses the default AppData', () => {
    const result = AppDataSchema.safeParse(defaultAppData());
    expect(result.success).toBe(true);
  });

  it('rejects invalid version', () => {
    const bad = { ...defaultAppData(), version: 999 };
    expect(AppDataSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a patient with the expected shape', () => {
    const data = defaultAppData();
    const now = Date.now();
    const ok = {
      ...data,
      patients: [
        {
          id: crypto.randomUUID(),
          firstName: 'Alex',
          lastName: 'Rivera',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    expect(AppDataSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects a patient without required fields', () => {
    const data = defaultAppData();
    const bad = {
      ...data,
      patients: [{ id: 'p1', firstName: 'No last name' }],
    };
    expect(AppDataSchema.safeParse(bad).success).toBe(false);
  });

  it('seeds at least one built-in template and several built-in exercises', () => {
    const seed = defaultAppData();
    expect(seed.templates.some((t) => t.builtin)).toBe(true);
    expect(seed.exercises.filter((e) => e.builtin).length).toBeGreaterThan(5);
  });
});
