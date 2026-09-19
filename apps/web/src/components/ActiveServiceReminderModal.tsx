'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../lib/api';

interface ActiveReminderMeeting {
  id: string;
  title: string;
  description?: string;
  meetingDate?: string;
  startTime: string;
  expectedArrivalTime?: string;
  attendanceOpenTime?: string;
  attendanceCloseTime?: string;
  locationName: string;
  status: string;
  isAttendanceOpen: boolean;
}

interface ActiveReminderResponse {
  hasActiveReminder: boolean;
  meeting: ActiveReminderMeeting | null;
}

export function ActiveServiceReminderModal() {
  const [reminder, setReminder] = useState<ActiveReminderMeeting | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;

    fetchApi<ActiveReminderResponse>('/meetings/active-reminder')
      .then((res) => {
        if (!isMounted) return;
        if (res && res.hasActiveReminder && res.meeting) {
          const dismissKey = `tfhc_dismissed_rem_${res.meeting.id}`;
          try {
            if (localStorage.getItem(dismissKey) === 'true') {
              return;
            }
          } catch {
            // ignore localStorage access errors
          }
          setReminder(res.meeting);
          setVisible(true);
        }
      })
      .catch(() => {
        // fail gracefully if offline or unauthorized
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!visible || !reminder) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(`tfhc_dismissed_rem_${reminder.id}`, 'true');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  const formattedTime = new Date(reminder.startTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-service-reminder-title"
      className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-r from-primary-container/90 via-surface-container-high to-surface-container p-5 sm:p-6 shadow-xl dark:shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-md shadow-primary/30 mt-0.5">
            <span className="material-symbols-outlined text-2xl animate-pulse">notifications_active</span>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                id="active-service-reminder-title"
                className="text-base sm:text-lg font-black text-on-surface tracking-tight"
              >
                Attendance Reminder
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full bg-primary/15 text-primary uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                Service Active
              </span>
            </div>

            <p className="text-sm font-semibold text-on-surface-variant">
              <span className="font-bold text-on-surface">{reminder.title}</span> is currently active.
            </p>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              You indicated that you would be available for this service ({formattedTime} at{' '}
              <span className="font-semibold">{reminder.locationName}</span>). Please take your attendance when
              attendance is available.
            </p>
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Close attendance reminder"
          className="rounded-xl p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/80 transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/15 flex-wrap sm:flex-nowrap">
        <button
          onClick={dismiss}
          className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors rounded-xl"
        >
          Close
        </button>
        <Link
          href={`/member/check-in?meetingId=${reminder.id}`}
          onClick={dismiss}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-black text-xs shadow-md shadow-primary/25 transition-transform active:scale-95 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">how_to_reg</span>
          <span>Take Attendance</span>
        </Link>
      </div>
    </div>
  );
}
