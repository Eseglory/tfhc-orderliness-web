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
      // Only Super Admin or wildcard holders bypass granular permission checks
      if (user.isSuperAdmin || perms.includes('*')) return true;
      return permissions.every((p) => perms.includes(p));
    },
    [user],
  );

  const canAny = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      const perms = Array.isArray(user.permissions) ? user.permissions : [];
      // Only Super Admin or wildcard holders bypass granular permission checks
      if (user.isSuperAdmin || perms.includes('*')) return true;
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

export const AUTHORIZED_PERSONS = {
  ESEOSA_GLORY: 'engreseglory@gmail.com',
  DANIEL_OGUAMANAM: 'danoguamanam@gmail.com',
  JACOB_ONOJA: 'onojamonday123@gmail.com',
  LOVETH_UBABUIKE: 'ngoziloveth41@gmail.com',
  AANU_OYENIRAN: 'aanuoyeniran@gmail.com',
  VICTORIA_OLANREWAJU: 'olarenwajuvictoria@gmail.com',
  CONFORT_STEPHEN: 'comfort.osariroya@gmail.com',
  PASEDA_OLUWAFEMI: 'fpaseda@yahoo.com',
} as const;

export function isEseosaGlory(user?: CurrentUser | null): boolean {
  return user?.email?.toLowerCase() === AUTHORIZED_PERSONS.ESEOSA_GLORY;
}

export function isDaniel(user?: CurrentUser | null): boolean {
  return user?.email?.toLowerCase() === AUTHORIZED_PERSONS.DANIEL_OGUAMANAM;
}

export function isLoveth(user?: CurrentUser | null): boolean {
  return user?.email?.toLowerCase() === AUTHORIZED_PERSONS.LOVETH_UBABUIKE;
}

export function canCreateWardrobe(user?: CurrentUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*') || user.permissions?.includes('wardrobe.manage')) return true;
  const email = user.email?.toLowerCase();
  return (
    email === AUTHORIZED_PERSONS.AANU_OYENIRAN ||
    email === AUTHORIZED_PERSONS.VICTORIA_OLANREWAJU ||
    email === AUTHORIZED_PERSONS.ESEOSA_GLORY
  );
}

export function canCreateEvents(user?: CurrentUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*') || user.permissions?.includes('events.create')) return true;
  const email = user.email?.toLowerCase();
  return (
    email === AUTHORIZED_PERSONS.CONFORT_STEPHEN ||
    email === AUTHORIZED_PERSONS.PASEDA_OLUWAFEMI ||
    email === AUTHORIZED_PERSONS.ESEOSA_GLORY
  );
}

export function canManageFinance(user?: CurrentUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*')) return true;
  return isEseosaGlory(user);
}

export function canManageApprovals(user?: CurrentUser | null): boolean {
  if (!user) return false;
  if (
    user.isSuperAdmin ||
    user.permissions?.includes('*') ||
    user.permissions?.includes('approvals.act') ||
    user.permissions?.includes('approvals.configure')
  ) {
    return true;
  }
  return false;
}

export function canCreateWelfare(user?: CurrentUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*') || user.permissions?.includes('welfare.create')) return true;
  return isLoveth(user);
}

export function canDisburseWelfare(user?: CurrentUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*') || user.permissions?.includes('welfare.disburse')) return true;
  return isEseosaGlory(user);
}

export function isJacob(target?: { email?: string | null; user?: { email?: string | null } | null } | null): boolean {
  const email = target?.email || target?.user?.email;
  return email?.toLowerCase() === AUTHORIZED_PERSONS.JACOB_ONOJA;
}

export function canApproveAbsenceFor(
  reviewer?: CurrentUser | null,
  requester?: { email?: string | null; user?: { email?: string | null } | null } | null,
): boolean {
  if (!reviewer) return false;
  if (isJacob(requester)) {
    return isDaniel(reviewer);
  }
  return true;
}

