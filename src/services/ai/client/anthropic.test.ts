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

    await callAnthropic({
      ...baseArgs,
      modifierBlock: '# Tone & style\nNarrative.',
      maxTokens: 1024,
    });

    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/generate');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.modifierBlock).toContain('# Tone & style');
    expect(body.maxTokens).toBe(1024);
  });

  it('throws AiCallError with kind=empty when the response text field is an empty string', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { text: '' }));

    await expect(callAnthropic(baseArgs)).rejects.toMatchObject({
      name: 'AiCallError',
      kind: 'empty',
      provider: 'anthropic',
    });
  });

  it('uses the upstream error message when text is absent', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { error: 'upstream problem' }));

    await expect(callAnthropic(baseArgs)).rejects.toThrow('upstream problem');
  });

  it('defaults provider to anthropic in the request body', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { text: 'ok' }));
    await callAnthropic(baseArgs);
    const body = JSON.parse(mockApiFetch.mock.calls[0][1]?.body as string);
    expect(body.provider).toBe('anthropic');
  });

  it('sends the chosen BYOK provider in the request body', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { text: 'ok' }));
    await callAnthropic({ ...baseArgs, provider: 'openai' });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1]?.body as string);
    expect(body.provider).toBe('openai');
  });

  it.each([
    ['NO_KEY', 402, 'no_key'],
    ['KEY_REJECTED', 401, 'key_rejected'],
    ['PROVIDER_LIMITED', 429, 'provider_limited'],
    ['SIGNIN_REQUIRED', 401, 'signin_required'],
  ] as const)('maps Worker code %s (%i) to kind=%s', async (code, status, kind) => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(status, { code, error: 'x' }));
    await expect(callAnthropic({ ...baseArgs, provider: 'openai' })).rejects.toMatchObject({
      name: 'AiCallError',
      kind,
      provider: 'openai',
      status,
      attemptsMade: 1,
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on a non-retryable 400 without retrying', async () => {
    mockApiFetch.mockResolvedValueOnce(textResponse(400, 'Bad Request'));

    await expect(callAnthropic(baseArgs)).rejects.toMatchObject({
      name: 'AiCallError',
      provider: 'anthropic',
      status: 400,
      attemptsMade: 1,
    });
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

  it('throws AiCallError with kind=rate_limit on 429 without retrying', async () => {
    mockApiFetch.mockResolvedValueOnce(textResponse(429, 'Rate Limited'));

    await expect(callAnthropic(baseArgs)).rejects.toMatchObject({
      name: 'AiCallError',
      kind: 'rate_limit',
      provider: 'anthropic',
      status: 429,
      attemptsMade: 1,
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('throws AiCallError with kind=auth on 401', async () => {
    mockApiFetch.mockResolvedValueOnce(textResponse(401, 'unauthorized'));

    await expect(callAnthropic(baseArgs)).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });
  });

  it('throws after all retries are exhausted with kind=network and attemptsMade=4', async () => {
    mockApiFetch.mockResolvedValue(textResponse(503, 'final failure'));

    const resultPromise = callAnthropic(baseArgs);
    void resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toMatchObject({
      name: 'AiCallError',
      kind: 'network',
      provider: 'anthropic',
      attemptsMade: 4,
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(4);
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
    void resultPromise.catch(() => {});
    controller.abort();
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('calls onRetry before each backoff sleep with 1-based attempt numbers', async () => {
    mockApiFetch.mockResolvedValue(textResponse(503, 'down'));
    const onRetry = vi.fn();
    const p = callAnthropic({ ...baseArgs, onRetry });
    void p.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(p).rejects.toMatchObject({ kind: 'network', attemptsMade: 4 });
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, max: 3, reason: '503' });
    expect(onRetry).toHaveBeenNthCalledWith(2, { attempt: 2, max: 3, reason: '503' });
    expect(onRetry).toHaveBeenNthCalledWith(3, { attempt: 3, max: 3, reason: '503' });
  });

  it('calls onRetry with reason="network" on TypeError fetch failures', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const onRetry = vi.fn();
    const p = callAnthropic({ ...baseArgs, onRetry });
    void p.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(p).rejects.toMatchObject({ kind: 'network', attemptsMade: 4 });
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, max: 3, reason: 'network' });
  });
});
