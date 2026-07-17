import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActionGuard } from './useActionGuard';
import { MAX_GENERATES_PER_SESSION } from '@/types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useActionGuard', () => {
  it('exposes only the cooldown API — no in-memory usage counters', () => {
    const { result } = renderHook(() => useActionGuard());
    expect(typeof result.current.checkActionGuard).toBe('function');
    expect(typeof result.current.recordAction).toBe('function');
    // Lifetime counts now live on the persisted Session, not the guard.
    expect(result.current).not.toHaveProperty('transcribeUsed');
    expect(result.current).not.toHaveProperty('generateUsed');
  });

  it('blocks a second action within the 3s cooldown, then allows it after', () => {
    const now = vi.spyOn(Date, 'now');
    const { result } = renderHook(() => useActionGuard());

    now.mockReturnValue(10_000);
    expect(result.current.checkActionGuard('generate').allowed).toBe(true);
    act(() => result.current.recordAction('generate'));

    now.mockReturnValue(11_000); // +1s — still cooling down
    const blocked = result.current.checkActionGuard('generate');
    expect(blocked.allowed).toBe(false);
    expect(blocked.allowed === false && blocked.reason).toMatch(/wait/i);
    // The misleading "Reload to reset" / "Limit reached" message is gone.
    expect(blocked.allowed === false && blocked.reason).not.toMatch(/reload|limit reached/i);

    now.mockReturnValue(13_000); // +3s — cooldown elapsed
    expect(result.current.checkActionGuard('generate').allowed).toBe(true);
  });

  it('never blocks on a count — the guard imposes no per-session cap', () => {
    const now = vi.spyOn(Date, 'now');
    const { result } = renderHook(() => useActionGuard());

    // Fire more generates than MAX_GENERATES_PER_SESSION, spacing each past the
    // cooldown. The guard must allow every one — the cap is enforced elsewhere.
    let t = 0;
    for (let i = 0; i < MAX_GENERATES_PER_SESSION + 5; i++) {
      t += 5_000;
      now.mockReturnValue(t);
      expect(result.current.checkActionGuard('generate').allowed).toBe(true);
      act(() => result.current.recordAction('generate'));
    }
  });

  it('tracks transcribe and generate cooldowns independently', () => {
    const now = vi.spyOn(Date, 'now');
    const { result } = renderHook(() => useActionGuard());

    now.mockReturnValue(10_000);
    act(() => result.current.recordAction('transcribe'));

    // A generate immediately after a transcribe is not blocked by the transcribe cooldown.
    now.mockReturnValue(10_500);
    expect(result.current.checkActionGuard('generate').allowed).toBe(true);
    // ...but a second transcribe within 3s still is.
    expect(result.current.checkActionGuard('transcribe').allowed).toBe(false);
  });
});
