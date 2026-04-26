import { describe, expect, it } from 'vitest';
import { migrate } from './migrations';
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

describe('migrate v2 → v3', () => {
  it('converts a session with audioRef into a single ready clip', () => {
    const data = v2AppData({
      sessions: [{ ...baseV2Session, audioRef: 'session-1' }],
    });

    const result = migrate(data);

    expect(result.version).toBe(3);
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
