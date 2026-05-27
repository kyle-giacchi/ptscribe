import { describe, it, expect } from 'vitest';
import {
  canManageMembers,
  isValidEmail,
  normalizeEmail,
  normalizeInviteRole,
  pickAcceptableInvite,
  type InviteCandidate,
} from './orgLogic';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
  });
});

describe('isValidEmail', () => {
  it('accepts a plausible address', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
  });
  it.each(['', 'no-at', 'a@b', 'a b@c.com', '@b.com'])('rejects %j', (bad) => {
    expect(isValidEmail(bad)).toBe(false);
  });
});

describe('normalizeInviteRole', () => {
  it.each(['admin', 'manager', 'standard', 'student'])('keeps valid role %s', (r) => {
    expect(normalizeInviteRole(r)).toBe(r);
  });
  it('never yields owner — even if asked', () => {
    expect(normalizeInviteRole('owner')).toBe('standard');
  });
  it.each([undefined, '', 'superuser', 'STANDARD'])('coerces %j to standard', (r) => {
    expect(normalizeInviteRole(r as string | undefined)).toBe('standard');
  });
});

describe('canManageMembers (server-side role gate)', () => {
  it.each(['owner', 'admin'])('allows %s', (r) => {
    expect(canManageMembers(r)).toBe(true);
  });
  it.each(['manager', 'standard', 'student', '', null, undefined])('denies %j', (r) => {
    expect(canManageMembers(r as string | null | undefined)).toBe(false);
  });
});

describe('pickAcceptableInvite', () => {
  const base: InviteCandidate = {
    id: 'i1',
    orgId: 'org1',
    role: 'standard',
    createdAt: 100,
    expiresAt: 10_000,
    acceptedAt: null,
    revokedAt: null,
  };
  const now = 1_000;

  it('returns null for no candidates', () => {
    expect(pickAcceptableInvite([], now)).toBeNull();
  });

  it('returns a live invite', () => {
    expect(pickAcceptableInvite([base], now)?.id).toBe('i1');
  });

  it('skips accepted invites', () => {
    expect(pickAcceptableInvite([{ ...base, acceptedAt: 500 }], now)).toBeNull();
  });

  it('skips revoked invites', () => {
    expect(pickAcceptableInvite([{ ...base, revokedAt: 500 }], now)).toBeNull();
  });

  it('skips expired invites (expiresAt <= now)', () => {
    expect(pickAcceptableInvite([{ ...base, expiresAt: now }], now)).toBeNull();
  });

  it('prefers the most recently created live invite', () => {
    const older = { ...base, id: 'old', createdAt: 100 };
    const newer = { ...base, id: 'new', createdAt: 900 };
    expect(pickAcceptableInvite([older, newer], now)?.id).toBe('new');
  });

  it('ignores non-live invites even when newer', () => {
    const liveOld = { ...base, id: 'live', createdAt: 100 };
    const revokedNew = { ...base, id: 'revoked', createdAt: 900, revokedAt: 950 };
    expect(pickAcceptableInvite([liveOld, revokedNew], now)?.id).toBe('live');
  });
});
