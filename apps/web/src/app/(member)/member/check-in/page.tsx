'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';
import { calculateHaversineDistanceMeters } from '@tfhc/shared';

export default function CheckInPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [activeRecord, setActiveRecord] = useState<any>(null);
  const [availabilityData, setAvailabilityData] = useState<any>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const meeting = meetings.find(m => m.id === meetingId);
  const isCommittedViaAvailability = Boolean(
    availabilityData?.submitted &&
      (availabilityData?.selectedMeetingIds?.includes(meetingId) || (!meetingId && availabilityData?.selectedMeetingIds?.length > 0))
  );

  const checkAttendanceStatus = useCallback(async (targetMeetingId: string) => {
    if (!targetMeetingId) {
      setIsClockedIn(false);
      setActiveRecord(null);
      return;
    }
    setStatusLoading(true);
    try {
      const res = await fetchApi<{ clockedIn: boolean; record: any }>(`/attendance/status?meetingId=${targetMeetingId}`);
      if (!mounted.current) return;
      setIsClockedIn(Boolean(res?.clockedIn));
      setActiveRecord(res?.record || null);
    } catch {
      if (mounted.current) {
        setIsClockedIn(false);
        setActiveRecord(null);
      }
    } finally {
      if (mounted.current) setStatusLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [data, avail] = await Promise.all([
        fetchApi<any[]>('/meetings/attendance-open'),
        fetchApi<any>('/availability/current').catch(() => null),
      ]);
      if (!mounted.current) return;
      setMeetings(data);
      setAvailabilityData(avail);
      const requested = new URLSearchParams(window.location.search).get('meetingId');
      if (requested && !data.some(m => m.id === requested)) {
        setError('The selected service is not open for attendance. Choose another open service or ask an administrator.');
      }
      const selected = data.some(m => m.id === (requested || data[0]?.id))
        ? requested || data[0]?.id || ''
        : '';
      setMeetingId(selected);
      if (selected) {
        void checkAttendanceStatus(selected);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Could not load services.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [checkAttendanceStatus]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const handleMeetingChange = (newId: string) => {
    setMeetingId(newId);
    setLocation(null);
    setError('');
    setResult(null);
    if (newId) {
      void checkAttendanceStatus(newId);
    } else {
      setIsClockedIn(false);
      setActiveRecord(null);
    }
  };

  const checkIn = async () => {
    if (pending.current || !meeting || busy) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (!navigator.onLine) throw new Error('You are offline. Connect to the internet, then try again.');
      if (!navigator.geolocation) throw new Error('This browser does not support location access. Please use a supported browser.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
      );
      if (!mounted.current) return;
      setLocation(position.coords);
      const record = await fetchApi('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: meeting.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          gpsAccuracy: position.coords.accuracy,
          deviceInfo: navigator.userAgent.slice(0, 500),
        }),
      });
      localStorage.setItem('tfhc_venue_session', JSON.stringify({
        latitude: meeting.latitude,
        longitude: meeting.longitude,
        radius: meeting.geofenceRadiusMeters,
        checkedAt: Date.now(),
      }));
      if (mounted.current) {
        setResult(record);
        setIsClockedIn(true);
        setActiveRecord(record);
      }
    } catch (e: any) {
      if (mounted.current) {
        setError(
          e.code === 1
            ? 'Location permission denied. Allow location access in your browser settings, then try again.'
            : e.code === 2
            ? 'Your location is unavailable. Enable device location and try outdoors.'
            : e.code === 3
            ? 'Location took too long. Move outdoors and try again.'
            : e.message || 'Check-in failed. Please try again.'
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const clockOut = async () => {
    if (pending.current || !meeting || busy) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (!navigator.onLine) throw new Error('You are offline. Connect to the internet, then try again.');
      await fetchApi('/attendance/clock-out', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: meeting.id,
          deviceInfo: navigator.userAgent.slice(0, 500),
        }),
      });
      localStorage.removeItem('tfhc_venue_session');
      if (mounted.current) {
        setIsClockedIn(false);
        setActiveRecord(null);
        setResult(null);
      }
    } catch (e: any) {
      if (mounted.current) {
        setError(e.message || 'Clock out failed. Please try again.');
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const distance = location && meeting ? Math.round(calculateHaversineDistanceMeters(location, meeting)) : null;

  return (
    <div className="bg-background text-on-background min-h-screen pb-28">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-4 h-16 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-base sm:text-lg font-bold text-primary">GPS Attendance &amp; Clock-In</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center overflow-hidden border border-outline-variant p-1">
          <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-xl mx-auto">
        {loading ? (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center space-y-3 shadow-xs">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-bold text-on-surface">Finding open services &amp; checking status...</p>
          </div>
        ) : meetings.length ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="check-in-service" className="font-bold text-sm text-on-surface">Select Service</label>
              <select
                id="check-in-service"
                value={meetingId}
                disabled={busy}
                onChange={(e) => handleMeetingChange(e.target.value)}
                className="w-full rounded-xl p-3.5 border border-outline-variant bg-surface font-semibold text-on-surface shadow-xs focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {!meetingId && <option value="">Choose an open service</option>}
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {new Date(m.startTime).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })}
                  </option>
                ))}
              </select>
            </div>

            {isCommittedViaAvailability && (
              <div className="p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 text-xs sm:text-sm font-semibold flex items-start gap-3 shadow-xs">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl shrink-0">verified</span>
                <div>
                  <p className="font-extrabold text-emerald-900 dark:text-emerald-100">Availability Already Submitted</p>
                  <p className="font-medium text-emerald-800 dark:text-emerald-300 mt-0.5">
                    You have submitted your availability for this week&apos;s service. Remember to clock in when you arrive at church.
                  </p>
                </div>
              </div>
            )}

            {meeting && (
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4 shadow-xs">
                <div>
                  <h2 className="text-lg font-bold text-primary">{meeting.title}</h2>
                  <p className="text-sm font-semibold text-on-surface-variant flex items-center gap-1.5 mt-1">
                    <span className="material-symbols-outlined text-primary text-[18px]">church</span>
                    <span>{meeting.locationName || "The Father's House Church, 90 Alagbole–Akute Road"}</span>
                  </p>
                </div>

                {/* State B: Already Clocked In Banner */}
                {isClockedIn && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="p-4 rounded-2xl border-2 border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 shadow-md animate-clockin-pulse flex flex-col items-center text-center gap-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                      <span className="text-sm sm:text-base font-black tracking-wide uppercase text-emerald-700 dark:text-emerald-300">
                        YOU HAVE ALREADY CLOCKED IN.
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      {activeRecord?.actualArrivalTime
                        ? `Clocked in at ${new Date(activeRecord.actualArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Your attendance session is active for this service.'}
                    </p>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-surface-variant/40 border border-outline-variant/20 text-xs text-on-surface-variant space-y-1">
                  <p className="font-bold text-on-surface">📍 Location Rules</p>
                  {meeting.geofenceRadiusMeters >= 50000 ? (
                    <p>No location restriction for this service. You can clock in from any location.</p>
                  ) : (
                    <p>Your device GPS location must be within <strong>{meeting.geofenceRadiusMeters} meters</strong> of {meeting.locationName || 'the venue'} to mark attendance.</p>
                  )}
                </div>

                {distance !== null && (
                  <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                    meeting.geofenceRadiusMeters >= 50000 || distance <= meeting.geofenceRadiusMeters
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800'
                  }`}>
                    <span>Distance: {distance}m from {meeting.locationName || 'venue'}</span>
                    <span>Accuracy: ±{Math.round(location!.accuracy)}m</span>
                  </div>
                )}

                {/* Primary Action Button */}
                {statusLoading ? (
                  <div className="w-full py-4 text-center">
                    <span className="text-xs font-bold text-slate-400">Verifying session status…</span>
                  </div>
                ) : isClockedIn ? (
                  <button
                    aria-label="Clock out now"
                    onClick={clockOut}
                    disabled={busy || !meeting}
                    className="w-full rounded-xl p-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 font-black text-base transition-transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-md border border-slate-700/20"
                  >
                    <span className="material-symbols-outlined text-red-500">logout</span>
                    <span>{busy ? 'Clocking Out…' : 'Clock Out'}</span>
                  </button>
                ) : (
                  <button
                    aria-label="Clock in now"
                    onClick={checkIn}
                    disabled={busy || !meeting}
                    className="w-full rounded-xl p-4 bg-primary hover:bg-primary-hover text-on-primary font-black text-base transition-transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                  >
                    <span className="material-symbols-outlined">my_location</span>
                    <span>{busy ? 'Verifying GPS Location…' : 'Clock In'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 text-center space-y-2">
            <span className="material-symbols-outlined text-4xl text-outline">event_busy</span>
            <p className="font-bold text-on-surface">No Service Open</p>
            <p className="text-sm text-on-surface-variant">Attendance check-in opens 30 minutes before each service. Please check back when service starts.</p>
          </div>
        )}

        {!busy && (
          <button
            onClick={load}
            disabled={loading || statusLoading}
            className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Refresh</span>
          </button>
        )}

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-error-container text-on-error-container text-sm font-semibold space-y-1 border border-error/20">
            <p className="font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>Attendance Notice</span>
            </p>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <section className="rounded-2xl p-6 bg-surface-container border border-primary/20 space-y-4 shadow-md text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-600 text-white mx-auto flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-2xl">check</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-primary">Attendance Recorded!</h2>
              <p className="text-sm font-semibold text-on-surface-variant mt-1">Status: <span className="font-bold text-emerald-700">{result.status}</span></p>
              <p className="text-sm font-semibold text-on-surface-variant">Points Earned: <span className="font-bold text-primary">{result.pointsEarned}</span></p>
            </div>
            <Link
              href="/member/my-attendance"
              className="inline-flex items-center justify-center gap-1.5 w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">fact_check</span>
              <span>View Attendance Record</span>
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

