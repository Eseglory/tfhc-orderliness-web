'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="bg-amber-600 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 shadow-lg sticky top-0 z-50 animate-bounce">
      <WifiOff className="w-4 h-4" />
      <span>Offline Mode Active • Displaying cached records. Network check-in is disabled.</span>
    </div>
  );
};
