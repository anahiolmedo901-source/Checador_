import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, AuthUser, clearSession, getUser, setSession } from './api';
import { hasPermission } from './permissions';

interface AuthContextValue {
  user: AuthUser | null;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await api.post<{ access_token: string; employee: AuthUser['employee'] }>('/auth/login', {
      email: identifier,
      password,
    });
    const session: AuthUser = {
      id: data.employee.id,
      email: data.employee.code + '@check.local',
      role: data.employee.role,
      employee: data.employee,
    };
    setSession(data.access_token, session);
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
      can: (p: string) => (user ? hasPermission(user.role, p) : false),
    }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}