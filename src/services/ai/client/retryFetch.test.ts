import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryFetch, type RetryPolicy } from './retryFetch';

function res(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const basePolicy: RetryPolicy = {
  provider: 'nova',
  label: 'Nova',
  retryableStatuses: new Set([500, 503]),
  delaysMs: [1, 1, 1],
};

describe('retryFetch — pass-through (no retry)', () => {
  it('returns an ok response with attempts=1', async () => {
    const r = await retryFetch(basePolicy, () => Promise.resolve(res(200)));
    expect(r.attempts).toBe(1);
    expect(r.response.status).toBe(200);
  });

  it('returns a non-retryable failure for the adapter to classify (no retry)', async () => {
    const doFetch = vi.fn(() => Promise.resolve(res(429, 'slow down')));
    const r = await retryFetch(basePolicy, doFetch);
    expect(r.response.status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });
});

describe('retryFetch — retry and exhaustion', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries a retryable status, fires onRetry, then throws kind=network', async () => {
    const onRetry = vi.fn();
    const p = retryFetch({ ...basePolicy, onRetry }, () => Promise.resolve(res(503, 'down')));
    void p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).rejects.toMatchObject({
      name: 'AiCallError',
      kind: 'network',
      attemptsMade: 4,
    });
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, max: 3, reason: '503' });
  });

  it('recovers when a retryable failure is followed by success', async () => {
    const doFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200));
    const p = retryFetch(basePolicy, doFetch);
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.response.status).toBe(200);
    expect(r.attempts).toBe(2);
  });

  it('wraps an exhausted transport error as kind=network', async () => {
    const p = retryFetch(basePolicy, () => Promise.reject(new TypeError('Failed to fetch')));
    void p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).rejects.toMatchObject({ kind: 'network', attemptsMade: 4 });
  });
});

describe('retryFetch — abort', () => {
  it('throws AbortError without wrapping when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      retryFetch({ ...basePolicy, signal: controller.signal }, () => Promise.resolve(res(200))),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
