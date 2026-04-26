import { describe, expect, it, afterEach, vi } from 'vitest';
import { acquireWakeLock, releaseWakeLock, isWakeLockSupported } from './wakeLock';

type FakeSentinel = {
  released: boolean;
  release: () => Promise<void>;
};

function installFakeWakeLock(request: () => Promise<FakeSentinel>) {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });
}

function removeFakeWakeLock() {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
}

describe('wakeLock', () => {
  afterEach(() => {
    removeFakeWakeLock();
    vi.restoreAllMocks();
  });

  describe('isWakeLockSupported', () => {
    it('returns false when navigator.wakeLock is missing', () => {
      removeFakeWakeLock();
      expect(isWakeLockSupported()).toBe(false);
    });

    it('returns true when navigator.wakeLock is present', () => {
      installFakeWakeLock(async () => ({
        released: false,
        release: async () => {},
      }));
      expect(isWakeLockSupported()).toBe(true);
    });
  });

  describe('acquireWakeLock', () => {
    it('returns null when API is unavailable', async () => {
      removeFakeWakeLock();
      await expect(acquireWakeLock()).resolves.toBeNull();
    });

    it('returns the sentinel on success', async () => {
      const sentinel: FakeSentinel = {
        released: false,
        release: async () => {},
      };
      installFakeWakeLock(async () => sentinel);
      const result = await acquireWakeLock();
      expect(result).toBe(sentinel);
    });

    it('returns null when the request rejects', async () => {
      installFakeWakeLock(async () => {
        throw new Error('NotAllowedError');
      });
      await expect(acquireWakeLock()).resolves.toBeNull();
    });
  });

  describe('releaseWakeLock', () => {
    it('is a no-op when given null', async () => {
      await expect(releaseWakeLock(null)).resolves.toBeUndefined();
    });

    it('calls release on the sentinel', async () => {
      const release = vi.fn(async () => {});
      const sentinel: FakeSentinel = { released: false, release };
      await releaseWakeLock(sentinel as unknown as WakeLockSentinel);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('swallows errors thrown by release', async () => {
      const release = vi.fn(async () => {
        throw new Error('already released');
      });
      const sentinel: FakeSentinel = { released: true, release };
      await expect(
        releaseWakeLock(sentinel as unknown as WakeLockSentinel),
      ).resolves.toBeUndefined();
    });
  });
});
