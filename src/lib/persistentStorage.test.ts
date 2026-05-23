import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persistentStorage';

const original = Object.getOwnPropertyDescriptor(navigator, 'storage');

function stubStorage(value: unknown): void {
  Object.defineProperty(navigator, 'storage', { value, configurable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'storage', original);
  else delete (navigator as { storage?: unknown }).storage;
});

describe('requestPersistentStorage', () => {
  it('returns null when the Storage API is unavailable', async () => {
    stubStorage(undefined);
    expect(await requestPersistentStorage()).toBeNull();
  });

  it('returns null when persist() is missing', async () => {
    stubStorage({ persisted: vi.fn() });
    expect(await requestPersistentStorage()).toBeNull();
  });

  it('skips persist() when durability is already granted', async () => {
    const persist = vi.fn();
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet granted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('swallows errors and returns null', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new Error('denied')),
    });
    expect(await requestPersistentStorage()).toBeNull();
  });
});
