import { describe, it, expect } from 'vitest';
import { buildDevSeed } from './devSeed';
import { AppDataSchema } from '@/schemas';
import { defaultAppData } from '@/schemas';
import { measureDef } from '@/lib/clinical/measures';

const NOW = 1_770_000_000_000;

describe('buildDevSeed', () => {
  const seed = buildDevSeed(NOW);

  it('seeds five patients', () => {
    expect(seed.patients).toHaveLength(5);
  });

  it('produces ids that are stable across builds, so re-seeding is a no-op', () => {
    const again = buildDevSeed(NOW);
    expect(again.patients.map((p) => p.id)).toEqual(seed.patients.map((p) => p.id));
    expect(again.measurements.map((m) => m.id)).toEqual(seed.measurements.map((m) => m.id));
  });

  it('has no duplicate ids across any slice', () => {
    for (const [name, rows] of Object.entries(seed)) {
      const ids = (rows as { id: string }[]).map((r) => r.id);
      expect(new Set(ids).size, `${name} has duplicate ids`).toBe(ids.length);
    }
  });

  it('references only real patients and sessions', () => {
    const pids = new Set(seed.patients.map((p) => p.id));
    const sids = new Set(seed.sessions.map((s) => s.id));
    for (const s of seed.sessions) expect(pids.has(s.patientId)).toBe(true);
    for (const n of seed.notes) {
      expect(pids.has(n.patientId)).toBe(true);
      expect(sids.has(n.sessionId)).toBe(true);
    }
    for (const p of seed.plans) expect(pids.has(p.patientId)).toBe(true);
    for (const m of seed.measurements) {
      expect(pids.has(m.patientId)).toBe(true);
      if (m.sessionId) expect(sids.has(m.sessionId)).toBe(true);
    }
  });

  it('keeps every measurement inside its catalog range', () => {
    for (const m of seed.measurements) {
      const def = measureDef(m.measureId);
      expect(m.value, `${m.measureId} = ${m.value}`).toBeGreaterThanOrEqual(def.min);
      expect(m.value, `${m.measureId} = ${m.value}`).toBeLessThanOrEqual(def.max);
    }
  });

  it('dates every record in the past', () => {
    for (const s of seed.sessions) expect(s.date).toBeLessThanOrEqual(NOW);
    for (const m of seed.measurements) expect(m.takenAt).toBeLessThanOrEqual(NOW);
  });

  it('leaves exactly two visits unsigned, so the Unsigned filter has something to show', () => {
    expect(seed.notes.filter((n) => !n.finalized)).toHaveLength(2);
  });

  it('validates against AppDataSchema — the seed goes through the same save path as real data', () => {
    const result = AppDataSchema.safeParse({ ...defaultAppData(), ...seed });
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true);
  });
});
