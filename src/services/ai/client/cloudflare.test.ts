import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeWithCloudflare } from './cloudflare';
import { apiFetch } from '@/lib/apiClient';

vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  GateRejectedError: class GateRejectedError extends Error {},
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function textResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: () => Promise.reject(new SyntaxError('not json')),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

afterEach(() => {
  vi.clearAllMocks();
});

describe('transcribeWithCloudflare — success and non-retryable errors', () => {
  it('returns text on success', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { text: 'hello' }));
    await expect(transcribeWithCloudflare({ model: 'x', audio: blob })).resolves.toEqual({
      text: 'hello',
    });
  });

  it('throws AiCallError with kind=rate_limit on 429', async () => {
    mockApiFetch.mockResolvedValueOnce(textResponse(429, 'slow down'));
    await expect(transcribeWithCloudflare({ model: 'x', audio: blob })).rejects.toMatchObject({
      name: 'AiCallError',
      kind: 'rate_limit',
      provider: 'nova',
      status: 429,
    });
  });

  it('throws AiCallError with kind=auth on 403', async () => {
    mockApiFetch.mockResolvedValueOnce(textResponse(403, 'forbidden'));
    await expect(transcribeWithCloudflare({ model: 'x', audio: blob })).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('throws AiCallError with kind=empty on 200 with missing text', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await expect(transcribeWithCloudflare({ model: 'x', audio: blob })).rejects.toMatchObject({
      kind: 'empty',
    });
  });
});

describe('transcribeWithCloudflare — retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries up to 3 times on 503 and calls onRetry, then throws kind=network', async () => {
    mockApiFetch.mockResolvedValue(textResponse(503, 'down'));
    const onRetry = vi.fn();
    const p = transcribeWithCloudflare({ model: 'x', audio: blob, onRetry });
    void p.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(p).rejects.toMatchObject({ kind: 'network', attemptsMade: 4 });
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, max: 3, reason: '503' });
  });

  it('retries on TypeError and succeeds on next attempt', async () => {
    mockApiFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { text: 'recovered' }));

    const p = transcribeWithCloudflare({ model: 'x', audio: blob });
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ text: 'recovered' });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('throws AbortError when signal is aborted mid-sleep', async () => {
    const controller = new AbortController();
    mockApiFetch.mockResolvedValueOnce(textResponse(503, 'down'));
    const p = transcribeWithCloudflare({ model: 'x', audio: blob, signal: controller.signal });
    void p.catch(() => {});
    controller.abort();
    await vi.runAllTimersAsync();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
