import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigSyncProvider } from './ConfigSyncProvider';
import { defaultAppData } from '@/schemas';
import { DEMO_USER } from '@/lib/auth/demo';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockDemo = false;
vi.mock('@/lib/demoMode', () => ({ isDemoMode: () => mockDemo }));

let mockUser: { id: string } | null = null;
let mockAuthed = false;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: mockUser, isAuthenticated: mockAuthed }),
}));

// AppDataProvider stub — give the provider real data + no-op mutators.
const mutators = {
  updateSettingsSlice: vi.fn(),
  updateClinicianSlice: vi.fn(),
  updateTemplatesSlice: vi.fn(),
  updateExercisesSlice: vi.fn(),
};
vi.mock('@/contexts/AppDataProvider', () => ({
  useAppData: () => ({ appData: defaultAppData(), ...mutators }),
}));

function stubFetch(impl?: (...a: unknown[]) => unknown) {
  const spy = vi.fn(impl ?? (async () => ({ ok: true, json: async () => ({ config: null }) })));
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  mockDemo = false;
  mockUser = null;
  mockAuthed = false;
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

function renderProvider() {
  return render(
    <ConfigSyncProvider>
      <div>child</div>
    </ConfigSyncProvider>,
  );
}

describe('ConfigSyncProvider demo isolation', () => {
  it('renders children', () => {
    const spy = stubFetch();
    renderProvider();
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled(); // unauthenticated → no network
  });

  it('makes ZERO config requests in demo mode', async () => {
    mockDemo = true;
    mockAuthed = true;
    mockUser = { id: 'someone' };
    const spy = stubFetch();
    renderProvider();
    // Give effects a tick to (not) fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it('makes ZERO config requests for the test-user (DEMO_USER) session', async () => {
    mockAuthed = true;
    mockUser = { id: DEMO_USER.id };
    const spy = stubFetch();
    renderProvider();
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it('makes ZERO config requests when unauthenticated', async () => {
    mockAuthed = false;
    mockUser = null;
    const spy = stubFetch();
    renderProvider();
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('ConfigSyncProvider for a registered user', () => {
  it('pulls config on login (GET /api/config/user)', async () => {
    mockAuthed = true;
    mockUser = { id: 'real-user-1' };
    const spy = stubFetch();
    renderProvider();
    await waitFor(() => {
      const got = spy.mock.calls.find((c) => c[0] === '/api/config/user');
      expect(got).toBeTruthy();
    });
  });

  it('seeds the server (PUT) when no row exists', async () => {
    mockAuthed = true;
    mockUser = { id: 'real-user-2' };
    const spy = stubFetch();
    renderProvider();
    await waitFor(() => {
      const put = spy.mock.calls.find(
        (c) => c[0] === '/api/config/user' && (c[1] as RequestInit | undefined)?.method === 'PUT',
      );
      expect(put).toBeTruthy();
    });
  });
});
