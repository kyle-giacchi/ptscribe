import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callAnthropic } from './anthropic';
import { apiFetch } from '@/lib/apiClient';

vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  GateRejectedError: class GateRejectedError extends Error {},
}));

const mockApiFetch = vi.mocked(apiFetch);

const baseArgs = {
  model: 'claude-sonnet-4-6',
  system: 'You are a PT assistant.',
  user: 'Patient presents with knee pain.',
};

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
    json: () => Promise.reject(new SyntaxError('Not JSON')),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('callAnthropic — success and non-retryable errors', () => {
  it('returns text from a successful 200 response', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { text: 'SOAP note content' }));

    const result = await callAnthropic(baseArgs);

    expect(result.text).toBe('SOAP note content');
  });

  it('posts to /api/generate with the correct method, headers, and body shape', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { text: 'ok' }));

    await callAnthropic({ ...baseArgs, toneStyle: 'narrative', maxTokens: 1024 });

    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/generate');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.toneStyle).toBe('narrative');
    expect(body.maxTokens).toBe(1024);
  });

  it('throws when the response text field is an empty string', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { text: '' }));

    await expect(callAnthropic(baseArgs)).rejects.toThrow(
      'Generate proxy response had no text content',
    );
  });

  it('throws with the upstream error message when text is absent', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { error: 'upstream problem' }));

    await expect(callAnthropic(baseArgs)).rejects.toThrow('upstream problem');
  });

  it('throws immediately on a non-retryable 400 without retrying', async () => {
    mockApiFetch.mockResolvedValueOnce(textResponse(400, 'Bad Request'));

    await expect(callAnthropic(baseArgs)).rejects.toThrow('Generate proxy failed (400)');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('throws AbortError immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(callAnthropic({ ...baseArgs, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('callAnthropic — retry logic', () => {
  // Fake timers are scoped here so they do not interfere with Response.text() in non-retry tests.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 503 and returns the successful second response', async () => {
    mockApiFetch
      .mockResolvedValueOnce(textResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(jsonResponse(200, { text: 'note on retry' }));

    const promise = callAnthropic(baseArgs);
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ text: 'note on retry' });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 and returns the successful second response', async () => {
    mockApiFetch
      .mockResolvedValueOnce(textResponse(429, 'Rate Limited'))
      .mockResolvedValueOnce(jsonResponse(200, { text: 'recovered' }));

    const promise = callAnthropic(baseArgs);
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ text: 'recovered' });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries are exhausted', async () => {
    mockApiFetch
      .mockResolvedValueOnce(textResponse(503, ''))
      .mockResolvedValueOnce(textResponse(503, ''))
      .mockResolvedValueOnce(textResponse(503, 'final failure'));

    const resultPromise = callAnthropic(baseArgs);
    // Suppress unhandled rejection — expect() below is the real assertion.
    void resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow('Generate proxy failed (503)');
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on a network error and succeeds on the next attempt', async () => {
    mockApiFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { text: 'recovered from network error' }));

    const promise = callAnthropic(baseArgs);
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ text: 'recovered from network error' });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('throws AbortError when the signal is aborted during a sleep between retries', async () => {
    const controller = new AbortController();
    mockApiFetch.mockResolvedValueOnce(textResponse(503, 'Service Unavailable'));

    const resultPromise = callAnthropic({ ...baseArgs, signal: controller.signal });
    // Suppress unhandled rejection — expect() below is the real assertion.
    void resultPromise.catch(() => {});
    controller.abort();
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
