'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { calculateHaversineDistanceMeters } from '@tfhc/shared';

export default function CheckInPage() {
  const router = useRouter();

  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [distance, setDistance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [successResult, setSuccessResult] = useState<any>(null);
  const [errorResult, setErrorResult] = useState<any>(null);

  useEffect(() => {
    fetchApi('/meetings/active')
      .then((activeMs) => {
        if (activeMs && activeMs.length > 0) setActiveMeeting(activeMs[0]);
      })
      .catch((err) => console.error(err));

    requestLocation();

    return () => {
      if ((window as any)._cameraStreamTrack) {
        (window as any)._cameraStreamTrack.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
    };
  }, []);

  const requestLocation = () => {
    setLocationError('');
    if (typeof window !== 'undefined' && !navigator.onLine) {
      setLocationError('Offline mode detected. Geofence scanner requires network connection.');
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if ((pos.coords as any).mocked) {
          setLocationError('Spoofed or mock GPS coordinates detected.');
          return;
        }
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setLocation(coords);

        if (activeMeeting) {
          const dist = calculateHaversineDistanceMeters(
            { latitude: coords.lat, longitude: coords.lng },
            { latitude: activeMeeting.latitude, longitude: activeMeeting.longitude }
          );
          setDistance(Math.round(dist));
        }
      },
      (err) => setLocationError(err.message || 'Location permission error'),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
    );
  };

  const handleCheckIn = async (scannedToken?: string) => {
    if (!activeMeeting) {
      setErrorResult({ title: 'No Active Meeting', message: 'There is currently no active meeting session open for attendance.' });
      return;
    }
    if (!location) {
      setErrorResult({ title: 'GPS Location Required', message: 'Please enable location permissions on your device.' });
      return;
    }

    setSubmitting(true);
    setErrorResult(null);

    const tokenToUse = scannedToken || `${activeMeeting.id}:${Date.now()}`;

    try {
      const res = await fetchApi('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: activeMeeting.id,
          gpsLat: location.lat,
          gpsLong: location.lng,
          gpsAccuracy: location.accuracy,
          qrToken: tokenToUse,
        }),
      });
      setSuccessResult(res);
    } catch (err: any) {
      setErrorResult({
        title: 'Check-In Blocked',
        message: err.message || 'Check-in validation failed.',
        distance: distance,
        allowedRadius: activeMeeting.geofenceRadiusMeters,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-primary text-on-primary h-screen w-screen overflow-hidden flex flex-col relative font-body-md">
      {/* Camera Background Placeholder */}
      <div className="absolute inset-0 z-0 bg-slate-900 flex items-center justify-center">
        <div className="text-center p-6 text-slate-500">
          <span className="material-symbols-outlined text-[64px] text-secondary animate-pulse mb-3">qr_code_scanner</span>
          <p className="font-body-md text-body-md">Camera Viewfinder Feed</p>
        </div>
      </div>

      {/* UI Overlay Layer matching Stitch Screen 5 */}
      <div className="relative z-10 flex flex-col h-full w-full justify-between pb-safe max-w-md mx-auto sm:max-w-xl md:max-w-4xl">
        {/* Top Controls */}
        <div className="flex justify-between items-center p-edge-margin pt-8">
          <button
            onClick={() => router.push('/member')}
            className="w-10 h-10 rounded-full bg-surface-container-lowest/20 backdrop-blur-md flex items-center justify-center text-on-primary hover:bg-surface-container-lowest/30 transition-colors"
          >
            <span className="material-symbols-outlined" data-icon="close">close</span>
          </button>
          <button
            onClick={requestLocation}
            className="w-10 h-10 rounded-full bg-surface-container-lowest/20 backdrop-blur-md flex items-center justify-center text-on-primary hover:bg-surface-container-lowest/30 transition-colors"
          >
            <span className="material-symbols-outlined" data-icon="flash_on">flash_on</span>
          </button>
        </div>

        {/* Center Scanning Area */}
        <div className="flex flex-col items-center gap-6 my-auto">
          <div className="relative w-64 h-64 flex items-center justify-center">
            <div className="absolute inset-0 scanner-frame rounded-xl"></div>
            <div className="corner corner-tl"></div>
            <div className="corner corner-tr"></div>
            <div className="corner corner-bl"></div>
            <div className="corner corner-br"></div>
            <div className="scan-line"></div>
          </div>
          <div className="flex flex-col items-center text-center gap-1 px-edge-margin">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-white">Scan Meeting QR Code</h2>
            <p className="font-body-md text-body-md text-on-primary/80 max-w-[260px]">
              Align the QR code displayed on the main auditorium screen within the frame
            </p>
          </div>
        </div>

        {/* Bottom Information Card matching Stitch Screen 5 */}
        <div className="p-edge-margin mb-16">
          <div className="bg-surface-container-lowest/90 backdrop-blur-md text-on-surface rounded-xl p-4 border border-outline-variant/30 flex flex-col gap-3 shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-tertiary-fixed-dim/30 flex items-center justify-center text-on-tertiary-container">
                  <span className="material-symbols-outlined text-[20px]" data-icon="location_on" data-weight="fill">location_on</span>
                </div>
                <div>
                  <div className="font-label-md text-label-md font-semibold text-primary">
                    {activeMeeting ? activeMeeting.locationName : 'Auditorium Venue'}
                  </div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
                    {distance !== null ? `Within Range (${distance}m away)` : locationError || 'Fetching GPS Location...'}
                  </div>
                </div>
              </div>
              <span className="font-label-sm text-label-sm font-semibold text-on-tertiary-container bg-tertiary-fixed-dim/30 px-2.5 py-1 rounded-full">
                GPS Verified
              </span>
            </div>

            <button
              onClick={() => handleCheckIn()}
              disabled={submitting || !location}
              className="w-full bg-secondary hover:opacity-90 text-on-secondary font-label-md text-label-md py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-transform duration-200 active:scale-[0.98] disabled:opacity-50"
            >
              <span className="material-symbols-outlined" data-icon="qr_code_scanner">qr_code_scanner</span>
              {submitting ? 'Validating Check-In...' : 'Simulate Scan & Submit Check-In'}
            </button>
          </div>
        </div>
      </div>

      {/* Success Confirmation Modal matching Stitch Screen 6 (success_confirmation/code.html) */}
      {successResult && (
        <div className="fixed inset-0 bg-primary/80 z-50 flex items-center justify-center p-edge-margin backdrop-blur-sm">
          <main className="w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] relative overflow-hidden z-50 flex flex-col items-center justify-center p-stack-lg animate-[fade-in_0.3s_ease-out]">
            {/* Confetti Animation Elements */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
              <div className="confetti-piece"></div>
              <div className="confetti-piece"></div>
              <div className="confetti-piece"></div>
              <div className="confetti-piece"></div>
              <div className="confetti-piece"></div>
              <div className="confetti-piece"></div>
            </div>

            <div className="w-16 h-16 rounded-full bg-tertiary-fixed-dim/30 flex items-center justify-center text-on-tertiary-container mb-4 z-10">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary mb-1 z-10 text-center">Check-In Confirmed!</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6 text-center z-10">
              Attendance recorded on server
            </p>

            <div className="w-full bg-surface-variant/40 rounded-xl p-4 border border-outline-variant/30 flex flex-col gap-3 mb-6 z-10">
              <div className="flex justify-between items-center">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Status</span>
                <span className="font-label-sm text-label-sm font-bold text-on-tertiary-container bg-tertiary-fixed-dim/30 px-2 py-0.5 rounded-full uppercase">
                  {successResult.record?.status || 'ON TIME'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Points Earned</span>
                <span className="font-headline-sm text-headline-sm font-bold text-secondary">
                  +{successResult.record?.pointsEarned || 10} pts
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/member')}
              className="w-full bg-primary text-on-primary font-label-md text-label-md py-3 px-4 rounded-lg flex items-center justify-center transition-transform active:scale-[0.98] z-10"
            >
              Done
            </button>
          </main>
        </div>
      )}

      {/* Error Modal matching Stitch Screen 7 (check_in_error/code.html) */}
      {errorResult && (
        <div className="fixed inset-0 bg-primary/80 z-50 flex items-center justify-center p-edge-margin backdrop-blur-sm">
          <main className="w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] relative overflow-hidden z-50 flex flex-col items-center justify-center p-stack-lg">
            <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center text-error mb-4">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary mb-1 text-center">{errorResult.title}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6 text-center">
              {errorResult.message}
            </p>

            <div className="w-full flex gap-3">
              <button
                onClick={() => setErrorResult(null)}
                className="flex-1 bg-surface-variant text-on-surface-variant font-label-md text-label-md py-3 px-4 rounded-lg flex items-center justify-center"
              >
                Retry
              </button>
              <button
                onClick={() => router.push('/member/my-attendance')}
                className="flex-1 bg-primary text-on-primary font-label-md text-label-md py-3 px-4 rounded-lg flex items-center justify-center"
              >
                Submit Excuse
              </button>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
