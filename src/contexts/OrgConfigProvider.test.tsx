import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OrgConfigProvider, useOrgConfig } from './OrgConfigProvider';
import { DEMO_USER } from '@/lib/auth/demo';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockDemo = false;
vi.mock('@/lib/demoMode', () => ({ isDemoMode: () => mockDemo }));

let mockUser: { id: string; orgId?: string } | null = null;
let mockAuthed = false;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: mockUser, isAuthenticated: mockAuthed }),
}));

function stubFetch(impl?: (...a: unknown[]) => unknown) {
  const spy = vi.fn(
    impl ??
      (async () => ({ ok: true, json: async () => ({ config: null, canManage: false }) })),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  mockDemo = false;
  mockUser = null;
  mockAuthed = false;
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

// Consumer that surfaces canManage and lets a test fire updateOrgConfig.
function Probe() {
  const { canManage, updateOrgConfig } = useOrgConfig();
  return (
    <div>
      <span data-testid="canManage">{String(canManage)}</span>
      <button
        type="button"
        onClick={() => void updateOrgConfig({ policy: {}, templates: [], exercises: [] })}
      >
        save
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <OrgConfigProvider>
      <Probe />
    </OrgConfigProvider>,
  );
}

describe('OrgConfigProvider demo isolation', () => {
  it('makes ZERO config requests in demo mode', async () => {
    mockDemo = true;
    mockAuthed = true;
    mockUser = { id: 'someone', orgId: 'org-1' };
    const spy = stubFetch();
    renderProvider();
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it('makes ZERO config requests for the test-user (DEMO_USER) session', async () => {
    mockAuthed = true;
    mockUser = { id: DEMO_USER.id, orgId: 'org-1' };
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

  it('makes ZERO config requests for a registered user with no org', async () => {
    mockAuthed = true;
    mockUser = { id: 'real-user-1' }; // no orgId
    const spy = stubFetch();
    renderProvider();
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('OrgConfigProvider for an org member', () => {
  it('loads org config on mount (GET /api/config/org)', async () => {
    mockAuthed = true;
    mockUser = { id: 'real-user-2', orgId: 'org-1' };
    const spy = stubFetch();
    renderProvider();
    await waitFor(() => {
      const got = spy.mock.calls.find((c) => c[0] === '/api/config/org');
      expect(got).toBeTruthy();
    });
  });

  it('does NOT PUT for a non-manager (server says canManage:false)', async () => {
    mockAuthed = true;
    mockUser = { id: 'member', orgId: 'org-1' };
    const spy = stubFetch();
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('canManage')).toHaveTextContent('false'));

    fireEvent.click(screen.getByText('save'));
    await new Promise((r) => setTimeout(r, 20));
    const put = spy.mock.calls.find(
      (c) => c[0] === '/api/config/org' && (c[1] as RequestInit | undefined)?.method === 'PUT',
    );
    expect(put).toBeFalsy();
  });

  it('PUTs for a manager (server says canManage:true)', async () => {
    mockAuthed = true;
    mockUser = { id: 'manager', orgId: 'org-1' };
    const spy = stubFetch(async (...a: unknown[]) => {
      const method = (a[1] as RequestInit | undefined)?.method;
      if (method === 'PUT') return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ config: null, canManage: true }) };
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('canManage')).toHaveTextContent('true'));

    fireEvent.click(screen.getByText('save'));
    await waitFor(() => {
      const put = spy.mock.calls.find(
        (c) => c[0] === '/api/config/org' && (c[1] as RequestInit | undefined)?.method === 'PUT',
      );
      expect(put).toBeTruthy();
    });
  });
});
