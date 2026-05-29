import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, GENESIS_HASH } from './auditLog';
import { STORAGE_KEYS } from '@/lib/storageKeys';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('auditLog.append / read', () => {
  it('starts empty', () => {
    expect(auditLog.read()).toHaveLength(0);
  });

  it('appends entries with incrementing seq numbers', async () => {
    await auditLog.append('vault:unlocked');
    await auditLog.append('vault:locked');
    const entries = auditLog.read();
    expect(entries).toHaveLength(2);
    expect(entries[0].seq).toBe(1);
    expect(entries[1].seq).toBe(2);
  });

  it('records the correct action', async () => {
    await auditLog.append('backup:exported');
    expect(auditLog.read()[0].action).toBe('backup:exported');
  });

  it('first entry prevHash is the genesis hash', async () => {
    await auditLog.append('vault:unlocked');
    expect(auditLog.read()[0].prevHash).toBe(GENESIS_HASH);
  });
});

describe('auditLog.verify', () => {
  it('returns valid=true, truncated=false for an empty log', async () => {
    const result = await auditLog.verify();
    expect(result).toEqual({ valid: true, truncated: false });
  });

  it('returns valid=true for an intact chain', async () => {
    await auditLog.append('vault:unlocked');
    await auditLog.append('backup:exported');
    await auditLog.append('vault:locked');
    const result = await auditLog.verify();
    expect(result.valid).toBe(true);
    expect(result.tamperedAt).toBeUndefined();
  });

  it('detects tampering when an entry action is modified', async () => {
    await auditLog.append('vault:unlocked');
    await auditLog.append('backup:exported');

    // Tamper: mutate the first entry's action directly in localStorage.
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.auditLog)!);
    raw.entries[0].action = 'data:reset';
    localStorage.setItem(STORAGE_KEYS.auditLog, JSON.stringify(raw));

    const result = await auditLog.verify();
    expect(result.valid).toBe(false);
    // The second entry's prevHash no longer matches the (tampered) first entry.
    expect(result.tamperedAt).toBe(2);
  });

  it('detects tampering when an entry is deleted from the middle', async () => {
    await auditLog.append('vault:unlocked');
    await auditLog.append('backup:exported');
    await auditLog.append('vault:locked');

    // Delete the second entry.
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.auditLog)!);
    raw.entries.splice(1, 1);
    localStorage.setItem(STORAGE_KEYS.auditLog, JSON.stringify(raw));

    const result = await auditLog.verify();
    expect(result.valid).toBe(false);
  });
});

describe('auditLog.clear', () => {
  it('removes all entries', async () => {
    await auditLog.append('vault:unlocked');
    auditLog.clear();
    expect(auditLog.read()).toHaveLength(0);
  });
});
