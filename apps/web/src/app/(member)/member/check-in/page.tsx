'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
import { calculateHaversineDistanceMeters } from '@tfhc/shared';

export default function CheckInPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const meeting = meetings.find(m => m.id === meetingId);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await fetchApi<any[]>('/meetings/attendance-open');
      if (!mounted.current) return;
      setMeetings(data);
      const requested = new URLSearchParams(window.location.search).get('meetingId');
      if (requested && !data.some(m => m.id === requested)) setError('The selected service is not open for attendance. Choose another open service or ask an administrator.');
      setMeetingId(current => data.some(m => m.id === (current || requested)) ? current || requested! : requested ? '' : data[0]?.id || '');
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Could not load services.'); }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  const checkIn = async () => {
    if (pending.current || !meeting) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (!navigator.onLine) throw new Error('You are offline. Connect to the internet, then try again.');
      if (!navigator.geolocation) throw new Error('This browser does not support location access. Please use a supported browser.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      if (!mounted.current) return;
      setLocation(position.coords);
      const record = await fetchApi('/attendance/check-in', { method: 'POST', body: JSON.stringify({ meetingId: meeting.id, latitude: position.coords.latitude, longitude: position.coords.longitude, gpsAccuracy: position.coords.accuracy, deviceInfo: navigator.userAgent.slice(0, 500) }) });
      localStorage.setItem('tfhc_venue_session', JSON.stringify({latitude:meeting.latitude,longitude:meeting.longitude,radius:meeting.geofenceRadiusMeters,checkedAt:Date.now()}));
      if (mounted.current) setResult(record);
    } catch (e: any) {
      if (mounted.current) setError(e.code === 1 ? 'Location permission denied. Allow location access in your browser settings, then try again.' : e.code === 2 ? 'Your location is unavailable. Enable device location and try outdoors.' : e.code === 3 ? 'Location took too long. Move outdoors and try again.' : e.message || 'Check-in failed. Please try again.');
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const distance = location && meeting ? Math.round(calculateHaversineDistanceMeters(location, meeting)) : null;
  return <main className="min-h-screen max-w-xl mx-auto p-5 pb-28 space-y-5">
    <Link href="/member" className="text-primary">← Home</Link><h1 className="text-2xl font-bold">Location check-in</h1>
    {loading ? <p role="status">Loading services…</p> : meetings.length ? <>
      <label htmlFor="check-in-service">Service</label><select id="check-in-service" value={meetingId} disabled={busy || !!result} onChange={e => { setMeetingId(e.target.value); setLocation(null); setError(''); }} className="w-full rounded-lg p-3 border border-outline-variant bg-surface">{!meetingId && <option value="">Choose an open service</option>}{meetings.map(m => <option key={m.id} value={m.id}>{m.title} · {new Date(m.startTime).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })}</option>)}</select>
      {meeting && <><h2 className="text-xl">{meeting.title}</h2><p>{meeting.locationName}</p><p>Allow location access to confirm you are within {meeting.geofenceRadiusMeters} metres of the venue.</p></>}
      {distance !== null && <p>{distance}m from venue · GPS accuracy: {Math.round(location!.accuracy)}m</p>}
      {!result && <button onClick={checkIn} disabled={busy || !meeting} className="w-full rounded-lg p-4 bg-primary text-on-primary disabled:opacity-50">{busy ? 'Checking your location…' : 'Check in now'}</button>}
    </> : <p>No active service is open for attendance. An administrator must open attendance before you can check in.</p>}
    {!busy && !result && <button onClick={load} disabled={loading} className="underline text-primary">Refresh services</button>}
    {error && <p role="alert" className="p-3 rounded bg-error-container text-on-error-container">{error}</p>}
    {result && <section className="rounded-xl p-5 bg-surface-container space-y-3"><h2 className="text-xl font-bold">Check-In Confirmed!</h2><p>Status: {result.status}</p><p>Points earned: {result.pointsEarned}</p><Link href="/member/my-attendance">View attendance history</Link></section>}
  </main>;
}
