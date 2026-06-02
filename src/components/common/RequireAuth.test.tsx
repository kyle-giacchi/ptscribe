import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

// Controllable auth state. vi.hoisted so it exists before the mock factory runs.
const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: false,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <div>PROTECTED CONTENT</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.isLoading = false;
  authState.isAuthenticated = false;
});

describe('RequireAuth', () => {
  it('redirects an unauthenticated visit to /login', () => {
    authState.isAuthenticated = false;
    renderAt('/today');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument();
  });

  it('renders children once authenticated', () => {
    authState.isAuthenticated = true;
    renderAt('/today');
    expect(screen.getByText('PROTECTED CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });

  it('shows a loader (neither redirect nor content) while the session is resolving', () => {
    authState.isLoading = true;
    renderAt('/today');
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });
});
