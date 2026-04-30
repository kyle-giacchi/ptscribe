import { createContext, useContext, type ReactNode } from 'react';
import { getCurrentUser, type AppUser } from '@/lib/auth';

interface AuthContextValue {
  currentUser: AppUser;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const currentUser = getCurrentUser();
  return <AuthContext.Provider value={{ currentUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
