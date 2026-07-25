import { describe, it, expect } from 'vitest';
import { AppDataSchema, defaultAppData } from './index';
import type { Note } from '@/types';

function baseNote(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    sessionId: 's1',
    patientId: 'p1',
    format: 'soap',
    sections: [],
    finalized: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('Note.activities schema', () => {
  it('accepts a note with no activities field (existing stored data)', () => {
    const data = { ...defaultAppData(), notes: [baseNote()] };
    expect(AppDataSchema.safeParse(data).success).toBe(true);
  });

  it('accepts a note with populated activities', () => {
    const data = {
      ...defaultAppData(),
      notes: [
        baseNote({
          activities: {
            performed: [{ id: 'a1', exerciseId: 'e1', dosage: '2x10', exerciseName: 'Pendulums' }],
            home: [
              {
                id: 'a2',
                exerciseId: 'e2',
                dosage: '3x30s, daily',
                notes: 'stop if sharp pain',
                exerciseName: 'Sleeper Stretch',
              },
            ],
          },
        }),
      ],
    };
    expect(AppDataSchema.safeParse(data).success).toBe(true);
  });

  it('rejects an activity entry missing exerciseName', () => {
    const data = {
      ...defaultAppData(),
      notes: [
        baseNote({
          activities: {
            performed: [{ id: 'a1', exerciseId: 'e1', dosage: '2x10' }],
            home: [],
          },
        } as unknown as Partial<Note>),
      ],
    };
    expect(AppDataSchema.safeParse(data).success).toBe(false);
  });
});
