import { describe, it, expect } from 'vitest';
import { AiCallError, classifyResponse, classifyError, friendlyAiError } from './errors';

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

describe('classifyError — BYOK body code wins over status', () => {
  it('maps NO_KEY (402) to no_key', () => {
    expect(classifyError('NO_KEY', res(402))).toBe('no_key');
  });
  it('maps KEY_REJECTED (401) to key_rejected, not auth', () => {
    expect(classifyError('KEY_REJECTED', res(401))).toBe('key_rejected');
  });
  it('maps PROVIDER_LIMITED (429) to provider_limited, not rate_limit', () => {
    expect(classifyError('PROVIDER_LIMITED', res(429))).toBe('provider_limited');
  });
  it('maps SIGNIN_REQUIRED (401) to signin_required', () => {
    expect(classifyError('SIGNIN_REQUIRED', res(401))).toBe('signin_required');
  });
  it('falls back to status classification for unknown/missing codes', () => {
    expect(classifyError(undefined, res(429))).toBe('rate_limit');
    expect(classifyError('UPSTREAM_FAILED', res(401))).toBe('auth');
    expect(classifyError(undefined, res(500))).toBe('network');
  });
});

describe('friendlyAiError', () => {
  function err(kind: AiCallError['kind'], provider: AiCallError['provider'] = 'anthropic') {
    return new AiCallError({ kind, provider, attemptsMade: 1, message: 'raw' });
  }
  it('interpolates provider name in title', () => {
    expect(friendlyAiError(err('network', 'anthropic')).title).toMatch(/Anthropic/);
    expect(friendlyAiError(err('network', 'nova')).title).toMatch(/Cloudflare Nova/);
    expect(friendlyAiError(err('network', 'openai')).title).toMatch(/OpenAI/);
    expect(friendlyAiError(err('network', 'google')).title).toMatch(/Google/);
  });
  it('points BYOK key failures at Settings', () => {
    expect(friendlyAiError(err('no_key')).action).toBe('open_settings');
    expect(friendlyAiError(err('key_rejected')).action).toBe('open_settings');
    expect(friendlyAiError(err('signin_required')).action).toBe('signin');
    expect(friendlyAiError(err('provider_limited')).action).toBe('wait');
  });
  it('uses refresh action for auth errors', () => {
    expect(friendlyAiError(err('auth')).action).toBe('refresh');
  });
  it('uses wait action for rate_limit', () => {
    expect(friendlyAiError(err('rate_limit')).action).toBe('wait');
  });
  it('returns descriptions for every kind', () => {
    (
      [
        'network',
        'rate_limit',
        'auth',
        'empty',
        'timeout',
        'no_key',
        'key_rejected',
        'provider_limited',
        'signin_required',
      ] as const
    ).forEach((kind) => {
      const f = friendlyAiError(err(kind));
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.actionLabel.length).toBeGreaterThan(0);
    });
  });
});
