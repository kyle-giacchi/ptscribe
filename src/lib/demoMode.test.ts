import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isDemoMode, forceDemoMode, clearForcedDemoMode } from './demoMode';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllEnvs());

describe('isDemoMode — dev override', () => {
  it('honours the build flag when nothing is forced', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    expect(isDemoMode()).toBe(false);
  });

  it('forces demo on in a VITE_DEMO_MODE=false build — the Try Demo path', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    forceDemoMode();
    expect(isDemoMode()).toBe(true);
  });

  it('reverts to the build flag once cleared — the Admin Quick Login path', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    forceDemoMode();
    clearForcedDemoMode();
    expect(isDemoMode()).toBe(false);
  });
});
