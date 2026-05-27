import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalTopNav } from '../GlobalTopNav';

// Mutable auth stub — orgId drives whether the Organization nav item appears.
let mockOrgId: string | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'u1', email: 'me@example.com', orgId: mockOrgId },
  }),
}));

// Stub providers used by the nav (they reach into AppDataProvider in real use).
vi.mock('@/contexts/NotesProvider', () => ({
  useNotes: () => ({
    notes: [
      { id: 'a', finalized: false },
      { id: 'b', finalized: false },
      { id: 'c', finalized: true },
    ],
  }),
}));
vi.mock('@/contexts/PatientsProvider', () => ({
  usePatients: () => ({ patients: [] }),
}));
vi.mock('@/contexts/ClinicianProvider', () => ({
  useClinician: () => ({ clinician: { name: 'Dr Test' } }),
}));
vi.mock('@/contexts/NotificationsProvider', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAllRead: () => {},
    clearAll: () => {},
  }),
}));
vi.mock('@/contexts/SessionResetContext', () => ({
  useSessionReset: () => ({ onResetSession: undefined }),
}));
vi.mock('@/contexts/GateContext', () => ({
  useGate: () => ({ logout: () => {} }),
}));
vi.mock('@/hooks/useStorageEstimate', () => ({
  useStorageEstimate: () => ({ localModelsUnavailable: false, available: null, loading: false }),
}));
vi.mock('@/lib/vault/vault', () => ({
  vault: { isInitialized: () => false, isUnlocked: () => false },
}));
vi.mock('@/contexts/DebugDrawerProvider', () => ({
  useDebugDrawer: () => ({ openDebug: () => {} }),
}));
vi.mock('@/lib/debug/flags', () => ({
  DEBUG_TOOLS_ENABLED: true,
}));

describe('GlobalTopNav', () => {
  beforeEach(() => {
    mockOrgId = null;
  });

  it('renders the primary nav items', () => {
    render(<MemoryRouter><GlobalTopNav /></MemoryRouter>);
    expect(screen.getByText('My Chart')).toBeInTheDocument();
    expect(screen.getByText('Review queue')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows pending-count badge on Review queue when notes are unfinalized', () => {
    render(<MemoryRouter><GlobalTopNav /></MemoryRouter>);
    expect(screen.getByLabelText('2 pending')).toBeInTheDocument();
  });

  it('highlights the active route', () => {
    render(<MemoryRouter initialEntries={['/patients']}><GlobalTopNav /></MemoryRouter>);
    const patientsLink = screen.getByText('Patients').closest('a');
    expect(patientsLink?.className).toContain('active');
  });

  it('hides the Organization link for personal/demo accounts (no orgId)', () => {
    mockOrgId = null;
    render(<MemoryRouter><GlobalTopNav /></MemoryRouter>);
    expect(screen.queryByText('Organization')).not.toBeInTheDocument();
  });

  it('shows the Organization link when the user belongs to an org', () => {
    mockOrgId = 'org-123';
    render(<MemoryRouter><GlobalTopNav /></MemoryRouter>);
    // Appears twice (horizontal nav + hidden dropdown), so use getAllByText.
    expect(screen.getAllByText('Organization').length).toBeGreaterThan(0);
  });
});
