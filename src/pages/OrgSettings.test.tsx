// src/pages/OrgSettings.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrgSettings } from './OrgSettings';
import type { MembersResponse } from './OrgSettings';

// useAuth — orgId gates whether we attempt the members fetch at all.
let mockOrgId: string | null = 'org-1';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'u-me', email: 'me@example.com', orgId: mockOrgId } }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

// The org-config card consumes these; this suite covers members/invites, so we
// stub the contexts with inert defaults (full coverage lives in their own tests).
vi.mock('@/contexts/OrgConfigProvider', () => ({
  useOrgConfig: () => ({
    loading: false,
    policy: {},
    sharedTemplates: [],
    sharedExercises: [],
    canManage: true,
    updateOrgConfig: vi.fn(async () => true),
    reload: vi.fn(async () => {}),
  }),
}));
vi.mock('@/contexts/TemplatesProvider', () => ({ useTemplates: () => ({ templates: [] }) }));
vi.mock('@/contexts/ExercisesProvider', () => ({ useExercises: () => ({ exercises: [] }) }));

// OrgKeysCard (issue 09) reads org key status via the keys client; stub it so this
// members/invites suite doesn't route those calls through the fetch mock.
vi.mock('@/services/ai/keysClient', () => ({
  getOrgKeys: async () => ({ signinRequired: false, keys: [] }),
  keyOps: () => ({
    put: vi.fn(async () => ({ ok: false, code: 'X', message: 'x' })),
    remove: vi.fn(async () => ({ ok: false, code: 'X', message: 'x' })),
    verify: vi.fn(async () => ({ ok: false, code: 'X', message: 'x' })),
  }),
}));

function stubFetch(impl?: (...args: unknown[]) => unknown) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

const baseResponse: MembersResponse = {
  org: {
    id: 'org-1',
    name: 'Coastal PT',
    contactEmail: 'admin@coastal.com',
    phone: '(555) 111-2222',
  },
  yourRole: 'owner',
  canManage: true,
  members: [
    { id: 'u-me', name: 'Me', email: 'me@example.com', role: 'owner', isYou: true },
    { id: 'u-2', name: 'Alex', email: 'alex@coastal.com', role: 'standard', isYou: false },
  ],
  invites: [
    {
      id: 'inv-1',
      email: 'pending@coastal.com',
      role: 'standard',
      createdAt: 1000,
      expiresAt: 9_999_999_999_999,
      expired: false,
    },
  ],
};

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}
function jsonErr(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrgSettings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockOrgId = 'org-1';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('load states', () => {
  it('shows the no-org panel when the session has no orgId (skips fetch)', async () => {
    mockOrgId = null;
    const spy = stubFetch();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/not part of an organization/i)).toBeInTheDocument(),
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the no-org panel when the server says NOT_IN_ORG', async () => {
    stubFetch().mockResolvedValueOnce(jsonErr(403, { code: 'NOT_IN_ORG', error: 'no' }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/not part of an organization/i)).toBeInTheDocument(),
    );
  });

  it('shows an error panel with retry on other failures', async () => {
    stubFetch().mockResolvedValueOnce(jsonErr(500, { error: 'Boom' }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Boom')).toBeInTheDocument());
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('renders members and invites once loaded', async () => {
    stubFetch().mockResolvedValueOnce(jsonOk(baseResponse));
    renderPage();
    await waitFor(() => expect(screen.getByText('Coastal PT')).toBeInTheDocument());
    expect(screen.getByText('Members (2)')).toBeInTheDocument();
    expect(screen.getByText('alex@coastal.com')).toBeInTheDocument();
    expect(screen.getByText('Pending invites (1)')).toBeInTheDocument();
    expect(screen.getByText('pending@coastal.com')).toBeInTheDocument();
  });
});

describe('role gating (canManage)', () => {
  it('shows an invite form and member controls for managers', async () => {
    stubFetch().mockResolvedValueOnce(jsonOk(baseResponse));
    renderPage();
    await waitFor(() => screen.getByText('Coastal PT'));
    expect(screen.getByPlaceholderText('teammate@example.com')).toBeInTheDocument();
    // Alex is editable → has a remove button; owner (me) and self are not.
    expect(screen.getByLabelText('Remove alex@coastal.com')).toBeInTheDocument();
  });

  it('hides invite form and member controls for view-only members', async () => {
    stubFetch().mockResolvedValueOnce(
      jsonOk({ ...baseResponse, canManage: false, yourRole: 'standard' }),
    );
    renderPage();
    await waitFor(() => screen.getByText('Coastal PT'));
    expect(screen.queryByPlaceholderText('teammate@example.com')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove alex@coastal.com')).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });

  it('never offers role/remove controls on the owner row', async () => {
    stubFetch().mockResolvedValueOnce(jsonOk(baseResponse));
    renderPage();
    await waitFor(() => screen.getByText('Coastal PT'));
    // Owner is "me" and isYou — no remove control for that row.
    expect(screen.queryByLabelText('Remove me@example.com')).not.toBeInTheDocument();
  });
});

describe('mutations', () => {
  it('sends an invite and refetches on success', async () => {
    const spy = stubFetch()
      .mockResolvedValueOnce(jsonOk(baseResponse)) // initial load
      .mockResolvedValueOnce(jsonOk({ ok: true })) // POST invite
      .mockResolvedValueOnce(jsonOk(baseResponse)); // reload
    renderPage();
    await waitFor(() => screen.getByText('Coastal PT'));

    fireEvent.change(screen.getByPlaceholderText('teammate@example.com'), {
      target: { value: 'new@coastal.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Invite sent.'));
    const inviteCall = spy.mock.calls.find((c) => c[0] === '/api/org/invite');
    expect(inviteCall).toBeTruthy();
    expect(JSON.parse((inviteCall![1] as RequestInit).body as string)).toEqual({
      email: 'new@coastal.com',
      role: 'standard',
    });
  });

  it('surfaces a server error via toast without crashing', async () => {
    stubFetch()
      .mockResolvedValueOnce(jsonOk(baseResponse))
      .mockResolvedValueOnce(jsonErr(403, { code: 'FORBIDDEN', error: 'Not allowed' }));
    renderPage();
    await waitFor(() => screen.getByText('Coastal PT'));

    fireEvent.change(screen.getByPlaceholderText('teammate@example.com'), {
      target: { value: 'new@coastal.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Not allowed'));
  });

  it('revokes a pending invite', async () => {
    const spy = stubFetch()
      .mockResolvedValueOnce(jsonOk(baseResponse))
      .mockResolvedValueOnce(jsonOk({ ok: true }))
      .mockResolvedValueOnce(jsonOk(baseResponse));
    renderPage();
    await waitFor(() => screen.getByText('Coastal PT'));

    fireEvent.click(screen.getByLabelText('Revoke invite to pending@coastal.com'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Invite revoked.'));
    const call = spy.mock.calls.find((c) => c[0] === '/api/org/invite/revoke');
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ inviteId: 'inv-1' });
  });

  it('changes a member role', async () => {
    const spy = stubFetch()
      .mockResolvedValueOnce(jsonOk(baseResponse))
      .mockResolvedValueOnce(jsonOk({ ok: true }))
      .mockResolvedValueOnce(jsonOk(baseResponse));
    renderPage();
    await waitFor(() => screen.getByText('Coastal PT'));

    // Alex's row has the editable role <select>.
    const alexRow = screen.getByText('alex@coastal.com').closest('div')!.parentElement!
      .parentElement!;
    const select = within(alexRow).getByLabelText('Role') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'manager' } });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Role updated.'));
    const call = spy.mock.calls.find((c) => c[0] === '/api/org/member/role');
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      userId: 'u-2',
      role: 'manager',
    });
  });
});
