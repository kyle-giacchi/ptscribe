// worker/providers/providers.test.ts
//
// Unit tests for the BYOK provider registry (issue 02): per-adapter buildRequest
// URL/headers/body, extractText over success + empty/blocked payloads, validateKey
// status mapping (mocked fetch), and registry lookups / allowlist gating.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getProvider,
  isModelAllowed,
  providerCatalog,
  composeSystem,
  type BuildRequestInput,
} from './index';

const baseInput: BuildRequestInput = {
  model: 'm',
  system: 'You are a scribe.',
  user: 'visit transcript',
  apiKey: 'KEY123456',
};

afterEach(() => vi.unstubAllGlobals());

function stubFetchStatus(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('composeSystem', () => {
  it('appends a trimmed modifier block, or returns the trimmed system alone', () => {
    expect(composeSystem('sys  ', '  mod  ')).toBe('sys\n\nmod');
    expect(composeSystem('sys  ')).toBe('sys');
    expect(composeSystem('sys', '   ')).toBe('sys');
  });
});

describe('registry lookups', () => {
  it('resolves known providers and rejects unknown', () => {
    expect(getProvider('anthropic')?.id).toBe('anthropic');
    expect(getProvider('openai')?.id).toBe('openai');
    expect(getProvider('google')?.id).toBe('google');
    expect(getProvider('mistral')).toBeUndefined();
  });

  it('gates models by the provider allowlist (before any upstream call)', () => {
    expect(isModelAllowed('anthropic', 'claude-sonnet-4-6')).toBe(true);
    expect(isModelAllowed('anthropic', 'gpt-4o')).toBe(false);
    expect(isModelAllowed('openai', 'gpt-4o')).toBe(true);
    expect(isModelAllowed('nope', 'whatever')).toBe(false);
  });

  it('exposes a non-secret catalog for the client', () => {
    const cat = providerCatalog();
    expect(cat.map((c) => c.id).sort()).toEqual(['anthropic', 'google', 'openai']);
    for (const entry of cat) {
      expect(entry.models.length).toBeGreaterThan(0);
      expect(entry.consoleUrl).toMatch(/^https:\/\//);
      expect(entry.keyHint).toBeTruthy();
    }
  });
});

describe('anthropic adapter', () => {
  const a = getProvider('anthropic')!;

  it('builds the Messages request with auth headers and cache_control', () => {
    const req = a.buildRequest({
      ...baseInput,
      model: 'claude-sonnet-4-6',
      modifierBlock: 'be brief',
    });
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['x-api-key']).toBe('KEY123456');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(req.body);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system[0].text).toBe('You are a scribe.\n\nbe brief');
    expect(body.messages[0].content[0].text).toBe('visit transcript');
  });

  it('omits cache_control when cacheSystem is false', () => {
    const body = JSON.parse(a.buildRequest({ ...baseInput, cacheSystem: false }).body);
    expect(body.system[0].cache_control).toBeUndefined();
  });

  it('extractText joins text blocks and ignores non-text / empty', () => {
    expect(
      a.extractText({
        content: [{ type: 'text', text: 'A' }, { type: 'tool_use' }, { type: 'text', text: 'B' }],
      }),
    ).toBe('AB');
    expect(a.extractText({ content: [] })).toBe('');
    expect(a.extractText({})).toBe('');
  });

  it('validateKey maps 200/401/429/500', async () => {
    stubFetchStatus(200);
    expect(await a.validateKey('k')).toEqual({ ok: true });
    stubFetchStatus(401);
    expect(await a.validateKey('k')).toEqual({ ok: false, reason: 'invalid_key' });
    stubFetchStatus(429);
    expect(await a.validateKey('k')).toEqual({ ok: false, reason: 'rate_limited' });
    stubFetchStatus(500);
    expect(await a.validateKey('k')).toEqual({ ok: false, reason: 'upstream_error' });
  });

  it('validateKey maps a network failure to network_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await a.validateKey('k')).toEqual({ ok: false, reason: 'network_error' });
  });
});

describe('openai adapter', () => {
  const o = getProvider('openai')!;

  it('builds Chat Completions with a system message and Bearer auth', () => {
    const req = o.buildRequest({ ...baseInput, model: 'gpt-4o', modifierBlock: 'be brief' });
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer KEY123456');
    const body = JSON.parse(req.body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a scribe.\n\nbe brief' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'visit transcript' });
  });

  it('extractText reads choices[0].message.content (empty when blocked)', () => {
    expect(o.extractText({ choices: [{ message: { content: 'hello' } }] })).toBe('hello');
    expect(o.extractText({ choices: [] })).toBe('');
    expect(o.extractText({})).toBe('');
  });

  it('validateKey hits /v1/models and maps status', async () => {
    const f = stubFetchStatus(200);
    expect(await o.validateKey('k')).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
  });
});

describe('google adapter', () => {
  const g = getProvider('google')!;

  it('builds generateContent with the key as a query param and systemInstruction', () => {
    const req = g.buildRequest({
      ...baseInput,
      model: 'gemini-2.5-pro',
      modifierBlock: 'be brief',
    });
    expect(req.url).toContain('/models/gemini-2.5-pro:generateContent?key=KEY123456');
    const body = JSON.parse(req.body);
    expect(body.systemInstruction.parts[0].text).toBe('You are a scribe.\n\nbe brief');
    expect(body.contents[0].parts[0].text).toBe('visit transcript');
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
  });

  it('extractText joins candidate parts (empty when blocked)', () => {
    expect(
      g.extractText({ candidates: [{ content: { parts: [{ text: 'A' }, { text: 'B' }] } }] }),
    ).toBe('AB');
    expect(g.extractText({ candidates: [] })).toBe('');
    expect(g.extractText({ promptFeedback: { blockReason: 'SAFETY' } })).toBe('');
  });

  it('validateKey maps status from the models-list probe', async () => {
    const f = stubFetchStatus(403);
    expect(await g.validateKey('k')).toEqual({ ok: false, reason: 'invalid_key' });
    expect(f.mock.calls[0][0]).toContain('/v1beta/models?key=k');
  });
});
