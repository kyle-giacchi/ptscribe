import { describe, it, expect } from 'vitest';
import { AiCallError, classifyResponse, friendlyAiError } from './errors';

function res(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

describe('classifyResponse', () => {
  it('maps 429 to rate_limit', () => {
    expect(classifyResponse(res(429), 'anthropic')).toBe('rate_limit');
  });
  it('maps 401 and 403 to auth', () => {
    expect(classifyResponse(res(401), 'nova')).toBe('auth');
    expect(classifyResponse(res(403), 'nova')).toBe('auth');
  });
  it('maps 5xx and 408 to network', () => {
    expect(classifyResponse(res(500), 'anthropic')).toBe('network');
    expect(classifyResponse(res(503), 'anthropic')).toBe('network');
    expect(classifyResponse(res(408), 'nova')).toBe('network');
  });
  it('falls back to network for unknown statuses', () => {
    expect(classifyResponse(res(418), 'anthropic')).toBe('network');
  });
});

describe('friendlyAiError', () => {
  function err(kind: AiCallError['kind'], provider: AiCallError['provider'] = 'anthropic') {
    return new AiCallError({ kind, provider, attemptsMade: 1, message: 'raw' });
  }
  it('interpolates provider name in title', () => {
    expect(friendlyAiError(err('network', 'anthropic')).title).toMatch(/Anthropic/);
    expect(friendlyAiError(err('network', 'nova')).title).toMatch(/Cloudflare Nova/);
  });
  it('uses refresh action for auth errors', () => {
    expect(friendlyAiError(err('auth')).action).toBe('refresh');
  });
  it('uses wait action for rate_limit', () => {
    expect(friendlyAiError(err('rate_limit')).action).toBe('wait');
  });
  it('returns descriptions for every kind', () => {
    (['network', 'rate_limit', 'auth', 'empty', 'timeout'] as const).forEach((kind) => {
      const f = friendlyAiError(err(kind));
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.actionLabel.length).toBeGreaterThan(0);
    });
  });
});
