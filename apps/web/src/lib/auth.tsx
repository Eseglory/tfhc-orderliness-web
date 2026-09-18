'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchApi, getAuthToken, getCachedUser, saveAuthUser, removeAuthToken } from './api';

export interface CurrentUser {
  userId: string;
  email: string;
  role: 'ADMIN' | 'LEADER' | 'MEMBER' | string;
  memberId?: string;
  firstName?: string;
  lastName?: string;
  profilePhotoUrl?: string | null;
  photoUrl?: string | null;
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
  const [user, setUser] = useState<CurrentUser | null>(() => getCachedUser());
  const [loading, setLoading] = useState(() => !getCachedUser());
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const changed = (event: Event) => {
      if (event.type === 'storage' && (event as StorageEvent).key !== 'tfhc_token') return;
      setUser(null); setNonce(value => value + 1);
    };
    window.addEventListener('tfhc:account-change', changed);
    window.addEventListener('tfhc:logout', changed);
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener('tfhc:account-change', changed);
      window.removeEventListener('tfhc:logout', changed);
      window.removeEventListener('storage', changed);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    if (!token) { setUser(null); setLoading(false); setError(''); return; }
    if (!getCachedUser()) {
      setLoading(true);
    }
    fetchApi<CurrentUser>('/auth/me')
      .then((data) => {
        if (cancelled || getAuthToken() !== token) return;
        const normalized: CurrentUser = {
          ...data,
          permissions: data.permissions ?? [],
          accessRoles: data.accessRoles ?? [],
        };
        setUser(normalized);
        saveAuthUser(normalized, Boolean(localStorage.getItem('tfhc_token')));
        setError('');
      })
      .catch((err) => {
        if (cancelled || getAuthToken() !== token) return;
        if (err?.status === 401 || err?.status === 403) {
          removeAuthToken();
          setUser(null);
        }
        setError(err instanceof Error ? err.message : 'Could not load your account');
      })
      .finally(() => !cancelled && getAuthToken() === token && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const can = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      const perms = Array.isArray(user.permissions) ? user.permissions : [];
      if (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'SUPERADMIN' || perms.includes('*')) return true;
      return permissions.every((p) => perms.includes(p));
    },
    [user],
  );

  const canAny = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      const perms = Array.isArray(user.permissions) ? user.permissions : [];
      if (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'SUPERADMIN' || perms.includes('*')) return true;
      return permissions.some((p) => perms.includes(p));
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
