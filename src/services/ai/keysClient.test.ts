import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getUserKeys,
  getOrgKeys,
  putUserKey,
  deleteUserKey,
  verifyUserKey,
  putOrgKey,
  deleteOrgKey,
} from './keysClient';
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
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => vi.clearAllMocks());

describe('getUserKeys', () => {
  it('returns signinRequired on a 401', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(401, { code: 'SIGNIN_REQUIRED' }));
    expect(await getUserKeys()).toEqual({ signinRequired: true });
  });

  it('opts out of gate interception so a 401 is not a gate wipe', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(401, {}));
    await getUserKeys();
    expect(mockApiFetch.mock.calls[0][2]).toEqual({ interceptGate: false });
  });

  it('maps the masked key list', async () => {
    const keys = [
      { provider: 'anthropic', set: true, last4: 'cdef', status: 'verified', verifiedAt: 1 },
    ];
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { keys }));
    expect(await getUserKeys()).toEqual({ signinRequired: false, keys });
  });
});

describe('putUserKey', () => {
  it('returns ok + masked status on success', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        provider: 'openai',
        set: true,
        status: 'verified',
        last4: '1234',
        verifiedAt: 9,
      }),
    );
    const result = await putUserKey('openai', 'sk-test');
    expect(result).toEqual({
      ok: true,
      status: { provider: 'openai', set: true, last4: '1234', status: 'verified', verifiedAt: 9 },
    });
  });

  it('surfaces the Worker error code on a rejected key', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(400, { code: 'KEY_REJECTED', error: 'rejected' }),
    );
    const result = await putUserKey('anthropic', 'bad');
    expect(result).toMatchObject({ ok: false, code: 'KEY_REJECTED' });
  });
});

describe('deleteUserKey / verifyUserKey', () => {
  it('delete returns an unset status', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, provider: 'google', set: false }),
    );
    const result = await deleteUserKey('google');
    expect(result).toEqual({
      ok: true,
      status: { provider: 'google', set: false, last4: null, status: 'unset', verifiedAt: null },
    });
  });

  it('verify surfaces NO_KEY when nothing is stored', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(404, { code: 'NO_KEY', error: 'none' }));
    const result = await verifyUserKey('anthropic');
    expect(result).toMatchObject({ ok: false, code: 'NO_KEY' });
  });
});

describe('org scope hits the org endpoints', () => {
  it('getOrgKeys reads /api/keys/org and treats 403 as signinRequired', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(403, { code: 'NOT_IN_ORG' }));
    expect(await getOrgKeys()).toEqual({ signinRequired: true });
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/keys/org');
  });

  it('putOrgKey PUTs to /api/keys/org', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, provider: 'anthropic', set: true, last4: 'abcd' }),
    );
    await putOrgKey('anthropic', 'sk-ant-x');
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/keys/org');
    expect(mockApiFetch.mock.calls[0][1]?.method).toBe('PUT');
  });

  it('deleteOrgKey DELETEs against /api/keys/org with the provider query', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, provider: 'google', set: false }),
    );
    await deleteOrgKey('google');
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/keys/org?provider=google');
    expect(mockApiFetch.mock.calls[0][1]?.method).toBe('DELETE');
  });
});
