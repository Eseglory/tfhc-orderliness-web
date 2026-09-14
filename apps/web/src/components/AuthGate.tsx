'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, fetchApi, getAuthToken, removeAuthToken } from '../lib/api';
import { LoadingScreen } from './LoadingScreen';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorizedPath, setAuthorizedPath] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const protectedRoute = pathname.startsWith('/admin') || pathname.startsWith('/member');
  useEffect(() => {
    const changed = () => { setAuthorizedPath(''); setAttempt(value => value + 1); };
    window.addEventListener('tfhc:account-change', changed);
    window.addEventListener('tfhc:logout', changed);
    return () => { window.removeEventListener('tfhc:account-change', changed); window.removeEventListener('tfhc:logout', changed); };
  }, []);
  useEffect(() => {
    if (!protectedRoute) return;
    let cancelled = false;
    setError('');
    const token = getAuthToken();
    if (!token) { router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`); return; }
    fetchApi('/auth/me').then(user => {
      if (cancelled || getAuthToken() !== token) return;
      const isAdminUser = ['ADMIN', 'LEADER'].includes(user.role) || user.isSuperAdmin;
      if (pathname.startsWith('/admin') && !isAdminUser) {
        router.replace('/member');
      } else {
        setAuthorizedPath(pathname);
      }
    }).catch((failure) => {
      if (cancelled || getAuthToken() !== token) return;
      if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) {
        removeAuthToken();
        router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
      } else {
        setError('Unable to connect to your account. Check your connection and retry.');
      }
    });
    return () => { cancelled = true; };
  }, [pathname, protectedRoute, router, attempt]);

  if (protectedRoute && error) {
    return (
      <main className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-background/95 dark:bg-slate-950/95 backdrop-blur-xl">
        <div className="max-w-md w-full p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center text-2xl font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Connection Error</h2>
          <p role="alert" className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <button
            className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold text-sm shadow-md transition-all"
            onClick={() => setAttempt(value => value + 1)}
          >
            Retry Connection
          </button>
        </div>
      </main>
    );
  }

  if (protectedRoute && authorizedPath !== pathname) {
    return <LoadingScreen message="Loading your account…" />;
  }

  return <>{children}</>;
}
