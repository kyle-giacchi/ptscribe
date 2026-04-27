import { describe, expect, it } from 'vitest';
import { labelForType } from './labels';

describe('labelForType', () => {
  it('returns "Initial Evaluation" for evaluation', () => {
    expect(labelForType('evaluation')).toBe('Initial Evaluation');
  });

  it('returns "Progress note" for progress', () => {
    expect(labelForType('progress')).toBe('Progress note');
  });

  it('returns "Discharge" for discharge', () => {
    expect(labelForType('discharge')).toBe('Discharge');
  });

  it('returns "Follow-up" for follow_up', () => {
    expect(labelForType('follow_up')).toBe('Follow-up');
  });

  it('falls through to "Follow-up" for unknown strings', () => {
    expect(labelForType('anything_else')).toBe('Follow-up');
    expect(labelForType('')).toBe('Follow-up');
  });
});
