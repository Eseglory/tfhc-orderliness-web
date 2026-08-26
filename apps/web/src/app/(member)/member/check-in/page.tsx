'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '../../../../components/Navbar';
import { StatusBadge } from '../../../../components/StatusBadge';
import { fetchApi } from '../../../../lib/api';
import { MapPin, QrCode, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function CheckInPage() {
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [loadingMeeting, setLoadingMeeting] = useState(true);

  // GPS state
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gettingGps, setGettingGps] = useState<boolean>(false);

  // QR state
  const [qrInput, setQrInput] = useState<string>('');

  // Result state
  const [checkInResult, setCheckInResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchActiveMeeting = async () => {
    setLoadingMeeting(true);
    try {
      const data = await fetchApi('/meetings/active');
      setActiveMeeting(data);
    } catch (err) {
      setActiveMeeting(null);
    } finally {
      setLoadingMeeting(false);
    }
  };

  const requestGps = () => {
    setGettingGps(true);
    setGpsError('');

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setGettingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGettingGps(false);
      },
      (error) => {
        setGpsError(`Location access error: ${error.message}`);
        setGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    fetchActiveMeeting();
    requestGps();
  }, []);

  const handleCheckIn = async () => {
    if (!activeMeeting) {
      setErrorMsg('No active meeting check-in currently available.');
      return;
    }
    if (!coords) {
      setErrorMsg('GPS coordinates are required to check in. Please acquire location.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setCheckInResult(null);

    try {
      const res = await fetchApi('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: activeMeeting.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          gpsAccuracy: coords.accuracy,
          qrPayload: qrInput.trim() || undefined,
          deviceInfo: typeof window !== 'undefined' ? navigator.userAgent : 'Web Browser',
        }),
      });

      setCheckInResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Check-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Attendance Verification & Check-In</h1>
          <p className="text-xs text-slate-400 mt-1">
            Server-authoritative GPS geofence + meeting QR token verification
          </p>
        </div>

        {/* Success Modal / Result */}
        {checkInResult && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 p-6 rounded-2xl text-center space-y-4 shadow-xl">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
            <h2 className="text-2xl font-bold text-white">Check-In Successful!</h2>
            <div className="flex justify-center items-center gap-3">
              <StatusBadge status={checkInResult.status} />
              <span className="text-sm font-bold text-amber-400">+{checkInResult.pointsEarned} Points</span>
            </div>
            <p className="text-sm text-slate-300">
              Recorded at: <span className="font-mono text-white">{new Date(checkInResult.actualArrivalTime).toLocaleTimeString()}</span>
            </p>
            <p className="text-xs text-slate-400">
              Distance to venue: <span className="text-slate-200">{Math.round(checkInResult.distanceFromVenue)}m</span>
            </p>
          </div>
        )}

        {/* Active Meeting Selection */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">1. Active Meeting Target</h2>
            <button onClick={fetchActiveMeeting} className="text-slate-400 hover:text-white p-1">
              <RefreshCw className={`w-4 h-4 ${loadingMeeting ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {activeMeeting ? (
            <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl space-y-2">
              <div className="text-lg font-bold text-indigo-400">{activeMeeting.title}</div>
              <div className="text-xs text-slate-300">Venue: {activeMeeting.locationName}</div>
              <div className="text-xs text-slate-400">
                Geofence Radius: <span className="text-white font-medium">{activeMeeting.geofenceRadiusMeters}m</span> | Closes: {new Date(activeMeeting.attendanceCloseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-800/40 rounded-xl text-center text-sm text-slate-400">
              No meeting currently accepting attendance.
            </div>
          )}
        </div>

        {/* GPS Location Component */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white">2. GPS Geofence Verification</h2>
            </div>
            <button
              onClick={requestGps}
              disabled={gettingGps}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 transition-colors"
            >
              {gettingGps ? 'Acquiring...' : 'Refresh GPS'}
            </button>
          </div>

          {coords ? (
            <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl text-xs space-y-1">
              <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> GPS Signal Acquired
              </div>
              <div className="text-slate-300">Latitude: {coords.latitude.toFixed(6)}, Longitude: {coords.longitude.toFixed(6)}</div>
              <div className="text-slate-400">Signal Accuracy: ±{Math.round(coords.accuracy)}m</div>
            </div>
          ) : (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400">
              {gpsError || 'GPS coordinates required. Please click "Refresh GPS" and grant location permissions.'}
            </div>
          )}
        </div>

        {/* QR Code Validation */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">3. Meeting QR Verification Token</h2>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">
              Scan or enter the meeting QR token displayed at the church venue:
            </label>
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="Paste QR payload token or scan venue screen..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-sm text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          onClick={handleCheckIn}
          disabled={submitting || !activeMeeting || !coords}
          className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-bold text-slate-950 text-base uppercase tracking-wider transition-all shadow-xl shadow-emerald-600/25 disabled:opacity-40"
        >
          {submitting ? 'Verifying & Submitting...' : 'Submit Attendance Check-In'}
        </button>
      </main>
    </div>
  );
}
