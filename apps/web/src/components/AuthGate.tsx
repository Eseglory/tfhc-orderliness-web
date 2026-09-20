'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAuthToken, removeAuthToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LoadingScreen } from './LoadingScreen';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, error, reload } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const protectedRoute = pathname.startsWith('/admin') || pathname.startsWith('/member');

  useEffect(() => {
    if (!mounted || !protectedRoute) return;
    const token = getAuthToken();
    if (!token) {
      const loginUrl = `/login?next=${encodeURIComponent(pathname + (typeof window !== 'undefined' ? window.location.search : ''))}`;
      if (typeof window !== 'undefined') {
        window.location.href = loginUrl;
      } else {
        router.replace(loginUrl);
      }
      return;
    }
    if (user) {
      const isAdminUser = ['ADMIN', 'LEADER'].includes(user.role) || user.isSuperAdmin;
      if (pathname.startsWith('/admin') && !isAdminUser) {
        router.replace('/member');
      }
    }
  }, [mounted, pathname, protectedRoute, router, user, loading, error]);

  if (!protectedRoute) {
    return <>{children}</>;
  }

  if (!mounted) {
    return <LoadingScreen message="Loading application…" />;
  }

  const token = getAuthToken();
  if (!token) {
    return <LoadingScreen message="Redirecting to sign in…" />;
  }

  if (error && !user) {
    return (
      <main className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-background/95 dark:bg-slate-950/95 backdrop-blur-xl">
        <div className="max-w-md w-full p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center text-2xl font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Connection Notice</h2>
          <p role="alert" className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold text-sm shadow-md transition-all"
              onClick={() => reload()}
            >
              Retry Connection
            </button>
            <button
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm transition-all"
              onClick={() => {
                removeAuthToken();
                router.replace(`/login?next=${encodeURIComponent(pathname)}`);
              }}
            >
              Sign In with Another Account
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (loading && !user) {
    return <LoadingScreen message="Loading your account…" />;
  }

  if (user && pathname.startsWith('/admin')) {
    const isAdminUser = ['ADMIN', 'LEADER'].includes(user.role) || user.isSuperAdmin;
    if (!isAdminUser) {
      return <LoadingScreen message="Checking permissions…" />;
    }
  }

  return <>{children}</>;
}
