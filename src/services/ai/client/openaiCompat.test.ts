import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  callOpenAiCompat,
  normalizeBaseUrl,
  testConnection,
  validateEndpointUrl,
} from './openaiCompat';
import { AiCallError } from '../errors';

const endpoint = { baseUrl: 'http://localhost:11434', model: 'llama3.1:8b' };
const baseArgs = { provider: 'local' as const, endpoint, system: 'sys', user: 'usr' };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const completion = (content: string) => ({ choices: [{ message: { content } }] });

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe('URL handling', () => {
  it('strips a trailing slash and a trailing /v1', () => {
    expect(normalizeBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434');
    expect(normalizeBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434');
  });

  it('allows http only for loopback', () => {
    expect(validateEndpointUrl('http://localhost:11434')).toBeNull();
    expect(validateEndpointUrl('http://127.0.0.1:8080')).toBeNull();
    expect(validateEndpointUrl('https://llm.clinic.internal')).toBeNull();
    // Mixed content: the browser blocks this from an HTTPS page with no useful error.
    expect(validateEndpointUrl('http://192.168.1.50:11434')).toMatch(/https/);
    expect(validateEndpointUrl('ftp://box')).toMatch(/http/);
    expect(validateEndpointUrl('not a url')).toMatch(/full URL/);
  });
});

describe('callOpenAiCompat', () => {
  it('posts to /v1/chat/completions in JSON mode without cookies, and returns the text', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, completion('{"S":"subjective"}')));

    const result = await callOpenAiCompat(baseArgs);

    expect(result.text).toBe('{"S":"subjective"}');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.credentials).toBe('omit');
    expect(init.headers.Authorization).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.model).toBe('llama3.1:8b');
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('sends a bearer token when the endpoint has one', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, completion('ok')));
    await callOpenAiCompat({ ...baseArgs, endpoint: { ...endpoint, apiKey: 'tok' } });
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('classifies 401 as key_rejected and 404 as model_missing', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: 'nope' }));
    await expect(callOpenAiCompat(baseArgs)).rejects.toMatchObject({ kind: 'key_rejected' });

    mockFetch.mockResolvedValueOnce(jsonResponse(404, { error: 'model not found' }));
    await expect(callOpenAiCompat(baseArgs)).rejects.toMatchObject({ kind: 'model_missing' });
  });

  it('reports a transport failure as unreachable, not network', async () => {
    // A browser collapses server-down, CORS, mixed content and private-network
    // blocks into one TypeError — "check your internet" would be wrong advice.
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await callOpenAiCompat({ ...baseArgs, onRetry: () => {} }).catch((e) => e);
    expect(err).toBeInstanceOf(AiCallError);
    expect(err.kind).toBe('unreachable');
    expect(mockFetch.mock.calls.length).toBeGreaterThan(1); // retried by the shared harness
  }, 15_000); // real backoff: 2s + 4s

  it('rejects with `empty` when the server answers 200 with no content', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { choices: [] }));
    await expect(callOpenAiCompat(baseArgs)).rejects.toMatchObject({ kind: 'empty' });
  });
});

describe('testConnection', () => {
  it('returns the advertised model ids', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { data: [{ id: 'llama3.1:8b' }, { id: 'qwen2.5:14b' }, { id: 7 }] }),
    );
    const result = await testConnection('local', endpoint);
    expect(result).toEqual({ ok: true, models: ['llama3.1:8b', 'qwen2.5:14b'] });
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:11434/v1/models');
  });

  it('returns ok:false with a classified error instead of throwing', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await testConnection('network', { ...endpoint, baseUrl: 'https://llm.lan' });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('unreachable');
  });
});
