import { describe, expect, it } from 'vitest';
import { generateRecoveryCode, normalizeRecoveryCode } from './recoveryCode';

describe('generateRecoveryCode', () => {
  it('produces 8 groups of 4 from the unambiguous alphabet', () => {
    const code = generateRecoveryCode();
    const groups = code.split('-');
    expect(groups).toHaveLength(8);
    for (const g of groups) expect(g).toHaveLength(4);
    // No ambiguous characters in the display form.
    expect(code).not.toMatch(/[ILOU]/);
    // 32 alphabet chars = 160 bits of entropy.
    expect(code.replace(/-/g, '')).toHaveLength(32);
  });

  it('is different on each call', () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });
});

describe('normalizeRecoveryCode', () => {
  it('strips separators and uppercases', () => {
    expect(normalizeRecoveryCode('9f3k-7t2m')).toBe('9F3K7T2M');
    expect(normalizeRecoveryCode('9F3K 7T2M')).toBe('9F3K7T2M');
  });

  it('folds ambiguous characters to canonical digits', () => {
    expect(normalizeRecoveryCode('IO-LO')).toBe('1010');
  });

  it('round-trips a generated code (with or without dashes)', () => {
    const code = generateRecoveryCode();
    const canonical = code.replace(/-/g, '');
    expect(normalizeRecoveryCode(code)).toBe(canonical);
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(canonical);
  });
});
