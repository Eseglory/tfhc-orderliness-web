'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { LogoIcon } from '../../../components/LogoIcon';
import { EngagementNudge } from '../../../components/activeness/EngagementNudge';
import { ProfileCompletionReminder } from '../../../components/activeness/ProfileCompletionReminder';
import { CampaignAlert } from '../../../components/activeness/CampaignAlert';
import { MonthlyDuesAlert } from '../../../components/activeness/MonthlyDuesAlert';
import { MemberAttendanceTrendChart } from '../../../components/member/MemberAttendanceTrendChart';
import { MemberAttendancePieChart } from '../../../components/member/MemberAttendancePieChart';

type Performance = {
  member?: { firstName: string; profilePhotoUrl: string | null; subTeam?: { name: string } | null };
  attendanceRate: number;
  punctualityRate: number;
  totalPoints: number;
  rankPosition?: number | string;
  currentAttendanceStreak: number;
  attendedCount: number;
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  expectedCount: number;
  recognition?: { eligible: boolean };
};


export default function MemberDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [perf, setPerf] = useState<Performance | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [nextTodayService, setNextTodayService] = useState<any>(null);
  const [nextWardrobe, setNextWardrobe] = useState<any>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    const refresh = () => fetchApi('/members/me/notifications').then((items: any[]) => setHasUnread(items.some((i) => i.status === 'UNREAD'))).catch(() => {});
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('tfhc:notifications-synced', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('tfhc:notifications-synced', refresh);
    };
  }, []);

  const [availabilityData, setAvailabilityData] = useState<{
    submitted?: boolean;
    selectedMeetingIds?: string[];
    cycle?: { state?: string; closesAt?: string; isOpen?: boolean };
  } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const get = <T,>(url: string) => fetchApi<T>(url, { signal: ac.signal });
    get<Performance>('/scoring/my-performance').then(setPerf).catch(() => {});
    get<any>('/wardrobe/next').then((res) => setNextWardrobe(res?.data || res || null)).catch(() => {});
    get<{ activeMeeting: any; today: any[]; upcoming: any[] }>('/calendar/today-upcoming').then((res) => {
      if (res?.activeMeeting) {
        const now = new Date();
        const m = res.activeMeeting;
        const openTime = m.attendanceOpenTime ? new Date(m.attendanceOpenTime) : new Date(new Date(m.startTime).getTime() - 30 * 60000);
        const closeTime = m.attendanceCloseTime ? new Date(m.attendanceCloseTime) : (m.endTime ? new Date(m.endTime) : new Date(new Date(m.startTime).getTime() + 60 * 60000));
        const cutoffTime = new Date(closeTime.getTime() + 60 * 60000);
        if (now >= openTime && now <= cutoffTime && !['CANCELLED', 'CLOSED'].includes(m.status)) {
          setActiveMeeting(m);
        } else {
          setActiveMeeting(null);
        }
      }
      const todayList = Array.isArray(res?.today) ? res.today : [];
      const upcomingList = Array.isArray(res?.upcoming) ? res.upcoming : [];
      const now = new Date();
      const todayPending = todayList.filter((m) => {
        if (['CANCELLED', 'CLOSED'].includes(m.status)) return false;
        const closeTime = m.attendanceCloseTime ? new Date(m.attendanceCloseTime) : (m.endTime ? new Date(m.endTime) : new Date(new Date(m.startTime).getTime() + 60 * 60000));
        const cutoffTime = new Date(closeTime.getTime() + 60 * 60000);
        return cutoffTime > now;
      });
      const nextScheduled = todayPending.find((m) => m.status === 'SCHEDULED' || m.status === 'ACTIVE');
      if (nextScheduled) setNextTodayService(nextScheduled);

      // Deduplicate by ID
      const seenIds = new Set<string>();
      const combined: any[] = [];
      for (const item of [...todayPending, ...upcomingList]) {
        if (item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          combined.push(item);
        }
      }
      combined.sort(
        (a, b) => new Date(a.startTime || a.meetingDate).getTime() - new Date(b.startTime || b.meetingDate).getTime()
      );
      setUpcoming(combined.slice(0, 5));
    }).catch(() => {});

    get<any>('/availability/current')
      .then((a) => {
        setAvailabilityData(a);
        const open = Boolean(
          a?.cycle?.isOpen ?? (a?.cycle?.state === 'OPEN' && (!a?.cycle?.closesAt || new Date(a.cycle.closesAt) > new Date()))
        );
        setAvailabilityOpen(open && !a?.submitted);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const closesLabel = useMemo(() => {
    if (!activeMeeting?.attendanceCloseTime) return null;
    const mins = Math.round((new Date(activeMeeting.attendanceCloseTime).getTime() - Date.now()) / 60000);
    if (mins <= 0) return 'Closing now';
    if (mins < 60) return `Closes in ${mins}m`;
    return `Closes ${new Date(activeMeeting.attendanceCloseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [activeMeeting]);

  const firstName = perf?.member?.firstName || user?.firstName;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Cohesive, curated Church Tools icons and colors
  const churchTools = [
    { href: '/member/wardrobe', label: 'Wardrobe', icon: 'apparel', iconColor: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/50' },
    { href: '/member/my-attendance', label: 'Attendance', icon: 'fact_check', iconColor: 'text-[#f2320c]', bg: 'bg-red-50 dark:bg-red-950/50' },
    { href: '/member/meetings', label: 'Events', icon: 'event', iconColor: 'text-[#0b1c30] dark:text-blue-400', bg: 'bg-slate-100 dark:bg-slate-800' },
    { href: '/member/leaderboard', label: 'Leaderboard', icon: 'emoji_events', iconColor: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/50' },
    { href: '/member/dues', label: 'Finance', icon: 'payments', iconColor: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
    { href: '/member/welfare', label: 'Requests', icon: 'rate_review', iconColor: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/50' },
    { href: '/member/availability', label: 'Availability', icon: 'event_available', iconColor: 'text-[#0b1c30] dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
    { href: '/member/calendar', label: 'Calendar', icon: 'calendar_month', iconColor: 'text-[#f2320c]', bg: 'bg-red-50 dark:bg-red-950/50' },
    { href: '/member/submit-excuse', label: 'Absence', icon: 'event_busy', iconColor: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/50' },
    { href: '/member/analytics', label: 'Analytics', icon: 'monitoring', iconColor: 'text-[#0b1c30] dark:text-blue-400', bg: 'bg-slate-100 dark:bg-slate-800' },
    { href: '/member/rewards', label: 'Milestones', icon: 'workspace_premium', iconColor: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/50' },
    { href: '/member/files', label: 'Files', icon: 'folder_open', iconColor: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
    { href: '/member/offline', label: 'Offline', icon: 'offline_pin', iconColor: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/50' },
  ];

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-white pb-28 antialiased">
      {/* Executive Portal Header */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/member/profile" aria-label="My profile" className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#f2320c]/20 bg-slate-100 dark:bg-slate-800 p-0.5 shadow-xs transition-transform active:scale-95">
            {perf?.member?.profilePhotoUrl
              ? <img src={perf.member.profilePhotoUrl} alt="Profile" className="h-full w-full rounded-full object-cover" />
              : <LogoIcon alt="Profile" className="h-full w-full object-contain p-1" />}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
          </Link>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-none">{greeting}</span>
            <span className="text-base font-extrabold text-[#0b1c30] dark:text-white leading-tight mt-0.5">{firstName || 'Member'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (user.role !== 'MEMBER' || user.isSuperAdmin) && (
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] text-white font-bold text-xs transition-all shadow-xs shrink-0 active:scale-95"
              title="Switch to Admin App"
              aria-label="Switch to Admin App"
            >
              <span className="material-symbols-outlined text-sm text-amber-300">admin_panel_settings</span>
              <span>Admin</span>
            </button>
          )}
          <Link href="/member/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {hasUnread && (
              <span aria-label="Unread notifications" className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-[#f2320c] ring-2 ring-white dark:ring-slate-900 animate-pulse" />
            )}
          </Link>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col gap-5 px-4 sm:px-6 py-4 max-w-4xl mx-auto">
        {/* Active Service Attendance Reminder Modal / Banner */}

        {/* Dynamic Gathering / Check-in Hero Widget */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  {availabilityData?.submitted ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-bold">
                      <span className="material-symbols-outlined text-xs text-emerald-600">verified</span>
                      Confirmed for Service
                    </span>
                  ) : activeMeeting ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-bold">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      Live Check-In Open
                    </span>
                  ) : nextTodayService ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 text-[#f2320c] dark:bg-red-950/60 dark:text-red-400 px-2.5 py-0.5 text-xs font-bold">
                      <span className="material-symbols-outlined text-xs">event_upcoming</span>
                      Today&apos;s Service
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 text-xs font-semibold">
                      <span className="material-symbols-outlined text-xs">done_all</span>
                      All Caught Up
                    </span>
                  )}
                  {(activeMeeting?.isCompulsory || (!activeMeeting && nextTodayService?.isCompulsory)) && (
                    <span className="rounded-md bg-red-100 dark:bg-red-950 text-[#f2320c] dark:text-red-300 px-2 py-0.5 text-[10px] font-extrabold">Compulsory</span>
                  )}
                </div>

                <h2 className="text-lg sm:text-xl font-extrabold text-[#0b1c30] dark:text-white leading-snug truncate">
                  {activeMeeting
                    ? activeMeeting.title
                    : nextTodayService
                    ? nextTodayService.title
                    : 'No Active Gathering'}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                  <span className="material-symbols-outlined text-sm text-slate-400">schedule</span>
                  {activeMeeting
                    ? `${new Date(activeMeeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${activeMeeting.locationName || 'Main Sanctuary'}`
                    : nextTodayService
                    ? `${new Date(nextTodayService.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${nextTodayService.locationName || 'Main Sanctuary'}`
                    : 'Check the upcoming schedule below for the next service.'}
                </p>
                {availabilityData?.submitted && (activeMeeting || nextTodayService) && (
                  <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                    You have submitted your availability for this week&apos;s service. No additional check-in is required.
                  </p>
                )}
              </div>

              {!availabilityData?.submitted && closesLabel && (
                <span className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 shrink-0">
                  {closesLabel}
                </span>
              )}
            </div>

            <Link
              href={
                availabilityData?.submitted
                  ? (activeMeeting ? `/member/meetings/${activeMeeting.id}` : nextTodayService ? `/member/meetings/${nextTodayService.id}` : '/member/availability')
                  : (activeMeeting ? '/member/check-in' : nextTodayService ? `/member/meetings/${nextTodayService.id}` : '/member/calendar')
              }
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 px-4 text-sm font-extrabold transition-all active:scale-[0.98] shadow-sm ${
                !availabilityData?.submitted && activeMeeting
                  ? 'bg-[#f2320c] hover:bg-[#d82a08] text-white shadow-red-600/25'
                  : 'bg-[#0b1c30] hover:bg-[#162a42] text-white shadow-slate-900/10'
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                {availabilityData?.submitted
                  ? 'event_available'
                  : activeMeeting
                  ? 'location_on'
                  : 'calendar_month'}
              </span>
              {availabilityData?.submitted
                ? 'View Service Details'
                : activeMeeting
                ? 'Check In Now'
                : nextTodayService
                ? 'View Gathering Details'
                : 'View Calendar & Events'}
            </Link>
          </div>
        </section>

        {/* Next Expected Wardrobe Hero Card */}
        {nextWardrobe ? (
          <section className="relative overflow-hidden rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-slate-900 via-[#0e1e38] to-[#081324] p-5 sm:p-6 text-white shadow-xl shadow-slate-950/20">
            <div className="absolute top-0 right-0 -mt-6 -mr-6 w-48 h-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-wider text-red-400">
                  This Sunday&apos;s Dress Code
                </span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/15 text-white font-black uppercase tracking-wider ml-1">
                  {nextWardrobe.eventType.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-white/90 font-bold bg-white/10 px-3.5 py-1.5 rounded-xl backdrop-blur-md border border-white/15">
                <span className="material-symbols-outlined text-sm text-amber-300">calendar_today</span>
                <span>
                  {new Date(nextWardrobe.scheduledDate).toLocaleDateString('default', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC'
                  })}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 border border-white/20 text-amber-300 flex items-center justify-center flex-shrink-0 shadow-inner">
                  <span className="material-symbols-outlined text-3xl">apparel</span>
                </div>

                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-slate-300 font-bold truncate">{nextWardrobe.title}</p>
                  <h3 className="text-base sm:xl font-black text-white truncate leading-tight">
                    {nextWardrobe.outfit?.title || 'Prescribed Uniform'}
                  </h3>

                  {/* Swatches & Pieces count */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {nextWardrobe.outfit?.items?.slice(0, 5).map((layer: any, idx: number) => (
                      <span
                        key={idx}
                        title={layer.variant?.colorName || layer.item?.name}
                        className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-xs"
                        style={{ backgroundColor: layer.variant?.colorCode || layer.variant?.colorHex || '#D97706' }}
                      />
                    ))}
                    <span className="text-[11px] text-white/80 font-bold ml-1">
                      {nextWardrobe.outfit?.items?.length || 0} Pieces Prescribed
                    </span>
                  </div>
                </div>
              </div>

              <Link
                href="/member/wardrobe"
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white text-slate-950 hover:bg-amber-100 font-black text-xs transition-all shadow-lg active:scale-95 flex items-center justify-center gap-1.5 shrink-0"
              >
                <span>View Full Uniform Guide</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </section>
        ) : null}

        {/* In-Flow Action Alerts & Reminders */}
        <MonthlyDuesAlert />
        <CampaignAlert />
        <EngagementNudge />
        <ProfileCompletionReminder />

        {availabilityData?.submitted ? (
          <Link href="/member/availability" className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/40 px-4 py-3 text-slate-900 dark:text-white hover:bg-emerald-100/80 transition-colors shadow-xs">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">verified</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-extrabold text-emerald-950 dark:text-emerald-200">Availability Submitted</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 truncate">You have submitted your availability for this week&apos;s service. Remember to check in when service starts.</p>
            </div>
            <span className="material-symbols-outlined text-emerald-400 text-base">chevron_right</span>
          </Link>
        ) : availabilityOpen ? (
          <Link href="/member/availability" className="flex items-center gap-3 rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/40 px-4 py-3 text-slate-900 dark:text-white hover:bg-blue-100/80 transition-colors shadow-xs">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-2xl">event_available</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-extrabold text-blue-950 dark:text-blue-200">Weekly Availability Open (Monday 12:00 AM – 12:00 PM WAT)</p>
              <p className="text-[11px] text-blue-700 dark:text-blue-300 truncate">Let your team know when you can serve this week before Monday 12:00 PM WAT.</p>
            </div>
            <span className="material-symbols-outlined text-blue-400 text-base">chevron_right</span>
          </Link>
        ) : null}

        {/* Top KPI Metrics Bar */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Rank */}
          <Link
            href="/member/leaderboard"
            className="flex flex-col p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:border-amber-400 transition-colors"
          >
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Unit Rank</span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-400 leading-tight flex items-center justify-between mt-0.5">
              {perf?.rankPosition ? `#${perf.rankPosition}` : '—'}
              <span className="material-symbols-outlined text-xs text-slate-400">chevron_right</span>
            </span>
          </Link>

          {/* Attendance Rate */}
          <Link
            href="/member/analytics"
            className="flex flex-col p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:border-[#0b1c30] transition-colors"
          >
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Attendance</span>
            <span className="text-lg font-black text-[#0b1c30] dark:text-white leading-tight mt-0.5">
              {(perf?.attendanceRate ?? 0).toFixed(0)}%
            </span>
          </Link>

          {/* Points */}
          <Link
            href="/member/rewards"
            className="flex flex-col p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:border-[#f2320c] transition-colors"
          >
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Points</span>
            <span className="text-lg font-black text-[#f2320c] leading-tight mt-0.5">
              {perf?.totalPoints ?? 0}
            </span>
          </Link>

          {/* Streak */}
          <Link
            href="/member/rewards"
            className="flex flex-col p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:border-emerald-500 transition-colors"
          >
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Active Streak</span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-base text-[#f2320c]">local_fire_department</span>
              <span>{perf?.currentAttendanceStreak ?? 0} <span className="text-xs font-bold text-slate-400">wks</span></span>
            </span>
          </Link>
        </section>

        {/* Member Analytics Row: Graph (Activity & Attendance Trends) + Pie Chart (Standing & Distribution) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Attendance & Activity Trend Graph (7 cols on desktop) */}
          <div className="lg:col-span-7 flex flex-col">
            <MemberAttendanceTrendChart
              attendanceRate={perf?.attendanceRate}
              punctualityRate={perf?.punctualityRate}
            />
          </div>

          {/* Right: Standing & Status Distribution Pie Chart (5 cols on desktop) */}
          <div className="lg:col-span-5 flex flex-col">
            <MemberAttendancePieChart
              attendedCount={perf?.attendedCount}
              onTimeCount={perf?.onTimeCount}
              absentCount={perf?.absentCount}
              excusedCount={perf?.excusedCount}
              attendanceRate={perf?.attendanceRate}
              punctualityRate={perf?.punctualityRate}
              rankPosition={typeof perf?.rankPosition === 'number' ? perf.rankPosition : undefined}
            />
          </div>
        </section>

        {/* Native App Launcher Grid (12 Tools) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Church Tools
            </h3>
            <span className="text-xs font-bold text-[#f2320c] dark:text-red-400">12 Modules</span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 sm:gap-3 text-center">
            {churchTools.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 sm:p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:border-[#f2320c]/40 active:scale-95"
              >
                <div className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl ${action.bg} ${action.iconColor} transition-transform group-hover:scale-105`}>
                  <span className="material-symbols-outlined text-[22px] sm:text-[24px]">{action.icon}</span>
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-200 truncate w-full tracking-tight">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Upcoming Gathering Cards */}
        <section className="space-y-3">
          <div className="flex items-end justify-between px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Upcoming Schedule
            </h3>
            <Link href="/member/meetings" className="text-xs font-bold text-[#0b1c30] dark:text-slate-300 hover:text-[#f2320c] hover:underline">
              View all
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {upcoming.length > 0 ? (
              upcoming.map((m, i) => (
                <Link
                  key={m.id || i}
                  href={`/member/meetings/${m.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 transition-all hover:border-[#0b1c30]/40 hover:shadow-xs active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-[#0b1c30] text-white shrink-0 shadow-xs">
                      <span className="text-sm font-black leading-none">{new Date(m.startTime || m.meetingDate).getDate()}</span>
                      <span className="text-[9px] uppercase font-bold leading-none mt-1 text-slate-300">{new Date(m.startTime || m.meetingDate).toLocaleString([], { month: 'short' })}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-[#0b1c30] dark:text-white truncate leading-tight">{m.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {m.locationName || 'Main Sanctuary'}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-base">chevron_right</span>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No gatherings scheduled yet.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
