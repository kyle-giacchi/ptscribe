import { beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable demo-mode flag for both branches of resolveProfileId.
// vi.hoisted so the object exists before the hoisted vi.mock factory runs.
const demoModeState = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/demoMode', () => ({
  isDemoMode: () => demoModeState.value,
}));

import {
  resolveProfileId,
  commitActiveProfile,
  getActiveProfileId,
  setActiveProfileId,
  activateTestUserSession,
  deactivateTestUserSession,
  isTestUserSession,
  __resetProfileState,
  LOCAL_PROFILE_ID,
  DEMO_PROFILE_ID,
  TEST_USER_PROFILE_ID,
} from './profileId';

beforeEach(() => {
  localStorage.clear();
  demoModeState.value = true;
  __resetProfileState();
});

describe('resolveProfileId — demo build', () => {
  it('resolves to the demo profile when no test-user marker is set', () => {
    expect(resolveProfileId(null)).toBe(DEMO_PROFILE_ID);
  });

  it('resolves to the test-user profile when the marker is set', () => {
    activateTestUserSession();
    expect(isTestUserSession()).toBe(true);
    expect(resolveProfileId(null)).toBe(TEST_USER_PROFILE_ID);
  });

  it('ignores the authenticated user id in demo build (demo/test split on the marker)', () => {
    // Even though both run as DEMO_USER, storage diverges on the marker only.
    expect(resolveProfileId('demo-user')).toBe(DEMO_PROFILE_ID);
    activateTestUserSession();
    expect(resolveProfileId('demo-user')).toBe(TEST_USER_PROFILE_ID);
  });

  it('reverts to demo after deactivating the test-user marker', () => {
    activateTestUserSession();
    deactivateTestUserSession();
    expect(isTestUserSession()).toBe(false);
    expect(resolveProfileId(null)).toBe(DEMO_PROFILE_ID);
  });
});

describe('resolveProfileId — non-demo build', () => {
  beforeEach(() => {
    demoModeState.value = false;
  });

  it('resolves anonymous use to the single local profile', () => {
    expect(resolveProfileId(null)).toBe(LOCAL_PROFILE_ID);
    expect(resolveProfileId('')).toBe(LOCAL_PROFILE_ID);
  });

  it('resolves an authenticated user to their own user-id profile', () => {
    expect(resolveProfileId('user-abc')).toBe('user-abc');
  });

  it('ignores the test-user marker outside demo builds', () => {
    activateTestUserSession();
    expect(resolveProfileId('user-abc')).toBe('user-abc');
    expect(resolveProfileId(null)).toBe(LOCAL_PROFILE_ID);
  });
});

describe('commitActiveProfile', () => {
  it('commits the first profile and sets it active', () => {
    expect(commitActiveProfile('demo')).toBe('ok');
    expect(getActiveProfileId()).toBe('demo');
  });

  it('is idempotent for the same target', () => {
    commitActiveProfile('demo');
    expect(commitActiveProfile('demo')).toBe('ok');
    expect(getActiveProfileId()).toBe('demo');
  });

  it('reports a change without mutating the active id (caller must reload)', () => {
    commitActiveProfile('demo');
    expect(commitActiveProfile('test-user')).toBe('changed');
    // active stays on the committed profile until the reload re-commits.
    expect(getActiveProfileId()).toBe('demo');
  });
});

describe('setActiveProfileId', () => {
  it('directly overrides the active id (test/boot escape hatch)', () => {
    setActiveProfileId('user-xyz');
    expect(getActiveProfileId()).toBe('user-xyz');
  });
});
