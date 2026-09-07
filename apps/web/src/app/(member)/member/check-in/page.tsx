'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
import { calculateHaversineDistanceMeters } from '@tfhc/shared';
import type { Html5Qrcode } from 'html5-qrcode';

export default function CheckInPage() {
  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    fetchApi('/meetings/active').then(setMeeting).catch(e => setError(e.message)).finally(() => setLoading(false));
    return () => { mounted.current = false; if (scanner.current?.isScanning) void scanner.current.stop().catch(() => {}); };
  }, []);
  const distance = location && meeting ? Math.round(calculateHaversineDistanceMeters(location, meeting)) : null;
  const submit = async (qrPayload: string, coordinates: GeolocationCoordinates) => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      if (scanner.current?.isScanning) await scanner.current.stop();
      setScanning(false);
      const record = await fetchApi('/attendance/check-in', { method: 'POST', body: JSON.stringify({
        meetingId: meeting.id, latitude: coordinates.latitude, longitude: coordinates.longitude,
        gpsAccuracy: coordinates.accuracy, qrPayload,
      }) });
      if (mounted.current) setResult(record);
    } catch (e: any) { if (mounted.current) setError(e.message); }
    finally { submitting.current = false; }
  };
  const start = async () => {
    setError('');
    setScanning(true);
    try {
      if (!navigator.geolocation) throw new Error('Geolocation is not supported by your browser.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy:true,timeout:10000,maximumAge:0}));
      if (!mounted.current) return;
      setLocation(position.coords);
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!mounted.current) return;
      const reader = new Html5Qrcode('meeting-qr-reader');
      scanner.current = reader;
      await reader.start({ facingMode: 'environment' }, {fps:10,qrbox:220}, decoded => { void submit(decoded, position.coords); }, () => {});
      if (!mounted.current && reader.isScanning) await reader.stop();
    } catch (e: any) { if (mounted.current) { setScanning(false); setError(e.message || 'Camera access failed. Allow camera and location permissions, then retry.'); } }
  };
  return <main className="min-h-screen max-w-xl mx-auto p-5 pb-28 space-y-5">
    <Link href="/member" className="text-primary">← Home</Link>
    <h1 className="text-2xl font-bold">Scan Meeting QR Code</h1>
    {loading ? <p role="status">Loading meeting…</p> : meeting ? <>
      <h2 className="text-xl">{meeting.title}</h2><p>{meeting.locationName}</p>
      <p>Allow camera and location access, then scan the current QR code displayed at the venue.</p>
      {distance !== null && <p>{distance}m from venue · Allowed radius: {meeting.geofenceRadiusMeters}m</p>}
      <div id="meeting-qr-reader" className="overflow-hidden rounded-xl" />
      {!result && <button onClick={start} disabled={scanning} className="w-full rounded-lg p-4 bg-primary text-on-primary disabled:opacity-50">{scanning ? 'Scanning…' : 'Start QR Scan'}</button>}
    </> : <p>No active meeting is open for attendance.</p>}
    {error && <p role="alert" className="p-3 rounded bg-error-container text-on-error-container">{error}</p>}
    {result && <section className="rounded-xl p-5 bg-surface-container space-y-3"><h2 className="text-xl font-bold">Check-In Confirmed!</h2><p>Status: {result.status}</p><p>Points earned: {result.pointsEarned}</p><Link href="/member/my-attendance">View attendance history</Link></section>}
  </main>;
}
