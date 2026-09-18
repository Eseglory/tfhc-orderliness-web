'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { fetchApi } from '../../../../../lib/api';

export default function MeetingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params?.id as string;

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [meeting, setMeeting] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    if (meetingId) {
      fetchApi(`/meetings/${meetingId}`)
        .then((data) => setMeeting(data))
        .catch((err) => setError(err.message));
    }
  }, [meetingId]);

  // Keep a 30s interval to update time-dependent check-in status smoothly
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const respond = async (attending: boolean) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetchApi(`/meetings/${meetingId}/response`, {
        method: 'PUT',
        body: JSON.stringify({ attending }),
      });
      setMeeting((current: any) => ({ ...current, eventResponses: [response] }));
    } catch (err: any) {
      setError(err.message || 'Could not save your response');
    } finally {
      setSaving(false);
    }
  };

  if (!meeting) {
    return (
      <div className="bg-background min-h-screen text-on-background p-6 flex flex-col items-center justify-center">
        {error ? (
          <div className="text-center space-y-3 p-6 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 max-w-md">
            <span className="material-symbols-outlined text-3xl text-red-600">error</span>
            <p role="alert" className="text-sm font-bold text-red-900 dark:text-red-200">{error}</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
            >
              Go Back
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
            <p className="text-sm font-semibold">Loading gathering details…</p>
          </div>
        )}
      </div>
    );
  }

  const response = meeting.eventResponses?.[0];
  const meetingStartTime = new Date(meeting.startTime);
  const responseOpen = ['SCHEDULED', 'ACTIVE'].includes(meeting.status) && meetingStartTime > currentTime;

  const title = meeting?.title || 'Church Gathering';
  const categoryName = meeting?.category?.name || 'Service';
  const locationName = meeting?.locationName || 'The Father’s House Church';
  const description = meeting?.description || 'Join us for this gathering in the presence of God.';

  // Attendance timing windows
  const openTimeDate = meeting?.attendanceOpenTime
    ? new Date(meeting.attendanceOpenTime)
    : new Date(meetingStartTime.getTime() - 30 * 60000);

  const expectedTimeDate = meeting?.expectedArrivalTime
    ? new Date(meeting.expectedArrivalTime)
    : new Date(meetingStartTime.getTime() - 15 * 60000);

  const graceTimeDate = meeting?.gracePeriodEndTime
    ? new Date(meeting.gracePeriodEndTime)
    : new Date(meetingStartTime.getTime() + (meeting?.gracePeriodMinutes || 10) * 60000);

  const closeTimeDate = meeting?.attendanceCloseTime
    ? new Date(meeting.attendanceCloseTime)
    : meeting?.endTime
    ? new Date(meeting.endTime)
    : new Date(meetingStartTime.getTime() + 60 * 60000);

  // Cutoff is strictly 1 hour (60 minutes) after the window closes
  const cutoffTimeDate = new Date(closeTimeDate.getTime() + 60 * 60000);

  // Time evaluations
  const isCancelled = meeting.status === 'CANCELLED';
  const isExplicitlyClosed = meeting.status === 'CLOSED';
  const isFuture = currentTime < openTimeDate;
  const isPast = currentTime > cutoffTimeDate || isExplicitlyClosed;
  const isCheckInEligible = !isCancelled && !isPast && !isFuture && ['ACTIVE', 'SCHEDULED'].includes(meeting.status);

  const opensTimeStr = openTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const expectedTimeStr = expectedTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const graceTimeStr = graceTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const closesTimeStr = closeTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const dateFormatted = meetingStartTime.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="bg-background min-h-screen text-on-background pb-32 font-body-md">
      {/* Header */}
      <header className="flex justify-between items-center w-full px-4 sm:px-6 h-16 bg-background/95 backdrop-blur sticky top-0 z-40 border-b border-outline-variant/10">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary transition-all duration-200 active:scale-95 hover:opacity-80 shrink-0"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </button>
        <h1 className="font-headline-sm text-base sm:text-lg font-bold text-primary tracking-tight truncate px-2">
          Gathering Details
        </h1>
        <div className="w-10 h-10 flex items-center justify-end shrink-0"></div>
      </header>

      <main className="px-4 sm:px-6 mt-5 space-y-5 max-w-2xl mx-auto">
        {/* Hero Section */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/20 shadow-xs space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-xs">
              {categoryName}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                meeting.isCompulsory
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {meeting.isCompulsory ? 'Compulsory Unit Service' : 'Optional Service'}
            </span>
            {meeting.status === 'ACTIVE' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Live Now
              </span>
            )}
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#0b1c30] dark:text-white leading-tight">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-primary">calendar_month</span>
              <span>{dateFormatted}</span>
            </p>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
            {description}
          </p>
        </section>

        {/* Dynamic Primary Check-In / Status Card (In-Flow, positioned naturally above the bottom nav) */}
        {isCheckInEligible ? (
          <section className="rounded-2xl border-2 border-[#f2320c]/30 bg-gradient-to-br from-red-50 to-orange-50/50 dark:from-red-950/40 dark:to-slate-900 p-5 shadow-md space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Check-In Open Now
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Closes at {closesTimeStr}
              </span>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              You are currently within the active attendance window for this gathering. Please verify your venue GPS to record check-in.
            </p>

            <button
              onClick={() => router.push(`/member/check-in?meetingId=${meetingId}`)}
              className="w-full bg-[#f2320c] hover:bg-[#d82a08] text-white font-extrabold text-sm sm:text-base py-3.5 px-4 rounded-xl shadow-[0_4px_14px_rgba(242,50,12,0.35)] flex justify-center items-center gap-2 transition-transform duration-150 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-xl">location_on</span>
              <span>Check-In Now</span>
            </button>
          </section>
        ) : isFuture ? (
          <section className="rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30 p-4 shadow-2xs flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-300 shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[20px]">lock_clock</span>
            </div>
            <div className="space-y-1 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                Check-In Not Yet Open
              </h4>
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                Check-in for this gathering opens on{' '}
                <strong>
                  {meetingStartTime.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })} at {opensTimeStr}
                </strong>
                . Check-in is only available during the active event window.
              </p>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4 shadow-2xs flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[20px]">event_busy</span>
            </div>
            <div className="space-y-1 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                {isCancelled ? 'Event Cancelled' : 'Attendance Window Closed'}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {isCancelled
                  ? 'This service has been cancelled. No check-in is required.'
                  : `The attendance check-in period for this event concluded at ${closesTimeStr}.`}
              </p>
            </div>
          </section>
        )}

        {/* RSVP Card */}
        <section className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white">Will you attend this gathering?</h3>
            {response && (
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  response.attending
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                }`}
              >
                {response.attending ? '✓ Responded: Attending' : '✗ Responded: Not Attending'}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Letting unit leaders know your attendance plan helps with seat and logistics arrangements.
          </p>

          {error && <p role="alert" className="text-xs font-bold text-red-600">{error}</p>}

          {responseOpen ? (
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                disabled={saving}
                aria-pressed={response?.attending === true}
                onClick={() => respond(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                  response?.attending === true
                    ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600 ring-offset-2'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
                }`}
              >
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>I Will Attend</span>
              </button>

              <button
                disabled={saving}
                aria-pressed={response?.attending === false}
                onClick={() => respond(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                  response?.attending === false
                    ? 'bg-slate-800 text-white shadow-sm ring-2 ring-slate-800 ring-offset-2'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-base">cancel</span>
                <span>Not Attending</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
              RSVP response window is closed for this gathering.
            </p>
          )}

          <div className="pt-1 flex items-center justify-between text-xs text-on-surface-variant">
            <span>Unable to attend?</span>
            <Link
              className="text-primary font-bold hover:underline inline-flex items-center gap-1"
              href={`/member/submit-excuse?meetingId=${meetingId}`}
            >
              <span>Submit Absence Excuse</span>
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </Link>
          </div>
        </section>

        {/* Time Grid (2x2) */}
        <section className="space-y-2.5">
          <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white">Attendance Window Schedule</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Opens */}
            <div className="bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant/20 flex flex-col items-start shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-2">
                <span className="material-symbols-outlined text-[16px]">lock_open</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opens</span>
              <span className="text-base font-extrabold text-[#0b1c30] dark:text-white mt-0.5">{opensTimeStr}</span>
            </div>

            {/* Expected */}
            <div className="bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant/20 flex flex-col items-start shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-2">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Arrival</span>
              <span className="text-base font-extrabold text-[#0b1c30] dark:text-white mt-0.5">{expectedTimeStr}</span>
            </div>

            {/* Grace Period */}
            <div className="bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant/20 flex flex-col items-start shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-2">
                <span className="material-symbols-outlined text-[16px]">hourglass_bottom</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grace Ends</span>
              <span className="text-base font-extrabold text-[#0b1c30] dark:text-white mt-0.5">{graceTimeStr}</span>
            </div>

            {/* Window Closes */}
            <div className="bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant/20 flex flex-col items-start shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/60 flex items-center justify-center text-red-600 dark:text-red-400 mb-2">
                <span className="material-symbols-outlined text-[16px]">lock</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Window Closes</span>
              <span className="text-base font-extrabold text-[#0b1c30] dark:text-white mt-0.5">{closesTimeStr}</span>
            </div>
          </div>
        </section>

        {/* Venue Details Card */}
        <section className="space-y-2.5">
          <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white">Location Details</h3>
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden shadow-2xs">
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/60 flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[20px]">church</span>
                </div>
                <div>
                  <p className="font-bold text-sm text-[#0b1c30] dark:text-white">{locationName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Allowed check-in radius: <strong>{meeting?.geofenceRadiusMeters ?? 100} metres</strong>
                  </p>
                </div>
              </div>

              <div className="w-full h-px bg-outline-variant/20"></div>

              <div className="flex items-center gap-2.5 bg-surface-container-low p-3 rounded-xl border border-outline-variant/15 text-xs text-slate-600 dark:text-slate-300">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base shrink-0">
                  check_circle
                </span>
                <p>GPS distance is automatically validated during check-in to confirm venue arrival.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
