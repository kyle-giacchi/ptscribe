// src/pages/OrgNew.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrgNew } from './OrgNew';

// Mock motion/react to avoid animation issues in jsdom
vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useAuth so we don't need the full provider tree
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    currentUser: { email: 'owner@example.com' },
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mock newId to return stable IDs
let idCounter = 0;
vi.mock('@/utils/ids', () => ({ newId: () => `id-${++idCounter}` }));

function stubFetch(implementation?: (...args: unknown[]) => unknown) {
  const spy = vi.fn(implementation);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderOrgNew(token = 'valid-token') {
  return render(
    <MemoryRouter initialEntries={[`/org/new?token=${token}`]}>
      <Routes>
        <Route path="/org/new" element={<OrgNew />} />
        <Route path="/today" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  idCounter = 0;
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('token gate', () => {
  it('shows spinner while validating', () => {
    stubFetch(() => new Promise(() => {})); // never resolves
    renderOrgNew();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows error gate for invalid token', async () => {
    stubFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: false, consumed: false }),
    });
    renderOrgNew('bad-token');
    await waitFor(() => {
      expect(screen.getByText('Unable to continue')).toBeInTheDocument();
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    });
  });

  it('shows already-in-org gate when user has an existing org', async () => {
    stubFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, consumed: false, alreadyInOrg: true }),
    });
    renderOrgNew();
    await waitFor(() => {
      expect(screen.getByText(/already associated with an organization/i)).toBeInTheDocument();
    });
  });

  it('shows consumed message for used token', async () => {
    stubFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: false, consumed: true }),
    });
    renderOrgNew('used-token');
    await waitFor(() => {
      expect(screen.getByText(/already been used/i)).toBeInTheDocument();
    });
  });

  it('renders wizard for valid token', async () => {
    stubFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, consumed: false }),
    });
    renderOrgNew();
    await waitFor(() => {
      expect(screen.getByText('Organization details')).toBeInTheDocument();
    });
  });

  it('pre-fills org name when orgName returned from validate', async () => {
    stubFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, consumed: false, orgName: 'Coastal PT' }),
    });
    renderOrgNew();
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Coastline Physical Therapy') as HTMLInputElement;
      expect(input.value).toBe('Coastal PT');
    });
  });
});

describe('Step 1 — Org Details', () => {
  async function renderStep1() {
    stubFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, consumed: false }),
    });
    renderOrgNew();
    await waitFor(() => screen.getByText('Organization details'));
  }

  it('Next button is disabled with empty fields', async () => {
    await renderStep1();
    // contactEmail is pre-filled from currentUser.email, but name and phone are empty
    const next = screen.getByText('Next').closest('button')!;
    expect(next).toBeDisabled();
  });

  it('Next button enables when all three fields are valid', async () => {
    await renderStep1();
    fireEvent.change(screen.getByPlaceholderText('Coastline Physical Therapy'), {
      target: { value: 'My Practice' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@yourpractice.com'), {
      target: { value: 'admin@mypractice.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 000-0000'), {
      target: { value: '5550001234' },
    });
    const next = screen.getByText('Next').closest('button')!;
    expect(next).not.toBeDisabled();
  });

  it('Next button stays disabled with invalid email', async () => {
    await renderStep1();
    fireEvent.change(screen.getByPlaceholderText('Coastline Physical Therapy'), {
      target: { value: 'My Practice' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@yourpractice.com'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 000-0000'), {
      target: { value: '5550001234' },
    });
    expect(screen.getByText('Next').closest('button')).toBeDisabled();
  });

  it('Next button stays disabled with short phone', async () => {
    await renderStep1();
    fireEvent.change(screen.getByPlaceholderText('Coastline Physical Therapy'), {
      target: { value: 'My Practice' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@yourpractice.com'), {
      target: { value: 'admin@mypractice.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 000-0000'), {
      target: { value: '123' },
    });
    expect(screen.getByText('Next').closest('button')).toBeDisabled();
  });
});

describe('Step 2 → Step 3 navigation', () => {
  async function fillStep1AndAdvance() {
    stubFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, consumed: false }),
    });
    renderOrgNew();
    await waitFor(() => screen.getByText('Organization details'));
    fireEvent.change(screen.getByPlaceholderText('Coastline Physical Therapy'), {
      target: { value: 'My Practice' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@yourpractice.com'), {
      target: { value: 'admin@mypractice.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 000-0000'), {
      target: { value: '5550001234' },
    });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Invite your team'));
  }

  it('reaches invite step after filling Step 1', async () => {
    await fillStep1AndAdvance();
    expect(screen.getByText('Invite your team')).toBeInTheDocument();
  });

  it('Back on invite step returns to details', async () => {
    await fillStep1AndAdvance();
    fireEvent.click(screen.getByText('← Back'));
    await waitFor(() => screen.getByText('Organization details'));
  });

  it('Review step shows org summary', async () => {
    await fillStep1AndAdvance();
    fireEvent.click(screen.getByRole('button', { name: /^Review$/i }));
    await waitFor(() => {
      expect(screen.getByText('Review & confirm')).toBeInTheDocument();
      expect(screen.getByText('My Practice')).toBeInTheDocument();
      expect(screen.getByText('admin@mypractice.com')).toBeInTheDocument();
    });
  });
});

describe('Submission', () => {
  async function reachReviewStep(submitMock: { ok: boolean; json: () => Promise<unknown> }) {
    stubFetch()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, consumed: false }) })
      .mockResolvedValueOnce(submitMock);
    renderOrgNew();
    await waitFor(() => screen.getByText('Organization details'));
    fireEvent.change(screen.getByPlaceholderText('Coastline Physical Therapy'), {
      target: { value: 'Test Org' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@yourpractice.com'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 000-0000'), {
      target: { value: '5550001234' },
    });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Invite your team'));
    fireEvent.click(screen.getByRole('button', { name: /^Review$/i }));
    await waitFor(() => screen.getByText('Review & confirm'));
  }

  it('navigates to /today on success', async () => {
    await reachReviewStep({ ok: true, json: async () => ({ ok: true, orgId: 'org-1' }) });
    fireEvent.click(screen.getByText('Create Organization'));
    await waitFor(() => screen.getByText('Dashboard'));
  });

  it('shows error banner on failure without navigating', async () => {
    await reachReviewStep({ ok: false, json: async () => ({ code: 'INTERNAL', error: 'Oops' }) });
    fireEvent.click(screen.getByText('Create Organization'));
    await waitFor(() => {
      expect(screen.getByText(/still valid/i)).toBeInTheDocument();
      expect(screen.getByText('Review & confirm')).toBeInTheDocument();
    });
  });

  it('shows TOKEN_CONSUMED message on that specific error', async () => {
    await reachReviewStep({
      ok: false,
      json: async () => ({ code: 'TOKEN_CONSUMED', error: 'Token already used' }),
    });
    fireEvent.click(screen.getByText('Create Organization'));
    await waitFor(() => {
      expect(screen.getByText(/already used/i)).toBeInTheDocument();
    });
  });
});
