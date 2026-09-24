'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { fetchApi } from '../../../../../lib/api';
import { buildAdvancedGoogleCalendarUrl, extractVirtualUrl, isOnlineUnitMeeting } from '../../../../../lib/calendar-integration';

export default function MeetingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params?.id as string;

  const [error, setError] = useState('');
  const [meeting, setMeeting] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [availabilityData, setAvailabilityData] = useState<any>(null);

  // Online Meeting Attendance State
  const [attendanceRecord, setAttendanceRecord] = useState<any>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [attendanceCodeInput, setAttendanceCodeInput] = useState('');
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [onlineSuccessMsg, setOnlineSuccessMsg] = useState('');

  useEffect(() => {
    if (meetingId) {
      fetchApi(`/meetings/${meetingId}`)
        .then((data) => setMeeting(data))
        .catch((err) => setError(err.message));

      fetchApi<any>('/availability/current')
        .then((res) => {
          setAvailabilityData(res);
        })
        .catch(() => {});

      // Check attendance status for the current member
      fetchApi<{ clockedIn: boolean; record: any }>(`/attendance/status?meetingId=${meetingId}`)
        .then((res) => {
          if (res?.record) {
            setAttendanceRecord(res.record);
          }
        })
        .catch(() => {});
    }
  }, [meetingId]);

  // Keep a 30s interval to update time-dependent status smoothly
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmitAttendanceCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = attendanceCodeInput.trim();
    if (!cleanCode || !/^\d{6}$/.test(cleanCode)) {
      setCodeError('Please enter a valid 6-digit numeric attendance code.');
      return;
    }
    setCodeSubmitting(true);
    setCodeError('');
    try {
      const res = await fetchApi<{ success: boolean; record: any; alreadyRecorded?: boolean }>('/attendance/online/submit-code', {
        method: 'POST',
        body: JSON.stringify({
          meetingId,
          code: cleanCode,
        }),
      });
      setAttendanceRecord(res.record);
      setShowCodeModal(false);
      setAttendanceCodeInput('');
      setOnlineSuccessMsg(
        res.alreadyRecorded
          ? 'You are already marked PRESENT for this meeting.'
          : '✓ Attendance Confirmed! You are marked PRESENT.'
      );
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('not yet') || msg.toLowerCase().includes('not open')) {
        setCodeError('Attendance Not Yet Available: Attendance opens 10 minutes before the meeting starts. Please try again later.');
      } else if (msg.toLowerCase().includes('closed') || msg.toLowerCase().includes('expired')) {
        setCodeError('Attendance Closed: The attendance window for this meeting has closed. The attendance code is no longer valid.');
      } else if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('duplicate')) {
        setCodeError('Attendance Already Recorded: You are already marked PRESENT for this meeting.');
      } else {
        setCodeError(msg || 'Attendance Code Invalid: The code you entered is incorrect. Please enter the current attendance code shared during the meeting.');
      }
    } finally {
      setCodeSubmitting(false);
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

  const meetingStartTime = new Date(meeting.startTime);

  // Determine availability status from Weekly Availability cycle & service commitments
  const memberAvailabilityStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' = (() => {
    // 1. Direct commitment attached to meeting for this member
    const directCommitment = meeting?.serviceCommitments?.[0]?.status;
    if (directCommitment === 'COMMITTED') return 'AVAILABLE';
    if (directCommitment === 'NOT_COMMITTED') return 'UNAVAILABLE';

    // 2. Check weekly availability cycle response
    if (availabilityData?.submitted) {
      if (Array.isArray(availabilityData.selectedMeetingIds) && availabilityData.selectedMeetingIds.includes(meetingId)) {
        return 'AVAILABLE';
      }
      return 'UNAVAILABLE';
    }

    // 3. Fallback to eventResponses if legacy response exists
    if (meeting?.eventResponses?.[0]?.attending === true) return 'AVAILABLE';
    if (meeting?.eventResponses?.[0]?.attending === false) return 'UNAVAILABLE';

    return 'PENDING';
  })();

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

  const isVirtual = isOnlineUnitMeeting(meeting);
  const virtualMeetingUrl = isVirtual ? (meeting.meetingUrl || extractVirtualUrl(meeting) || 'https://meet.google.com/wkx-kgew-iqe') : null;
  const isWedMeeting = title.toLowerCase().includes('wednesday') && (Boolean(meeting.serviceScheduleId) || title.toLowerCase().includes('weekly'));
  const recurrenceRuleStr = isWedMeeting ? 'FREQ=WEEKLY;BYDAY=WE' : null;

  const googleCalUrl = isVirtual ? buildAdvancedGoogleCalendarUrl({
    id: meeting.id,
    title,
    description,
    notes: meeting.notes,
    startTime: meetingStartTime,
    endTime: closeTimeDate,
    locationName: 'Online / Google Meet',
    virtualMeetingUrl,
    mode: 'VIRTUAL',
    recurrenceRule: recurrenceRuleStr,
    timezone: 'Africa/Lagos',
    agendaItems: meeting.agendaItems || [],
  }) : '';

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
            {(isWedMeeting || meeting.serviceScheduleId) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold text-xs border border-purple-500/20">
                <span className="material-symbols-outlined text-sm">autorenew</span>
                <span>{isWedMeeting ? 'Recurring — Every Wednesday' : 'Recurring Series'}</span>
              </span>
            )}
            {isVirtual && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-xs border border-emerald-500/20">
                <span className="material-symbols-outlined text-sm">videocam</span>
                <span>Online Meeting</span>
              </span>
            )}
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
              <span>{dateFormatted} · {meetingStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (WAT)</span>
            </p>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
            {description}
          </p>

          {/* Supervising Minister Card */}
          <div className="pt-3 border-t border-outline-variant/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-lg">shield_person</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Supervising Minister
                </span>
                {meeting.supervisingMinister ? (
                  <p className="text-xs sm:text-sm font-bold text-on-surface truncate">
                    {meeting.supervisingMinister.preferredName || `${meeting.supervisingMinister.firstName} ${meeting.supervisingMinister.lastName}`}
                    <span className="font-normal text-slate-500 text-xs ml-1.5">
                      ({meeting.supervisingMinister.subTeam?.name || meeting.supervisingMinister.roleInUnit || 'Executive'})
                    </span>
                  </p>
                ) : (
                  <p className="text-xs sm:text-sm font-medium text-slate-400 italic">
                    Supervising Minister: Not yet assigned
                  </p>
                )}
              </div>
            </div>
            {meeting.supervisingMinister && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[11px] shrink-0">
                Assigned
              </span>
            )}
          </div>

          {/* Quick Actions Row */}
          <div className="pt-2 flex flex-wrap items-center gap-2.5 border-t border-outline-variant/15">
            {virtualMeetingUrl && (
              <a
                href={virtualMeetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                <span className="material-symbols-outlined text-base">videocam</span>
                <span>Join Google Meet</span>
              </a>
            )}
            {isVirtual && (
              <a
                href={googleCalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface-container-low hover:bg-surface-container text-primary rounded-xl text-xs font-bold transition-all border border-outline-variant/25"
              >
                <span className="material-symbols-outlined text-base">calendar_add_on</span>
                <span>Add to Google Calendar</span>
              </a>
            )}
          </div>
        </section>

        {/* Dynamic Primary Check-In / Status Card (In-Flow, positioned naturally above the bottom nav) */}
        {onlineSuccessMsg && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-lg">check_circle</span>
              <span>{onlineSuccessMsg}</span>
            </div>
            <button onClick={() => setOnlineSuccessMsg('')} className="text-emerald-700 hover:text-emerald-900 dark:hover:text-white">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        {isVirtual ? (
          /* Online Meeting Attendance Workflow */
          attendanceRecord && ['PRESENT', 'EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(attendanceRecord.status) ? (
            /* 1. Marked Present */
            <section className="rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-50 via-teal-50/40 to-emerald-50/30 dark:from-emerald-950/50 dark:via-slate-900 dark:to-slate-900 p-5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">verified</span>
                  <h3 className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100 uppercase tracking-wider">
                    Attendance Confirmed
                  </h3>
                </div>
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                  PRESENT
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                You are marked <strong>PRESENT</strong> for this online meeting.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Attendance recorded at:{' '}
                <strong>
                  {new Date(attendanceRecord.actualArrivalTime || attendanceRecord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </strong>
                {attendanceRecord.method === 'ONLINE_CODE' && ' · Submitted valid attendance code'}
              </p>
            </section>
          ) : currentTime < new Date(meetingStartTime.getTime() - 10 * 60000) ? (
            /* 2. Before 10-minute window */
            <section className="rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                <span className="material-symbols-outlined text-xl text-blue-600 dark:text-blue-400">lock_clock</span>
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Attendance Not Yet Available
                </h4>
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed font-medium">
                Attendance opens 10 minutes before the meeting starts (
                {new Date(meetingStartTime.getTime() - 10 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                ). Please try again later.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                The 6-digit attendance code will be shared by the meeting host during the live session.
              </p>
            </section>
          ) : currentTime <= new Date(meetingStartTime.getTime() + 10 * 60000) ? (
            /* 3. Within 10-minute window */
            <section className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-blue-50/30 to-purple-50/20 dark:from-primary/10 dark:to-slate-900 p-5 shadow-md space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Attendance Window Active
                  </span>
                </div>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Valid until {new Date(meetingStartTime.getTime() + 10 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#0b1c30] dark:text-white">
                  Online Meeting Attendance
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  You have not marked your attendance. Enter the 6-digit attendance code announced during the online session.
                </p>
              </div>

              <button
                onClick={() => { setShowCodeModal(true); setCodeError(''); }}
                className="w-full bg-primary hover:bg-primary/90 text-white font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-[0_4px_14px_rgba(242,50,12,0.25)] flex justify-center items-center gap-2 transition-transform duration-150 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-xl">pin</span>
                <span>MARK ATTENDANCE</span>
              </button>
            </section>
          ) : (
            /* 4. After 10-minute window closed */
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="material-symbols-outlined text-xl text-slate-500">event_busy</span>
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Attendance Closed
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                The attendance window for this meeting has closed. The attendance code is no longer valid.
              </p>
            </section>
          )
        ) : attendanceRecord ? (
          /* Physical Gathering - Attendance Recorded */
          <section className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/40 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">verified</span>
                <h3 className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100 uppercase tracking-wider">
                  Attendance Recorded
                </h3>
              </div>
              <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">
                {attendanceRecord.status}
              </span>
            </div>
            <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed font-medium">
              Your attendance has been successfully recorded for this service.
            </p>
          </section>
        ) : isCheckInEligible ? (
          /* Physical Gathering Check-In */
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

        {/* Weekly Availability Status Card */}
        <section className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">event_available</span>
              <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white">Weekly Availability Status</h3>
            </div>
            {memberAvailabilityStatus === 'AVAILABLE' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                <span>Confirmed Available</span>
              </span>
            ) : memberAvailabilityStatus === 'UNAVAILABLE' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                <span className="material-symbols-outlined text-[13px]">cancel</span>
                <span>Indicated Unavailable</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                <span className="material-symbols-outlined text-[13px]">pending</span>
                <span>Pending Weekly Poll</span>
              </span>
            )}
          </div>

          {memberAvailabilityStatus === 'AVAILABLE' ? (
            <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-lg">verified</span>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  You indicated availability for this service
                </p>
                <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
                  Recorded in your Weekly Availability submission. Unit coordinators reference this for attendance planning and service rosters.
                </p>
              </div>
            </div>
          ) : memberAvailabilityStatus === 'UNAVAILABLE' ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-lg">event_busy</span>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  You indicated unavailable for this service
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Recorded in your Weekly Availability submission. If your schedule changes, you can update your selection while the weekly poll is open.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-lg">help_outline</span>
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Weekly availability not yet submitted
                </p>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                  Complete this week&apos;s availability form to let your unit leaders know which services and meetings you can attend.
                </p>
                <div className="pt-1">
                  <Link
                    href="/member/availability"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs"
                  >
                    <span>Fill Weekly Availability</span>
                    <span className="material-symbols-outlined text-xs">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-3 text-xs flex-wrap">
            <Link
              className="text-primary font-bold hover:underline inline-flex items-center gap-1"
              href="/member/availability"
            >
              <span>Weekly Availability Form</span>
              <span className="material-symbols-outlined text-xs">open_in_new</span>
            </Link>

            <Link
              className="text-slate-500 hover:text-slate-800 dark:hover:text-white font-medium inline-flex items-center gap-1"
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
          <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white">
            {isVirtual ? 'Virtual Meeting & Venue' : 'Location Details'}
          </h3>
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden shadow-2xs">
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  isVirtual ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' : 'bg-red-50 dark:bg-red-950/60 text-primary'
                }`}>
                  <span className="material-symbols-outlined text-[20px]">
                    {isVirtual ? 'videocam' : 'church'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-[#0b1c30] dark:text-white">
                    {isVirtual ? (locationName || 'Online / Google Meet') : locationName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isVirtual ? (
                      virtualMeetingUrl ? (
                        <a
                          href={virtualMeetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-semibold flex items-center gap-1 mt-0.5"
                        >
                          <span>{virtualMeetingUrl}</span>
                          <span className="material-symbols-outlined text-xs">open_in_new</span>
                        </a>
                      ) : (
                        'Online Meeting via Google Meet'
                      )
                    ) : (
                      <>Allowed check-in radius: <strong>{meeting?.geofenceRadiusMeters ?? 100} metres</strong></>
                    )}
                  </p>
                </div>
              </div>

              <div className="w-full h-px bg-outline-variant/20"></div>

              <div className="flex items-center gap-2.5 bg-surface-container-low p-3 rounded-xl border border-outline-variant/15 text-xs text-slate-600 dark:text-slate-300">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base shrink-0">
                  check_circle
                </span>
                <p>
                  {isVirtual
                    ? 'Online attendance is confirmed by submitting the 6-digit attendance code announced during the session.'
                    : 'GPS distance is automatically validated during check-in to confirm venue arrival.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Order of Service & Meeting Agenda */}
        {meeting?.agendaItems && meeting.agendaItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-lg">format_list_numbered</span>
                <span>Order of Service &amp; Agenda</span>
              </h3>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40">
                {meeting.agendaItems.length} items
              </span>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden divide-y divide-outline-variant/10 shadow-2xs">
              {meeting.agendaItems.map((item: any) => {
                const assigned = item.assignedMember;
                const assignedName = assigned
                  ? (assigned.preferredName || `${assigned.firstName || ''} ${assigned.lastName || ''}`.trim())
                  : null;

                return (
                  <div key={item.id} className="p-4 flex items-start gap-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs shrink-0 border border-indigo-200/50 dark:border-indigo-800/40 mt-0.5">
                      #{item.order}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#0b1c30] dark:text-white">{item.title}</span>
                        {item.durationMinutes && (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                            {item.durationMinutes} mins
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.description}</p>
                      )}
                      {assignedName && (
                        <div className="flex items-center gap-1.5 pt-1 text-xs text-slate-700 dark:text-slate-300 font-medium">
                          <span className="text-slate-400 text-[11px]">Led by:</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{assignedName}</span>
                          {assigned.roleInUnit && (
                            <span className="text-[10px] text-slate-400">({assigned.roleInUnit})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Online Attendance Code Modal */}
        {showCodeModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/30 shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-lg">pin</span>
                  </div>
                  <h3 className="font-extrabold text-base text-[#0b1c30] dark:text-white">
                    Mark Attendance
                  </h3>
                </div>
                <button
                  onClick={() => { setShowCodeModal(false); setCodeError(''); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  Enter the attendance code shared during the meeting.
                </p>
                <p className="text-[11px] text-slate-400">
                  Attendance Code
                </p>
              </div>

              <form onSubmit={handleSubmitAttendanceCode} className="space-y-4">
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="______"
                    value={attendanceCodeInput}
                    onChange={(e) => setAttendanceCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full text-center tracking-[0.4em] font-mono font-black text-2xl py-3.5 px-4 rounded-2xl border-2 border-outline-variant/30 bg-surface-container-low text-slate-900 dark:text-white focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-400 text-center mt-1.5 font-medium">
                    6-digit numeric code
                  </p>
                </div>

                {codeError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-bold text-red-700 dark:text-red-300 flex items-start gap-2">
                    <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
                    <span>{codeError}</span>
                  </div>
                )}

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowCodeModal(false); setCodeError(''); }}
                    className="flex-1 py-3 px-4 rounded-xl border border-outline-variant/30 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-surface-container-low transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={codeSubmitting || attendanceCodeInput.length !== 6}
                    className="flex-1 py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold tracking-wide uppercase transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {codeSubmitting ? 'Verifying…' : 'SUBMIT ATTENDANCE'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
