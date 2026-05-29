import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';
import { auditLog } from '@/lib/audit/auditLog';
import { setActiveProfileId, __resetProfileState } from './profileId';

/**
 * The core ADR-0007 guarantee: data written under one Profile is invisible to
 * another. These tests exercise the plaintext (vault-locked) path — the key
 * scoping is what isolates Profiles; encryption is an independent layer on top.
 */

beforeEach(() => {
  localStorage.clear();
  __resetProfileState();
});

afterEach(() => {
  localStorage.clear();
  __resetProfileState();
});

describe('cross-profile AppData isolation', () => {
  it('writes AppData into the active profile namespace and hides it from others', async () => {
    setActiveProfileId('demo');
    await dataRepository.save(defaultAppData());

    expect(localStorage.getItem('ptnotes.appData:demo')).toBeTruthy();
    expect(localStorage.getItem('ptnotes.appData:test-user')).toBeNull();
    expect(localStorage.getItem('ptnotes.appData')).toBeNull(); // never un-suffixed

    // Switch to a different profile — the demo data must not be readable.
    setActiveProfileId('test-user');
    expect(await dataRepository.load()).toBeNull();

    // Back to demo — the data is intact under its own namespace.
    setActiveProfileId('demo');
    expect(await dataRepository.load()).not.toBeNull();
  });

  it('keeps each profile’s data in a distinct key', async () => {
    setActiveProfileId('user-a');
    await dataRepository.save(defaultAppData());
    setActiveProfileId('user-b');
    await dataRepository.save(defaultAppData());

    expect(localStorage.getItem('ptnotes.appData:user-a')).toBeTruthy();
    expect(localStorage.getItem('ptnotes.appData:user-b')).toBeTruthy();
    expect(localStorage.getItem('ptnotes.appData:user-a')).not.toBe(
      localStorage.getItem('ptnotes.appData:user-b'),
    );
  });
});

describe('cross-profile audit log isolation', () => {
  it('scopes the audit log per profile', async () => {
    setActiveProfileId('demo');
    await auditLog.append('vault:unlocked');
    expect(auditLog.read()).toHaveLength(1);
    expect(localStorage.getItem('ptnotes.auditLog:demo')).toBeTruthy();

    setActiveProfileId('test-user');
    expect(auditLog.read()).toHaveLength(0);
    expect(localStorage.getItem('ptnotes.auditLog:test-user')).toBeNull();
  });
});
