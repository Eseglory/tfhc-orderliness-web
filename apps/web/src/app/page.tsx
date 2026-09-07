'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, fetchApi, getAuthToken, removeAuthToken } from '../lib/api';
import { LogoIcon } from '../components/LogoIcon';

export default function RootPage() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(false);
    const token = getAuthToken();
    if (token) {
      fetchApi('/auth/me').then(user => {
        router.replace(['ADMIN', 'LEADER'].includes(user.role) ? '/admin' : '/member');
      }).catch(failure => {
        if (failure instanceof ApiError && failure.status === 401) { removeAuthToken(); router.replace('/login'); }
        else setError(true);
      });
    } else {
      router.push('/login');
    }
  }, [router, attempt]);

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col items-center justify-center font-body-md">
      <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4 p-2 shadow-sm border border-outline-variant/20">
        <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
      </div>
      <p className="font-label-md text-label-md text-on-surface-variant animate-pulse">
        {error ? 'Unable to connect to your account.' : 'Loading TFHC Orderliness Tracker...'}
      </p>
      {error && <button onClick={() => setAttempt(value => value + 1)}>Retry connection</button>}
    </div>
  );
}
