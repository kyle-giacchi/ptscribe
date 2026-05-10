import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, GateRejectedError } from './apiClient';
import { storeGateCode, clearGateCode, getStoredGateHash } from '@/lib/gate';

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearGateCode();
});

describe('apiFetch — gate header', () => {
  it('injects x-ptscribe-key when a gate code has been stored', async () => {
    await storeGateCode('123456');
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await apiFetch('/api/generate');

    const headers = new Headers(mockFetch.mock.calls[0][1]?.headers as HeadersInit);
    expect(headers.get('x-ptscribe-key')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('omits x-ptscribe-key when no gate code is stored', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await apiFetch('/api/generate');

    const headers = new Headers(mockFetch.mock.calls[0][1]?.headers as HeadersInit);
    expect(headers.get('x-ptscribe-key')).toBeNull();
  });

  it('preserves caller-supplied headers alongside the gate header', async () => {
    await storeGateCode('123456');
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await apiFetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    const headers = new Headers(mockFetch.mock.calls[0][1]?.headers as HeadersInit);
    expect(headers.get('Content-Type')).toBe('application/octet-stream');
    expect(headers.get('x-ptscribe-key')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('apiFetch — 401 handling', () => {
  it('throws GateRejectedError on a 401 response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(apiFetch('/api/generate')).rejects.toBeInstanceOf(GateRejectedError);
  });

  it('clears the stored gate hash after a 401', async () => {
    await storeGateCode('123456');
    expect(getStoredGateHash()).not.toBeNull();

    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(apiFetch('/api/generate')).rejects.toBeInstanceOf(GateRejectedError);
    expect(getStoredGateHash()).toBeNull();
  });

  it('passes through non-401 error responses without throwing', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));

    const res = await apiFetch('/api/generate');
    expect(res.status).toBe(500);
  });

  it('passes through successful responses unchanged', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{"text":"ok"}', { status: 200 }));

    const res = await apiFetch('/api/generate');
    expect(res.status).toBe(200);
  });
});
