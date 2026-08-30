'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken } from '../lib/api';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.push('/member');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col items-center justify-center font-body-md">
      <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4 p-2 shadow-sm border border-outline-variant/20">
        <img src="/logo-icon.svg" alt="TFHC Logo" className="w-full h-full object-contain" />
      </div>
      <p className="font-label-md text-label-md text-on-surface-variant animate-pulse">
        Loading TFHC Orderliness Tracker...
      </p>
    </div>
  );
}
