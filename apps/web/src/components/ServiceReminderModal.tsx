'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi, getAuthToken } from '../lib/api';

interface ActiveReminderResponse {
  hasActiveReminder: boolean;
  meeting: {
    id: string;
    title: string;
    description: string | null;
    meetingDate: string;
    startTime: string;
    expectedArrivalTime: string | null;
    attendanceOpenTime: string;
    attendanceCloseTime: string;
    locationName: string;
    status: string;
    isAttendanceOpen: boolean;
  } | null;
}

interface ScheduledReminder {
  id: string; type: string; title: string; body: string; status: string;
  data?: { window?: string; url?: string; startTime?: string };
}

export function ServiceReminderModal() {
  const [data, setData] = useState<ActiveReminderResponse | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledReminder | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    let alive = true;
    const checkReminder = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      fetchApi<ScheduledReminder[]>('/members/me/notifications').then(items => {
        if (!alive) return;
        setScheduled(items.find(item => item.type === 'SERVICE_REMINDER' && item.status === 'UNREAD' &&
          !!item.data?.startTime && new Date(item.data.startTime).getTime() > Date.now() &&
          sessionStorage.getItem(`dismissed_scheduled_${item.id}`) !== 'true') || null);
      }).catch(() => undefined);
      fetchApi<ActiveReminderResponse>('/meetings/active-reminder')
        .then((res) => {
          if (!alive) return;
          if (res?.hasActiveReminder && res.meeting) {
            const isDismissed = sessionStorage.getItem(`dismissed_reminder_${res.meeting.id}`) === 'true';
            if (!isDismissed) {
              setData(res);
              setDismissed(false);
            } else setData(null);
          } else setData(null);
        })
        .catch(() => undefined);
    };

    checkReminder();
    const timer = setInterval(checkReminder, 60000);
    window.addEventListener('tfhc:notifications-synced', checkReminder);
    document.addEventListener('visibilitychange', checkReminder);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('tfhc:notifications-synced', checkReminder);
      document.removeEventListener('visibilitychange', checkReminder);
    };
  }, []);

  if ((!data?.hasActiveReminder || !data.meeting || dismissed) && scheduled) {
    const dismiss = () => { sessionStorage.setItem(`dismissed_scheduled_${scheduled.id}`, 'true'); setScheduled(null); };
    const destination = scheduled.data?.url;
    const href = destination?.startsWith('/member/') ? destination : '/member/notifications';
    return <aside aria-label="Upcoming service reminder" className="fixed bottom-20 right-4 left-4 z-50 rounded-2xl border border-primary/30 bg-surface p-5 text-on-surface shadow-xl md:left-auto md:max-w-md">
      <h4 className="font-bold">{scheduled.title}</h4>
      <p className="my-3 text-sm">{scheduled.body}</p>
      <div className="flex items-center gap-4">
        <Link href={href} onClick={dismiss} className="rounded-xl bg-primary px-4 py-2 text-white">View service</Link>
        <button onClick={dismiss}>Dismiss</button>
      </div>
    </aside>;
  }
  if (!data?.hasActiveReminder || !data.meeting || dismissed) return null;

  const meeting = data.meeting;
  const startTimeFormatted = new Date(meeting.startTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const arrivalTimeFormatted = meeting.expectedArrivalTime
    ? new Date(meeting.expectedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : startTimeFormatted;

  const handleDismiss = () => {
    sessionStorage.setItem(`dismissed_reminder_${meeting.id}`, 'true');
    setDismissed(true);
  };

  return (
    <aside aria-label="Service Reminder" className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-surface border-2 border-primary/30 rounded-2xl p-5 shadow-2xl backdrop-blur-xl bg-surface/95 dark:bg-surface/95 text-on-surface">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-amber-500 dark:text-amber-400">
              {meeting.isAttendanceOpen ? 'Attendance Open' : 'Service Reminder'}
            </span>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss reminder"
            className="text-muted hover:text-on-surface p-1 rounded-lg hover:bg-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <h4 className="font-bold text-base text-on-surface mb-1">
          {meeting.title}
        </h4>

        <p className="text-xs text-muted mb-3 leading-relaxed">
          You indicated you are available to serve today. Service starts at <strong className="text-on-surface">{startTimeFormatted}</strong> (Arrival: <strong className="text-on-surface">{arrivalTimeFormatted}</strong>) at {meeting.locationName || 'Main Sanctuary'}.
        </p>

        <div className="flex items-center gap-2">
          <Link
            href={`/member/check-in?meetingId=${meeting.id}`}
            onClick={handleDismiss}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
            Take Attendance
          </Link>
          <button
            onClick={handleDismiss}
            className="py-2.5 px-3 rounded-xl border border-border hover:bg-surface-variant text-muted hover:text-on-surface text-xs font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </aside>
  );
}
