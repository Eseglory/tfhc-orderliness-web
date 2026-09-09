'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAuthToken, removeAuthToken } from '../lib/api';
import { AuthTransition } from './AuthTransition';

export function VenueSessionGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!pathname.startsWith('/member')) {setLeaving(false); return;}
    let busy = false;
    let disposed = false;
    const check = () => {
      if (busy || document.visibilityState !== 'visible' || !getAuthToken()) return;
      const raw = localStorage.getItem('tfhc_venue_session');
      if (!raw) return;
      let venue: any;
      try {venue = JSON.parse(raw);} catch {localStorage.removeItem('tfhc_venue_session'); return;}
      if (Date.now() - venue.checkedAt < 600000 || !navigator.geolocation) return;
      busy = true;
      navigator.geolocation.getCurrentPosition(position => {
        busy = false;
        if (disposed) return;
        const {latitude, longitude, accuracy} = position.coords;
        if (![latitude,longitude,accuracy,venue.latitude,venue.longitude,venue.radius].every(Number.isFinite) || accuracy > 100) return;
        const rad = (n:number) => n*Math.PI/180;
        const a = Math.sin(rad(latitude-venue.latitude)/2)**2 + Math.cos(rad(latitude))*Math.cos(rad(venue.latitude))*Math.sin(rad(longitude-venue.longitude)/2)**2;
        const distance = 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
        if (distance - accuracy > venue.radius) {
          setLeaving(true); removeAuthToken();
          requestAnimationFrame(() => router.replace('/login?reason=left-venue'));
        } else localStorage.setItem('tfhc_venue_session',JSON.stringify({...venue,checkedAt:Date.now()}));
      }, () => {busy=false;}, {enableHighAccuracy:true,maximumAge:0,timeout:15000});
    };
    check();
    const timer = setInterval(check,60000);
    window.addEventListener('focus',check); document.addEventListener('visibilitychange',check);
    return () => {disposed=true;clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
  }, [pathname,router]);
  return leaving ? <AuthTransition action="out" /> : null;
}
