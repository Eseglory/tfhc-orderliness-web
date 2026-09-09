'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchApi } from './api';

export interface CurrentUser {
  userId: string;
  email: string;
  role: 'ADMIN' | 'LEADER' | 'MEMBER' | string;
  memberId?: string;
  firstName?: string;
  lastName?: string;
  permissions: string[];
  accessRoles: string[];
  isSuperAdmin: boolean;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  error: string;
  reload: () => void;
  can: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchApi<CurrentUser>('/auth/me')
      .then((data) => {
        if (cancelled) return;
        setUser({ ...data, permissions: data.permissions ?? [], accessRoles: data.accessRoles ?? [] });
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setUser(null);
        setError(err instanceof Error ? err.message : 'Could not load your account');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const can = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      if (user.isSuperAdmin || user.permissions.includes('*')) return true;
      return permissions.every((p) => user.permissions.includes(p));
    },
    [user],
  );

  const canAny = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      if (user.isSuperAdmin || user.permissions.includes('*')) return true;
      return permissions.some((p) => user.permissions.includes(p));
    },
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ user, loading, error, reload: () => setNonce((n) => n + 1), can, canAny }),
    [user, loading, error, can, canAny],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const NO_AUTH: AuthState = {
  user: null,
  loading: false,
  error: '',
  reload: () => undefined,
  can: () => false,
  canAny: () => false,
};

/**
 * Returns auth state. Safe to call outside an `AuthProvider` (e.g. shared
 * components rendered on both admin and member routes) — it then reports no
 * user and every permission check as false.
 */
export function useAuth(): AuthState {
  return useContext(AuthContext) ?? NO_AUTH;
}
