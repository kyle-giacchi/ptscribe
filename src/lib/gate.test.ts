import { describe, expect, it, beforeEach } from 'vitest';
import { checkGateCode, getStoredGateCode, storeGateCode, clearGateCode } from './gate';

beforeEach(() => localStorage.clear());

describe('checkGateCode', () => {
  it('returns true for the correct 6-digit code', async () => {
    expect(await checkGateCode('112233')).toBe(true);
  });

  it('returns false for a wrong 6-digit code', async () => {
    expect(await checkGateCode('000000')).toBe(false);
  });

  it('returns false for fewer than 6 digits', async () => {
    expect(await checkGateCode('1234')).toBe(false);
  });

  it('returns false for more than 6 digits', async () => {
    expect(await checkGateCode('1122334')).toBe(false);
  });

  it('returns false for letters', async () => {
    expect(await checkGateCode('abcdef')).toBe(false);
  });

  it('returns false for mixed alphanumeric', async () => {
    expect(await checkGateCode('112a33')).toBe(false);
  });
});

describe('getStoredGateCode', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredGateCode()).toBeNull();
  });

  it('returns the stored code when it is a valid 6-digit string', () => {
    localStorage.setItem('ptnotes.gate', '112233');
    expect(getStoredGateCode()).toBe('112233');
  });

  it('returns null when stored value is not 6 digits', () => {
    localStorage.setItem('ptnotes.gate', 'bad');
    expect(getStoredGateCode()).toBeNull();
  });

  it('returns null when stored value contains letters', () => {
    localStorage.setItem('ptnotes.gate', '11223a');
    expect(getStoredGateCode()).toBeNull();
  });
});

describe('storeGateCode / clearGateCode', () => {
  it('stores and retrieves a gate code', () => {
    storeGateCode('112233');
    expect(getStoredGateCode()).toBe('112233');
  });

  it('clearGateCode removes the stored code', () => {
    storeGateCode('112233');
    clearGateCode();
    expect(getStoredGateCode()).toBeNull();
  });
});
