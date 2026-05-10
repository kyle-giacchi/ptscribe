import { describe, expect, it } from 'vitest';
import { labelForType, shortLabelForType } from './labels';

describe('shortLabelForType', () => {
  it('returns "Initial Eval" for evaluation', () => {
    expect(shortLabelForType('evaluation')).toBe('Initial Eval');
  });

  it('returns "Follow-up" for follow_up', () => {
    expect(shortLabelForType('follow_up')).toBe('Follow-up');
  });

  it('returns "Progress" for progress', () => {
    expect(shortLabelForType('progress')).toBe('Progress');
  });

  it('returns "Discharge" for discharge', () => {
    expect(shortLabelForType('discharge')).toBe('Discharge');
  });

  it('returns the raw string for an unrecognised type', () => {
    expect(shortLabelForType('custom_type')).toBe('custom_type');
    expect(shortLabelForType('')).toBe('');
  });
});

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
