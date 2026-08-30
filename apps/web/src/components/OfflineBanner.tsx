'use client';

import React, { useState, useEffect } from 'react';

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
    <div className="bg-secondary-container text-on-secondary-container px-4 py-2 font-label-md text-label-md font-bold flex items-center justify-center gap-2 shadow-sm sticky top-0 z-50">
      <span className="material-symbols-outlined text-[18px]">wifi_off</span>
      <span>Offline Mode Active • Displaying cached records. Network check-in is disabled.</span>
    </div>
  );
};
