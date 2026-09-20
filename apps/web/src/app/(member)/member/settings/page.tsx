'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { PushSettings } from '../../../../components/PushSettings';
import { OfflineStorage } from '../../../../components/OfflineStorage';
import { recordPwaMetric } from '../../../../lib/pwa/metrics';

type PermissionStateVal = 'granted' | 'denied' | 'prompt' | 'unsupported';

interface DeviceInfo {
  os: 'iOS' | 'Android' | 'macOS' | 'Windows' | 'Linux' | 'Unknown';
  browser: 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Other';
  isMobile: boolean;
  isStandalone: boolean;
}

export default function MemberSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();

  // Device & Platform Detection
  const [device, setDevice] = useState<DeviceInfo>({
    os: 'Unknown',
    browser: 'Other',
    isMobile: false,
    isStandalone: false,
  });

  // Permission States
  const [locationPerm, setLocationPerm] = useState<PermissionStateVal>('prompt');
  const [notifPerm, setNotifPerm] = useState<PermissionStateVal>('prompt');
  const [micPerm, setMicPerm] = useState<PermissionStateVal>('prompt');
  const [camPerm, setCamPerm] = useState<PermissionStateVal>('prompt');

  // Location Diagnostics
  const [locChecking, setLocChecking] = useState(false);
  const [locResult, setLocResult] = useState<{
    lat?: number;
    lng?: number;
    accuracy?: number;
    timestamp?: string;
    error?: string;
  } | null>(null);

  // Media Test Modals
  const [showMicTest, setShowMicTest] = useState(false);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [showCamTest, setShowCamTest] = useState(false);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Active Instructions Tab
  const [instructionTopic, setInstructionTopic] = useState<'location' | 'notification' | 'microphone' | 'camera' | null>(null);

  // PWA & Updates
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIosInstallModal, setShowIosInstallModal] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);

  // Detect platform & initial permissions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent;
    let os: DeviceInfo['os'] = 'Unknown';
    if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Linux/.test(ua)) os = 'Linux';

    let browser: DeviceInfo['browser'] = 'Other';
    if (/Edg/.test(ua)) browser = 'Edge';
    else if (/Chrome|CriOS/.test(ua)) browser = 'Chrome';
    else if (/Safari/.test(ua) && !/Chrome|CriOS/.test(ua)) browser = 'Safari';
    else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';

    const isMobile = os === 'iOS' || os === 'Android' || /Mobi/.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

    setDevice({ os, browser, isMobile, isStandalone });

    // Listen for PWA beforeinstallprompt
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Check service worker waiting update
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) setWaitingWorker(reg.waiting);
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  // Check all permissions
  const queryPermissions = useCallback(async () => {
    setCheckingAll(true);
    try {
      // 1. Notification
      if ('Notification' in window) {
        setNotifPerm(Notification.permission as PermissionStateVal);
      } else {
        setNotifPerm('unsupported');
      }

      // 2. Location
      if ('permissions' in navigator && navigator.permissions?.query) {
        try {
          const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          setLocationPerm(res.state as PermissionStateVal);
          res.onchange = () => setLocationPerm(res.state as PermissionStateVal);
        } catch {
          setLocationPerm('prompt');
        }

        // 3. Microphone
        try {
          const res = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicPerm(res.state as PermissionStateVal);
          res.onchange = () => setMicPerm(res.state as PermissionStateVal);
        } catch {
          setMicPerm('prompt');
        }

        // 4. Camera
        try {
          const res = await navigator.permissions.query({ name: 'camera' as PermissionName });
          setCamPerm(res.state as PermissionStateVal);
          res.onchange = () => setCamPerm(res.state as PermissionStateVal);
        } catch {
          setCamPerm('prompt');
        }
      } else {
        // Fallback for Safari / unsupported query
        setLocationPerm('prompt');
        setMicPerm('prompt');
        setCamPerm('prompt');
      }
    } finally {
      setTimeout(() => setCheckingAll(false), 400);
    }
  }, []);

  useEffect(() => {
    void queryPermissions();
  }, [queryPermissions]);

  // Request & Check Live Location
  const handleCheckLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocResult({ error: 'Geolocation is not supported by your browser.' });
      return;
    }

    setLocChecking(true);
    setLocResult(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocChecking(false);
        setLocationPerm('granted');
        setLocResult({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: new Date(pos.timestamp).toLocaleTimeString(),
        });
      },
      (err) => {
        setLocChecking(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationPerm('denied');
          setLocResult({ error: 'Location permission was denied. Please allow location access in your browser.' });
          setInstructionTopic('location');
        } else if (err.code === err.TIMEOUT) {
          setLocResult({ error: 'Location request timed out. Ensure GPS / Location Services are enabled.' });
        } else {
          setLocResult({ error: err.message || 'Unable to retrieve location. Try again in an open area.' });
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Test Microphone
  const startMicTest = async () => {
    setShowMicTest(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicPerm('granted');

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!micStreamRef.current) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        setMicAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e: any) {
      setMicPerm('denied');
      setInstructionTopic('microphone');
    }
  };

  const stopMicTest = () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setShowMicTest(false);
    setMicAudioLevel(0);
  };

  // Test Camera
  const startCamTest = async () => {
    setShowCamTest(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      setCamStream(stream);
      setCamPerm('granted');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (e) {
      setCamPerm('denied');
      setInstructionTopic('camera');
    }
  };

  const stopCamTest = () => {
    camStream?.getTracks().forEach((t) => t.stop());
    setCamStream(null);
    setShowCamTest(false);
  };

  // Play Test Chime
  const playTestSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // AudioContext audio playback
    }
  };

  // Trigger PWA update
  const handleUpdateApp = () => {
    if (!waitingWorker) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    recordPwaMetric('update');
    waitingWorker.postMessage({ type: 'ACTIVATE_UPDATE' });
  };

  const renderStatusBadge = (status: PermissionStateVal) => {
    if (status === 'granted') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Allowed
        </span>
      );
    }
    if (status === 'denied') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Blocked
        </span>
      );
    }
    if (status === 'unsupported') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Not Supported
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Ask When Needed
      </span>
    );
  };

  return (
    <div className="bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-white min-h-screen flex flex-col font-sans pb-32 antialiased">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-[#0b1c30] dark:text-white leading-tight">Settings</h1>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-none mt-0.5">
              Device permissions, offline storage, app updates &amp; preferences
            </p>
          </div>
        </div>

        {/* Global Check Again Button */}
        <button
          onClick={queryPermissions}
          disabled={checkingAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-[#0b1c30] dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50 shadow-xs shrink-0"
          title="Re-query device permissions"
        >
          <span className={`material-symbols-outlined text-[16px] text-[#f2320c] ${checkingAll ? 'animate-spin' : ''}`}>
            sync
          </span>
          <span className="hidden sm:inline">Check Again</span>
        </button>
      </header>

      <main className="flex-1 px-4 sm:px-6 pt-6 pb-32 sm:pb-8 flex flex-col gap-6 w-full max-w-4xl mx-auto">
        {/* Device & Environment Detection Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2320c]/10 text-[#f2320c]">
              <span className="material-symbols-outlined text-2xl">
                {device.isMobile ? 'smartphone' : 'laptop_mac'}
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Device &amp; Environment</p>
              <h2 className="text-sm font-extrabold text-[#0b1c30] dark:text-white">
                {device.browser} on {device.os} {device.isStandalone ? '• Installed PWA' : '• Web Browser'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${device.isStandalone ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
              {device.isStandalone ? 'App Mode' : 'Browser Mode'}
            </span>
          </div>
        </div>

        {/* SECTION 1: ACCOUNT SUMMARY */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#f2320c] text-2xl">account_circle</span>
              <h2 className="text-base font-extrabold text-[#0b1c30] dark:text-white">Account &amp; Role</h2>
            </div>
            <Link
              href="/member/profile"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#f2320c] hover:underline"
            >
              <span>View Profile</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Signed In As</span>
              <p className="text-xs font-extrabold text-[#0b1c30] dark:text-white truncate mt-0.5">{user?.firstName} {user?.lastName}</p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Email Address</span>
              <p className="text-xs font-bold text-[#0b1c30] dark:text-white truncate mt-0.5">{user?.email}</p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Access Level</span>
              <p className="text-xs font-extrabold text-[#0b1c30] dark:text-white truncate mt-0.5">{user?.role || 'MEMBER'}</p>
            </div>
          </div>
        </section>

        {/* SECTION 2: DEVICE PERMISSIONS CENTRE */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#f2320c] text-2xl">security</span>
              <div>
                <h2 className="text-base font-extrabold text-[#0b1c30] dark:text-white">Device Permissions Centre</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Control hardware and browser capabilities needed for attendance, chat, and notices.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Location Card */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-500 text-xl">location_on</span>
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-white">Location Access</h3>
                  </div>
                  {renderStatusBadge(locationPerm)}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Required for event geofence attendance verification and distance checks.
                </p>

                {locResult && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                    {locResult.error ? (
                      <p className="text-rose-600 dark:text-rose-400 font-bold">{locResult.error}</p>
                    ) : (
                      <>
                        <p className="text-emerald-700 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">verified</span>
                          Coordinates Detected
                        </p>
                        <p className="text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                          Lat: {locResult.lat}, Lng: {locResult.lng}
                        </p>
                        <p className="text-slate-500 text-[10px]">
                          Accuracy: ±{locResult.accuracy}m • Checked at {locResult.timestamp}
                        </p>
                        {locResult.accuracy && locResult.accuracy > 80 && (
                          <p className="text-amber-600 text-[10px] font-semibold mt-0.5">
                            ⚠️ Low GPS precision. For attendance, move outdoors or near a window.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                <button
                  onClick={handleCheckLocation}
                  disabled={locChecking}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs active:scale-95 transition-all disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-sm ${locChecking ? 'animate-spin' : ''}`}>
                    {locChecking ? 'sync' : 'my_location'}
                  </span>
                  <span>{locChecking ? 'Checking GPS…' : 'Check Location'}</span>
                </button>
                <button
                  onClick={() => setInstructionTopic(instructionTopic === 'location' ? null : 'location')}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 active:scale-95 transition-all"
                >
                  {instructionTopic === 'location' ? 'Hide Help' : 'Instructions'}
                </button>
              </div>
            </div>

            {/* 2. Notifications Card */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-rose-500 text-xl">notifications_active</span>
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-white">Push Notifications</h3>
                  </div>
                  {renderStatusBadge(notifPerm)}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Used for real-time chat messages, urgent church announcements, and service reminders.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                <button
                  onClick={async () => {
                    if ('Notification' in window) {
                      const res = await Notification.requestPermission();
                      setNotifPerm(res as PermissionStateVal);
                    }
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">notifications</span>
                  <span>Request Permission</span>
                </button>
                <button
                  onClick={() => setInstructionTopic(instructionTopic === 'notification' ? null : 'notification')}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 active:scale-95 transition-all"
                >
                  {instructionTopic === 'notification' ? 'Hide Help' : 'Instructions'}
                </button>
              </div>
            </div>

            {/* 3. Microphone Card */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-500 text-xl">mic</span>
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-white">Microphone</h3>
                  </div>
                  {renderStatusBadge(micPerm)}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Required for voice note recordings in chat and real-time voice calls.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                <button
                  onClick={startMicTest}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">mic</span>
                  <span>Test Microphone</span>
                </button>
                <button
                  onClick={() => setInstructionTopic(instructionTopic === 'microphone' ? null : 'microphone')}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 active:scale-95 transition-all"
                >
                  {instructionTopic === 'microphone' ? 'Hide Help' : 'Instructions'}
                </button>
              </div>
            </div>

            {/* 4. Camera Card */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-purple-500 text-xl">videocam</span>
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-white">Camera</h3>
                  </div>
                  {renderStatusBadge(camPerm)}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Used for video calls, photo capturing for avatars, and attendance QR code scanning.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                <button
                  onClick={startCamTest}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">videocam</span>
                  <span>Test Camera</span>
                </button>
                <button
                  onClick={() => setInstructionTopic(instructionTopic === 'camera' ? null : 'camera')}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 active:scale-95 transition-all"
                >
                  {instructionTopic === 'camera' ? 'Hide Help' : 'Instructions'}
                </button>
              </div>
            </div>
          </div>

          {/* Contextual Instructions Drawer / Banner */}
          {instructionTopic && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-300">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">help</span>
                  How to Enable {instructionTopic.toUpperCase()} in {device.browser} ({device.os})
                </span>
                <button onClick={() => setInstructionTopic(null)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>

              {device.os === 'iOS' ? (
                <ol className="list-decimal list-inside space-y-1 text-amber-800 dark:text-amber-200 text-[11px] leading-relaxed">
                  <li>Open the <strong>Settings</strong> app on your iPhone/iPad.</li>
                  <li>Scroll down and tap <strong>Safari</strong> (or Chrome).</li>
                  <li>Under <em>Settings for Websites</em>, tap <strong>{instructionTopic === 'location' ? 'Location' : instructionTopic === 'camera' ? 'Camera' : instructionTopic === 'microphone' ? 'Microphone' : 'Notifications'}</strong>.</li>
                  <li>Set it to <strong>Allow</strong> or <strong>Ask</strong>.</li>
                  <li>Return to this page and tap <strong>Check Again</strong>.</li>
                </ol>
              ) : device.os === 'Android' ? (
                <ol className="list-decimal list-inside space-y-1 text-amber-800 dark:text-amber-200 text-[11px] leading-relaxed">
                  <li>Tap the <strong>tune / padlock icon</strong> <span className="material-symbols-outlined align-middle text-xs">tune</span> in Chrome&apos;s address bar.</li>
                  <li>Tap <strong>Permissions</strong>.</li>
                  <li>Toggle <strong>{instructionTopic.charAt(0).toUpperCase() + instructionTopic.slice(1)}</strong> to <strong>Allowed</strong>.</li>
                  <li>If prompted, reload the page or tap <strong>Check Again</strong>.</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1 text-amber-800 dark:text-amber-200 text-[11px] leading-relaxed">
                  <li>Click the <strong>Site Settings / Lock icon</strong> <span className="material-symbols-outlined align-middle text-xs">tune</span> on the left of your browser address bar.</li>
                  <li>Locate <strong>{instructionTopic.charAt(0).toUpperCase() + instructionTopic.slice(1)}</strong> and set it to <strong>Allow</strong>.</li>
                  <li>Return here and click <strong>Check Again</strong> to refresh your status.</li>
                </ol>
              )}
            </div>
          )}
        </section>

        {/* SECTION 3: VOICE & CALLS */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-teal-600 text-2xl">call</span>
              <div>
                <h2 className="text-base font-extrabold text-[#0b1c30] dark:text-white">Voice &amp; Video Calls</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Audio &amp; video device output settings for high-clarity ministry communications.
                </p>
              </div>
            </div>
            <button
              onClick={playTestSound}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-[#0b1c30] dark:text-white transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-sm text-teal-600">volume_up</span>
              <span>Test Speaker</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Microphone</span>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                {micPerm === 'granted' ? 'Default Audio Input (Active)' : 'Requires Permission'}
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Camera</span>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                {camPerm === 'granted' ? 'Front / Web Camera (Active)' : 'Requires Permission'}
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Audio Output</span>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">System Speaker / Headset</p>
            </div>
          </div>
        </section>

        {/* SECTION 4: FILES & MEDIA */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-indigo-600 text-2xl">folder_open</span>
              <div>
                <h2 className="text-base font-extrabold text-[#0b1c30] dark:text-white">Files &amp; Media Sharing</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sharing documents, audio rehearsals, bulletins, and photos in chat.
                </p>
              </div>
            </div>
            <Link
              href="/member/files"
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
            >
              <span>Open File Inbox</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </Link>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-2 text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2 font-bold text-[#0b1c30] dark:text-white">
              <span className="material-symbols-outlined text-sm text-indigo-500">check_circle</span>
              Supported Attachments: Images (PNG, JPG, WebP), Audio (MP3, WebM voice notes), PDF &amp; Documents
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Attachments in chat are limited to 3 MB per file for fast mobile transmission. Media is encrypted and stored safely on church infrastructure.
            </p>
          </div>
        </section>

        {/* SECTION 5: PWA / APP INSTALLATION & UPDATES */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#f2320c] text-2xl">install_mobile</span>
              <div>
                <h2 className="text-base font-extrabold text-[#0b1c30] dark:text-white">PWA &amp; App Installation</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Installed app status, version management, and home screen installation.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              v12 (Production)
            </span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-[#0b1c30] dark:text-white">
                {device.isStandalone ? 'TFHC-ORDERLINESS is Installed' : 'Install to Home Screen'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {device.isStandalone
                  ? 'Running in full-screen standalone application mode.'
                  : 'Install the app on your phone or desktop for one-tap access, offline sync, and alerts.'}
              </p>
            </div>

            {!device.isStandalone && (
              <div>
                {installPrompt ? (
                  <button
                    onClick={async () => {
                      try {
                        await installPrompt.prompt();
                        await installPrompt.userChoice;
                      } catch {}
                      setInstallPrompt(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white font-extrabold text-xs shadow-md shadow-red-500/20 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-base">install_mobile</span>
                    <span>Install App</span>
                  </button>
                ) : device.os === 'iOS' ? (
                  <button
                    onClick={() => setShowIosInstallModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] text-white font-extrabold text-xs shadow-md active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-base">add_to_home_screen</span>
                    <span>Install on iPhone / iPad</span>
                  </button>
                ) : (
                  <span className="text-xs text-slate-500 font-semibold">Available via Browser Menu</span>
                )}
              </div>
            )}
          </div>

          {/* Update Available Banner */}
          {waitingWorker && (
            <div className="p-4 rounded-2xl bg-[#0b1c30] text-white flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-400 text-2xl animate-spin">sync</span>
                <div>
                  <p className="text-sm font-extrabold">A new version is available</p>
                  <p className="text-xs text-slate-300">Tap update to apply the latest features and security fixes.</p>
                </div>
              </div>
              <button
                onClick={handleUpdateApp}
                className="px-4 py-2 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white text-xs font-extrabold uppercase tracking-wider shrink-0 active:scale-95 transition-all shadow-md shadow-red-500/20"
              >
                Update Now
              </button>
            </div>
          )}
        </section>

        {/* SECTION 6: ADVANCED PUSH NOTIFICATIONS */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#f2320c] text-2xl">mark_email_unread</span>
            <div>
              <h2 className="text-base font-extrabold text-[#0b1c30] dark:text-white">Push Subscription &amp; Test</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage backend push subscriptions and send a test notification to verify delivery.
              </p>
            </div>
          </div>
          <PushSettings />
        </section>

        {/* SECTION 7: OFFLINE STORAGE & TROUBLESHOOTING */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-teal-600 text-2xl">offline_pin</span>
            <div>
              <h2 className="text-base font-extrabold text-[#0b1c30] dark:text-white">Offline Storage &amp; Sync Diagnostics</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                IndexedDB storage, pending outbox syncs, and network retry handling.
              </p>
            </div>
          </div>
          <OfflineStorage />
        </section>
      </main>

      {/* Microphone Test Modal */}
      {showMicTest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-center">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold text-[#0b1c30] dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500">mic</span>
                Microphone Audio Test
              </h3>
              <button onClick={stopMicTest} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Speak into your microphone. The meter will react to your voice.
            </p>
            <div className="py-4">
              <div className="h-5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-1 border border-slate-200 dark:border-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-75"
                  style={{ width: `${micAudioLevel}%` }}
                />
              </div>
              <p className="text-[11px] font-mono font-bold text-slate-400 mt-2">Level: {micAudioLevel}%</p>
            </div>
            <button
              onClick={stopMicTest}
              className="w-full py-2.5 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] text-white font-bold text-xs active:scale-95 transition-all"
            >
              Done Testing
            </button>
          </div>
        </div>
      )}

      {/* Camera Test Modal */}
      {showCamTest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-center">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold text-[#0b1c30] dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-500">videocam</span>
                Camera Video Test
              </h3>
              <button onClick={stopCamTest} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-inner">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
            </div>
            <button
              onClick={stopCamTest}
              className="w-full py-2.5 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] text-white font-bold text-xs active:scale-95 transition-all"
            >
              Done Testing
            </button>
          </div>
        </div>
      )}

      {/* iOS Installation Instruction Modal */}
      {showIosInstallModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setShowIosInstallModal(false)}
        >
          <div
            className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#f2320c] text-xl">install_mobile</span>
                <h3 className="text-sm font-extrabold">Install on iPhone / iPad</h3>
              </div>
              <button onClick={() => setShowIosInstallModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 font-extrabold text-[11px]">1</span>
                <p>Tap the <strong>Share</strong> icon <span className="material-symbols-outlined align-middle text-sm text-blue-500">ios_share</span> in Safari.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 font-extrabold text-[11px]">2</span>
                <p>Scroll down and tap <strong>Add to Home Screen</strong> <span className="material-symbols-outlined align-middle text-sm">add_box</span>.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 font-extrabold text-[11px]">3</span>
                <p>Tap <strong>Add</strong> in the top-right corner.</p>
              </div>
            </div>
            <button
              onClick={() => setShowIosInstallModal(false)}
              className="mt-5 w-full rounded-xl bg-[#0b1c30] hover:bg-[#162a42] dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 py-2.5 text-center text-xs font-extrabold text-white transition-all active:scale-95 shadow-md shrink-0 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
