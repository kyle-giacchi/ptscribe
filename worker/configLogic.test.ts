import { describe, it, expect } from 'vitest';
import {
  MAX_CONFIG_BYTES,
  FORBIDDEN_TOP_KEYS,
  parseConfigBlob,
  shouldApplyIncoming,
  sanitizeCustomEntities,
} from './configLogic';

describe('parseConfigBlob', () => {
  it('accepts a plain object and returns it', () => {
    const res = parseConfigBlob('{"settings":{"a":1},"updatedAt":5}');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ settings: { a: 1 }, updatedAt: 5 });
  });

  it('rejects invalid JSON', () => {
    const res = parseConfigBlob('{not json');
    expect(res).toMatchObject({ ok: false, code: 'INVALID_JSON' });
  });

  it.each(['[]', '"a string"', '42', 'null'])('rejects non-object JSON %j', (raw) => {
    const res = parseConfigBlob(raw);
    expect(res).toMatchObject({ ok: false, code: 'NOT_OBJECT' });
  });

  it.each(FORBIDDEN_TOP_KEYS)('rejects forbidden clinical key %s', (key) => {
    const res = parseConfigBlob(JSON.stringify({ [key]: [], updatedAt: 1 }));
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN_KEY' });
  });

  it('enforces the byte cap', () => {
    const big = JSON.stringify({ blob: 'x'.repeat(MAX_CONFIG_BYTES + 10) });
    const res = parseConfigBlob(big);
    expect(res).toMatchObject({ ok: false, code: 'TOO_LARGE' });
  });

  it('counts bytes not chars for the cap (multibyte)', () => {
    // A small custom cap; a 2-char string of 4-byte emoji exceeds 4 bytes.
    const res = parseConfigBlob(JSON.stringify({ e: '😀😀' }), 8);
    expect(res).toMatchObject({ ok: false, code: 'TOO_LARGE' });
  });
});

describe('shouldApplyIncoming (last-write-wins)', () => {
  it('applies when nothing is stored', () => {
    expect(shouldApplyIncoming(1, null)).toBe(true);
    expect(shouldApplyIncoming(1, undefined)).toBe(true);
  });
  it('applies a strictly newer write', () => {
    expect(shouldApplyIncoming(10, 5)).toBe(true);
  });
  it('applies an equal write (idempotent re-push)', () => {
    expect(shouldApplyIncoming(5, 5)).toBe(true);
  });
  it('rejects a strictly older (stale) write', () => {
    expect(shouldApplyIncoming(4, 5)).toBe(false);
  });
});

describe('sanitizeCustomEntities', () => {
  it('drops builtin entities', () => {
    const out = sanitizeCustomEntities([
      { id: 'a', builtin: true },
      { id: 'b', builtin: false },
      { id: 'c' },
    ]);
    expect(out.map((e) => (e as { id: string }).id)).toEqual(['b', 'c']);
  });
  it('returns [] for non-array input', () => {
    expect(sanitizeCustomEntities(undefined)).toEqual([]);
    expect(sanitizeCustomEntities('nope')).toEqual([]);
    expect(sanitizeCustomEntities({})).toEqual([]);
  });
  it('skips null/non-object members', () => {
    expect(sanitizeCustomEntities([null, 1, { id: 'x', builtin: false }])).toEqual([
      { id: 'x', builtin: false },
    ]);
  });
});
