import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkGateCode,
  checkStoredGateHash,
  getStoredGateHash,
  storeGateCode,
  clearGateCode,
} from './gate';

beforeEach(() => localStorage.clear());

describe('checkGateCode', () => {
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

describe('getStoredGateHash', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredGateHash()).toBeNull();
  });

  it('returns the stored hash when it is valid 64-char hex', () => {
    const hash = 'e0bc60c82713f64ef8a57c0c40d02ce24fd0141d5cc3086259c19b1e62a62bea';
    localStorage.setItem('ptnotes.gate', hash);
    expect(getStoredGateHash()).toBe(hash);
  });

  it('returns null when stored value is not 64-char hex', () => {
    localStorage.setItem('ptnotes.gate', 'bad');
    expect(getStoredGateHash()).toBeNull();
  });

  it('returns null when stored value contains non-hex characters', () => {
    localStorage.setItem('ptnotes.gate', 'g'.repeat(64));
    expect(getStoredGateHash()).toBeNull();
  });
});

describe('checkStoredGateHash', () => {
  it('returns false for an all-zeros hash', () => {
    expect(checkStoredGateHash('0'.repeat(64))).toBe(false);
  });

  it('returns false for a random hex string', () => {
    expect(checkStoredGateHash('abcd'.repeat(16))).toBe(false);
  });
});

describe('storeGateCode / clearGateCode', () => {
  it('stores a hash (64-char hex) for any valid 6-digit code', async () => {
    await storeGateCode('999999');
    const hash = getStoredGateHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('clearGateCode removes the stored hash', async () => {
    await storeGateCode('999999');
    clearGateCode();
    expect(getStoredGateHash()).toBeNull();
  });

  it('two different codes produce different hashes', async () => {
    await storeGateCode('111111');
    const h1 = getStoredGateHash();
    await storeGateCode('222222');
    const h2 = getStoredGateHash();
    expect(h1).not.toBe(h2);
  });
});
