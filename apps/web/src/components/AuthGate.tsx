'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, fetchApi, getAuthToken, removeAuthToken } from '../lib/api';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorizedPath, setAuthorizedPath] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const protectedRoute = pathname.startsWith('/admin') || pathname.startsWith('/member');
  useEffect(() => {
    if (!protectedRoute) return;
    let cancelled = false;
    setError('');
    if (!getAuthToken()) { router.replace('/login'); return; }
    fetchApi('/auth/me').then(user => {
      if (cancelled) return;
      if (pathname.startsWith('/admin') && !['ADMIN', 'LEADER'].includes(user.role)) {
        router.replace('/member');
      } else if (pathname.startsWith('/member') && !user.memberId) {
        router.replace('/admin');
      } else setAuthorizedPath(pathname);
    }).catch((failure) => {
      if (cancelled) return;
      if (failure instanceof ApiError && failure.status === 401) {
        removeAuthToken();
        router.replace('/login');
      } else {
        setError('Unable to connect to your account. Check your connection and retry.');
      }
    });
    return () => { cancelled = true; };
  }, [pathname, protectedRoute, router, attempt]);
  if (protectedRoute && error) return <main className="p-6 space-y-4"><p role="alert">{error}</p><button className="rounded-lg p-3 bg-primary text-on-primary" onClick={() => setAttempt(value => value + 1)}>Retry connection</button></main>;
  if (protectedRoute && authorizedPath !== pathname) return <p role="status" className="p-6">Loading your account…</p>;
  return <>{children}</>;
}
