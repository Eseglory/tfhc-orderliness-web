'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { fetchApi } from '../lib/api';
import { alarmEngine, ActiveAlarmState } from '../lib/alarm-engine';

interface UpcomingMeeting {
  id: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  expectedArrivalTime?: string | null;
  attendanceOpenTime: string;
  attendanceCloseTime: string;
  locationName: string;
  isOnline: boolean;
  meetingUrl?: string | null;
  address?: string | null;
  status: string;
}

export function MeetingAlarmManager() {
  const { user } = useAuth();
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarmState | null>(null);
  const [isAudioArmed, setIsAudioArmed] = useState(false);
  const [snoozeMinutes, setSnoozeMinutes] = useState(5);
  const [snoozeFeedback, setSnoozeFeedback] = useState<string | null>(null);
  const scheduledTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const upcomingMeetingsRef = useRef<UpcomingMeeting[]>([]);

  // Sync active alarm from engine
  useEffect(() => {
    setActiveAlarm(alarmEngine.getActiveAlarm());
    setIsAudioArmed(alarmEngine.isAudioArmed());

    const unsubscribe = alarmEngine.subscribe((event) => {
      if (event.type === 'START') {
        setActiveAlarm(event.alarm || null);
        setIsAudioArmed(alarmEngine.isAudioArmed());
      } else if (event.type === 'STOP') {
        setActiveAlarm(null);
      } else if (event.type === 'SNOOZE') {
        setActiveAlarm(null);
      } else if (event.type === 'UNLOCK') {
        setIsAudioArmed(true);
      }
    });

    const prefs = alarmEngine.getPreferences();
    setSnoozeMinutes(prefs.snoozeMinutes || 5);

    return () => {
      unsubscribe();
    };
  }, []);

  // Check and trigger alarm for a meeting if within start window
  const checkMeetingForAlarm = useCallback((meeting: UpcomingMeeting) => {
    if (meeting.status === 'CANCELLED' || meeting.status === 'CLOSED') return;
    if (alarmEngine.isMeetingStopped(meeting.id)) return;

    const snooze = alarmEngine.getSnoozeState(meeting.id);
    const now = Date.now();

    if (snooze && snooze.snoozeUntil > now) {
      // Currently snoozed
      return;
    }

    const startMs = new Date(meeting.startTime).getTime();
    const closeMs = new Date(meeting.attendanceCloseTime || meeting.startTime).getTime() + 60000;

    // Trigger if we are at or past start time (with 30s advance window) and attendance hasn't closed
    if (now >= startMs - 30000 && now <= closeMs) {
      alarmEngine.startAlarm({
        meetingId: meeting.id,
        title: meeting.title,
        startTime: meeting.startTime,
        locationName: meeting.locationName,
        isOnline: meeting.isOnline,
        meetingUrl: meeting.meetingUrl,
        startedAt: now,
      });

      // Show native browser notification if allowed
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const notif = new Notification(`⏰ STARTING NOW: ${meeting.title}`, {
            body: `Meeting attendance is open now. Scheduled start: ${new Date(meeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Tap to clock in.`,
            icon: '/icons/icon-192.png',
            tag: `tfhc-alarm-${meeting.id}`,
            requireInteraction: true,
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {
          // ignore notification error
        }
      }
    }
  }, []);

  // Fetch upcoming meetings and schedule timers
  const loadUpcomingReminders = useCallback(async () => {
    if (!user) return;
    try {
      const meetings = await fetchApi<UpcomingMeeting[]>('/meetings/member-reminders');
      if (!Array.isArray(meetings)) return;

      upcomingMeetingsRef.current = meetings;

      // Clear obsolete timers
      scheduledTimersRef.current.forEach((timer) => clearTimeout(timer));
      scheduledTimersRef.current.clear();

      const now = Date.now();

      meetings.forEach((m) => {
        // Immediate check
        checkMeetingForAlarm(m);

        // Schedule timer for exact start time if in the future
        const startMs = new Date(m.startTime).getTime();
        const diffMs = startMs - now;

        if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
          const timer = setTimeout(() => {
            checkMeetingForAlarm(m);
          }, diffMs);
          scheduledTimersRef.current.set(m.id, timer);
        }
      });
    } catch {
      // Offline or network error
    }
  }, [user, checkMeetingForAlarm]);

  useEffect(() => {
    if (!user) return;
    loadUpcomingReminders();

    // Scan every 30 seconds for clock-drift, wake from sleep, or snoozed alarms due
    const interval = setInterval(() => {
      upcomingMeetingsRef.current.forEach((m) => checkMeetingForAlarm(m));
    }, 30000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadUpcomingReminders();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const currentTimers = scheduledTimersRef.current;
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, [user, loadUpcomingReminders, checkMeetingForAlarm]);

  // Handle Stop
  const handleStop = () => {
    if (!activeAlarm) return;
    alarmEngine.stopAlarm(activeAlarm.meetingId);
    setActiveAlarm(null);
  };

  // Handle Snooze
  const handleSnooze = (customMinutes?: number) => {
    if (!activeAlarm) return;
    const mins = customMinutes || snoozeMinutes || 5;
    const snoozeUntil = alarmEngine.snoozeAlarm(activeAlarm.meetingId, mins);
    setActiveAlarm(null);

    const timeStr = new Date(snoozeUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSnoozeFeedback(`Alarm snoozed for ${mins} min (will ring again at ${timeStr})`);
    setTimeout(() => setSnoozeFeedback(null), 5000);
  };

  // Handle Audio Unlock Tap
  const handleUnlockAudio = () => {
    alarmEngine.unlockAudioContext();
    setIsAudioArmed(true);
    // Restart audio loop if alarm is currently active
    if (activeAlarm) {
      alarmEngine.playSinglePattern();
    }
  };

  if (!activeAlarm && !snoozeFeedback) return null;

  return (
    <>
      {/* Snooze Toast Feedback */}
      {snoozeFeedback && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[110] px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white border border-amber-500/40 shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <span className="material-symbols-outlined text-amber-400 text-base">snooze</span>
          <span>{snoozeFeedback}</span>
        </aside>
      )}

      {/* Active Meeting Alarm Modal Overlay */}
      {activeAlarm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="meeting-alarm-title"
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-surface-container border-2 border-red-500/50 shadow-2xl p-6 sm:p-7 space-y-6 text-on-surface animate-in zoom-in-95 duration-200">
            {/* Pulsating Alarm Top Bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />

            {/* Header: Pulsing Bell & Status */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-500 border border-red-500/30 shadow-lg shadow-red-500/20">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-2xl bg-red-400 opacity-30" />
                  <span className="material-symbols-outlined text-3xl animate-bounce">alarm</span>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-black uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                    <span>Meeting Starting Now</span>
                  </div>
                  <h2
                    id="meeting-alarm-title"
                    className="text-lg sm:text-xl font-black text-on-surface tracking-tight mt-1"
                  >
                    {activeAlarm.title}
                  </h2>
                </div>
              </div>
            </div>

            {/* Browser Autoplay Notice (If audio was blocked) */}
            {!isAudioArmed && (
              <button
                type="button"
                onClick={handleUnlockAudio}
                className="w-full p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs font-black flex items-center justify-between gap-3 shadow-md transition-all active:scale-98 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-lg animate-pulse">volume_off</span>
                  <span>Audio paused by browser policy. Tap here to hear alarm.</span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 text-[10px] uppercase font-black">
                  Unmute
                </span>
              </button>
            )}

            {/* Meeting Details Card */}
            <div className="p-4 rounded-2xl bg-surface-container-high/60 border border-outline-variant/30 space-y-2 text-xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-semibold">Scheduled Start:</span>
                <span className="font-mono font-bold text-on-surface text-sm">
                  {new Date(activeAlarm.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (WAT)
                </span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-semibold">Location / Mode:</span>
                <span className="font-bold text-on-surface">
                  {activeAlarm.isOnline ? '🌐 Online (Google Meet)' : activeAlarm.locationName || 'Main Auditorium'}
                </span>
              </div>
            </div>

            {/* Quick Action: Join Meeting / Check In */}
            <div className="flex items-center gap-2">
              <Link
                href={`/member/check-in?meetingId=${activeAlarm.meetingId}`}
                onClick={handleStop}
                className="flex-1 py-3 px-4 rounded-2xl bg-primary hover:opacity-95 text-on-primary text-xs sm:text-sm font-black text-center shadow-lg shadow-primary/25 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">how_to_reg</span>
                <span>Clock In / Mark Attendance</span>
              </Link>

              {activeAlarm.meetingUrl && (
                <a
                  href={activeAlarm.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-600/30 transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-lg">videocam</span>
                  <span>Join Call</span>
                </a>
              )}
            </div>

            {/* Alarm Primary Controls: STOP and SNOOZE */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleStop}
                className="py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm sm:text-base shadow-lg shadow-rose-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">stop_circle</span>
                <span>STOP</span>
              </button>

              <button
                type="button"
                onClick={() => handleSnooze(snoozeMinutes)}
                className="py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-amber-500/30 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">snooze</span>
                <span>SNOOZE ({snoozeMinutes}m)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
