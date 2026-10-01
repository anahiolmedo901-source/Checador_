import { Navigate, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';

export function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'employee') return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}

export function RequirePerm({ permission, children }: { permission: string; children: ReactNode }) {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!can(permission)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}