'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { calculateHaversineDistanceMeters } from '@tfhc/shared';
import { Navbar } from '../../../../components/Navbar';
import { QrCode, MapPin, X, Flashlight, CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';

export default function CheckInPage() {
  const router = useRouter();

  // State Management
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [scanning, setScanning] = useState(true);
  const [qrToken, setQrToken] = useState('');
  const [distance, setDistance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [successResult, setSuccessResult] = useState<any>(null);
  const [errorResult, setErrorResult] = useState<any>(null);

  // 1. Fetch Active Meeting & Event-Based GPS Location when component mounts
  useEffect(() => {
    loadActiveMeeting();
    requestLocation();

    // Camera Stream Hardware Lifecycle Cleanup on unmount
    return () => {
      if ((window as any)._cameraStreamTrack) {
        (window as any)._cameraStreamTrack.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
    };
  }, []);

  const loadActiveMeeting = async () => {
    try {
      const meetings = await fetchApi('/meetings/active');
      if (meetings && meetings.length > 0) {
        setActiveMeeting(meetings[0]);
      }
    } catch (err: any) {
      console.error('Failed to load active meeting:', err);
    }
  };

  const requestLocation = () => {
    setLocationError('');

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setLocationError('Offline mode detected. Geofence scanner requires an active internet connection.');
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Mock location anti-spoofing detection
        if ((pos.coords as any).mocked) {
          setLocationError('Spoofed or mock GPS coordinates detected. Check-in rejected.');
          return;
        }

        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setLocation(coords);

        if (activeMeeting) {
          const dist = calculateHaversineDistanceMeters(
            { latitude: coords.lat, longitude: coords.lng },
            { latitude: activeMeeting.latitude, longitude: activeMeeting.longitude }
          );
          setDistance(Math.round(dist));
        }
      },
      (err) => {
        setLocationError(err.message || 'Unable to retrieve location permission');
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
    );
  };

  // Re-calculate distance when active meeting updates
  useEffect(() => {
    if (location && activeMeeting) {
      const dist = calculateHaversineDistanceMeters(
        { latitude: location.lat, longitude: location.lng },
        { latitude: activeMeeting.latitude, longitude: activeMeeting.longitude }
      );
      setDistance(Math.round(dist));
    }
  }, [location, activeMeeting]);

  // 2. Perform Check-In Submission
  const handleCheckIn = async (scannedToken?: string) => {
    if (!activeMeeting) {
      setErrorResult({
        title: 'No Active Meeting',
        message: 'There is currently no active meeting session open for attendance.',
      });
      return;
    }

    if (!location) {
      setErrorResult({
        title: 'GPS Location Required',
        message: 'Please enable location permissions on your device to verify venue geofence.',
      });
      return;
    }

    setSubmitting(true);
    setErrorResult(null);

    const tokenToUse = scannedToken || qrToken || `${activeMeeting.id}:${Date.now()}`;

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      {/* Screen 5: Active Camera Scanner Viewfinder */}
      <div className="flex-1 relative flex flex-col justify-between overflow-hidden">
        {/* Simulated Camera Viewfinder Feed */}
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
          <div className="text-center p-6 text-slate-500">
            <QrCode className="w-16 h-16 mx-auto mb-3 opacity-30 animate-pulse text-amber-500" />
            <p className="text-sm font-medium">Align Dynamic Venue QR Code in Viewfinder</p>
          </div>
        </div>

        {/* Scanner Overlay Frame */}
        <div className="relative z-10 flex flex-col h-full justify-between p-4">
          {/* Top Bar Controls */}
          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => router.push('/member')}
              className="w-10 h-10 rounded-full bg-slate-900/60 backdrop-blur-md border border-slate-700/50 flex items-center justify-center text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50 text-xs font-semibold text-amber-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{activeMeeting ? activeMeeting.title : 'Active Session'}</span>
            </div>

            <button
              onClick={requestLocation}
              className="w-10 h-10 rounded-full bg-slate-900/60 backdrop-blur-md border border-slate-700/50 flex items-center justify-center text-amber-400 hover:bg-slate-800 transition-colors"
              title="Refresh GPS Location"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Center Target Box with Corner Brackets & Scan Line */}
          <div className="relative my-auto mx-auto w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
            {/* 4 Corner Brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-500 rounded-tl-xl"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-500 rounded-tr-xl"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-500 rounded-bl-xl"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-500 rounded-br-xl"></div>

            {/* Scanning Line Animation */}
            <div className="w-full h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 absolute top-0 animate-[scan_2s_infinite_linear] shadow-[0_0_12px_#F59E0B]"></div>
          </div>

          {/* Bottom GPS Location Badge & Submit Action */}
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl max-w-md mx-auto w-full mb-12">
            <div className="flex items-center justify-between mb-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>
                  {location
                    ? `GPS Verified • Accuracy: ${Math.round(location.accuracy)}m`
                    : locationError || 'Fetching GPS Coordinates...'}
                </span>
              </div>
              {distance !== null && (
                <span className={`px-2 py-0.5 rounded-full font-bold ${distance <= (activeMeeting?.geofenceRadiusMeters || 100) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {distance}m away
                </span>
              )}
            </div>

            {/* Quick Demo Scan Button */}
            <button
              onClick={() => handleCheckIn()}
              disabled={submitting || !location}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <span>Validating Geofence &amp; Signature...</span>
              ) : (
                <>
                  <QrCode className="w-5 h-5" />
                  <span>Simulate QR Check-In Scan</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Screen 6: Check-In Confirmed Success Modal */}
      {successResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center relative overflow-hidden shadow-2xl animate-[fadeIn_0.3s_ease-out]">
            {/* Confetti Accent Top Bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-amber-500 to-emerald-400"></div>

            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">Check-In Confirmed!</h2>
            <p className="text-xs text-slate-400 mb-6">Attendance recorded on server</p>

            <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-6 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Status</span>
                <span className="font-bold text-emerald-400 uppercase tracking-wide px-2 py-0.5 bg-emerald-500/10 rounded-lg">
                  {successResult.record?.status || 'ON TIME'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Points Earned</span>
                <span className="font-extrabold text-amber-400 text-lg">
                  +{successResult.record?.pointsEarned || 10} pts
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Distance From Venue</span>
                <span className="text-slate-200 font-semibold">
                  {Math.round(successResult.record?.distanceFromVenue || distance || 0)}m
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/member')}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white transition-all shadow-lg shadow-emerald-600/30"
            >
              Back to Home Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Screen 7: Check-In Blocked Modal (Out of Bounds / Error) */}
      {errorResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-2 bg-rose-500"></div>

            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
              <AlertTriangle className="w-10 h-10" />
            </div>

            <h2 className="text-xl font-bold text-white mb-1">{errorResult.title}</h2>
            <p className="text-xs text-rose-300 mb-6">{errorResult.message}</p>

            {errorResult.distance !== undefined && (
              <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-6 text-xs text-slate-300 space-y-2">
                <div className="flex justify-between">
                  <span>Your Current Distance:</span>
                  <span className="font-bold text-rose-400">{errorResult.distance}m</span>
                </div>
                <div className="flex justify-between">
                  <span>Allowed Geofence Radius:</span>
                  <span className="font-bold text-emerald-400">{errorResult.allowedRadius || 100}m</span>
                </div>
                <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-700/50">
                  Please move closer to the venue auditorium and retry scanning.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setErrorResult(null)}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => router.push('/member/my-attendance')}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm transition-colors"
              >
                Submit Excuse
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
