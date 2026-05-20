import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalTopNav } from '../GlobalTopNav';

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
vi.mock('@/contexts/SessionActionsContext', () => ({
  useSessionActions: () => ({ onResetSession: undefined }),
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

describe('GlobalTopNav', () => {
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
});
