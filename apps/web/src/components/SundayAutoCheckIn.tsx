'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { fetchApi, getAuthToken } from '../lib/api';

export function SundayAutoCheckIn() {
  const pathname = usePathname();
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMessage('');
    if (!pathname.startsWith('/member')) return;
    let disposed = false;
    let busy = false;
    const check = async () => {
      if (disposed || busy || document.visibilityState !== 'visible' || !getAuthToken()) return;
      if (new Date(Date.now() + 3600000).getUTCDay() !== 0) { setMessage(''); return; }
      busy = true;
      const token = getAuthToken();
      const current = () => !disposed && document.visibilityState === 'visible' && getAuthToken() === token;
      try {
        const status = await fetchApi<{ enabled: boolean; meetings: { id: string; title: string }[] }>('/attendance/sunday-auto-check-in');
        if (!current()) return;
        if (!status.enabled) { setMessage(''); return; }
        setMessage('Sunday automatic check-in is active. Keep the app open with location enabled for later services.');
        for (const meeting of status.meetings) {
          if (!current()) return;
          if (!navigator.onLine || !navigator.geolocation) throw new Error('Connect to the internet and enable location to continue automatic check-in.');
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
          });
          if (!current()) return;
          await fetchApi('/attendance/sunday-auto-check-in', {
            method: 'POST',
            body: JSON.stringify({ meetingId: meeting.id, latitude: position.coords.latitude,
              longitude: position.coords.longitude, gpsAccuracy: position.coords.accuracy,
              locationTimestamp: position.timestamp, deviceInfo: navigator.userAgent.slice(0, 500) }),
          });
          if (!current()) return;
          setMessage(`Automatically checked in for ${meeting.title}. Keep the app open for later Sunday services.`);
          window.dispatchEvent(new Event('attendance-updated'));
        }
      } catch {
        if (current()) setMessage('Sunday automatic check-in could not be verified. Keep the app open with internet and location enabled. We will retry; you can also check in manually.');
      } finally { busy = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30000);
    const resume = () => void check();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('attendance-manual-check-in', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('attendance-manual-check-in', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [pathname]);

  if (!message || !pathname.startsWith('/member')) return null;
  return <div role="status" className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">{message}</div>;
}
