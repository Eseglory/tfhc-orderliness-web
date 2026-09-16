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

/** Circular progress ring for the headline attendance figure. */
function Ring({ value, label }: { value: number; label: string }) {
  const r = 46, c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  const tone = value >= 90 ? '#059669' : value >= 75 ? '#d97706' : '#e11d48';
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-surface-container" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute text-center">
        <p className="font-headline-md text-headline-md font-extrabold text-primary">{value.toFixed(0)}%</p>
        <p className="font-label-sm text-label-sm text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

export default function MemberDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [perf, setPerf] = useState<Performance | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [nextTodayService, setNextTodayService] = useState<any>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    const refresh = () => fetchApi('/members/me/notifications').then((items: any[]) => setHasUnread(items.some((i) => i.status === 'UNREAD'))).catch(() => {});
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const get = <T,>(url: string) => fetchApi<T>(url, { signal: ac.signal });
    get<Performance>('/scoring/my-performance').then(setPerf).catch(() => {});
    get<{ activeMeeting: any; today: any[]; upcoming: any[] }>('/calendar/today-upcoming').then((res) => {
      if (res?.activeMeeting) setActiveMeeting(res.activeMeeting);
      const todayList = Array.isArray(res?.today) ? res.today : [];
      const upcomingList = Array.isArray(res?.upcoming) ? res.upcoming : [];
      const now = new Date();
      const todayPending = todayList.filter((m) => {
        if (['CANCELLED', 'CLOSED'].includes(m.status)) return false;
        if (m.status === 'ACTIVE') return true;
        const endTime = m.endTime ? new Date(m.endTime) : (m.startTime ? new Date(new Date(m.startTime).getTime() + 2 * 3600000) : null);
        return !endTime || endTime > now;
      });
      const nextScheduled = todayPending.find((m) => m.status === 'SCHEDULED');
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
    // 404 when the weekly cycle hasn't been opened — treated as "not open".
    get<{ cycle?: { state?: string; closesAt?: string }; submitted?: boolean }>('/availability/current')
      .then((a) => setAvailabilityOpen(Boolean(
        a?.cycle?.state === 'OPEN' && !a.submitted && (!a.cycle.closesAt || new Date(a.cycle.closesAt) > new Date()),
      )))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const closesLabel = useMemo(() => {
    if (!activeMeeting?.attendanceCloseTime) return null;
    const mins = Math.round((new Date(activeMeeting.attendanceCloseTime).getTime() - Date.now()) / 60000);
    if (mins <= 0) return 'Closing now';
    if (mins < 60) return `Closes in ${mins} min${mins === 1 ? '' : 's'}`;
    return `Closes ${new Date(activeMeeting.attendanceCloseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [activeMeeting]);

  const firstName = perf?.member?.firstName;
  const month = new Date().toLocaleString([], { month: 'long' });

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background font-body-md text-on-background pb-28">
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant/10 bg-background px-edge-margin">
        <div className="flex items-center gap-3">
          <Link href="/member/profile" aria-label="My profile" className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container p-1">
            {perf?.member?.profilePhotoUrl
              ? <img src={perf.member.profilePhotoUrl} alt="Profile" className="h-full w-full rounded-full object-cover" />
              : <LogoIcon alt="Profile" className="h-full w-full object-contain" />}
          </Link>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Home</span>
            <span className="font-headline-sm text-headline-sm font-bold text-primary">Hello{firstName ? `, ${firstName}` : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user && (user.role !== 'MEMBER' || user.isSuperAdmin) && (
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-xs shrink-0"
              title="Switch to Admin App"
              aria-label="Switch to Admin App"
            >
              <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
              <span className="hidden sm:inline">Switch to Admin App</span>
              <span className="sm:hidden">Admin App</span>
            </button>
          )}
          <Link href="/member/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-variant">
            <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
            {hasUnread && <span aria-label="Unread notifications" className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-error" />}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-stack-lg px-edge-margin py-stack-md md:max-w-2xl">
        {/* Primary action */}
        <section className="relative overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-[0px_2px_8px_rgba(0,0,0,0.05)]">
          <div className={`absolute left-0 top-0 h-full w-1 ${activeMeeting ? 'bg-tertiary-container' : nextTodayService ? 'bg-primary' : 'bg-outline-variant'}`} />
          <div className="flex flex-col gap-4 p-4">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-bold text-primary">
                {activeMeeting
                  ? activeMeeting.title
                  : nextTodayService
                  ? `Today’s Service: ${nextTodayService.title}`
                  : 'No service is open right now'}
                {(activeMeeting?.isCompulsory || (!activeMeeting && nextTodayService?.isCompulsory)) && (
                  <span className="ml-2 align-middle rounded-full bg-error-container px-2 py-0.5 font-label-sm text-label-sm text-error">Compulsory</span>
                )}
              </h2>
              <p className="mt-1 flex items-center gap-1 font-body-md text-body-md text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                {activeMeeting
                  ? `${new Date(activeMeeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${activeMeeting.locationName}`
                  : nextTodayService
                  ? `${new Date(nextTodayService.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${nextTodayService.locationName}`
                  : 'You’re all caught up. Check back when your next gathering begins.'}
              </p>
            </div>
            {activeMeeting ? (
              <div className="flex items-center justify-between rounded-lg border border-surface-variant bg-surface-variant/50 p-3">
                <span className="flex items-center gap-2 font-label-md text-label-md font-semibold text-on-surface">
                  <span className="h-3 w-3 rounded-full bg-on-tertiary-container animate-pulse" /> Attendance window open
                </span>
                {closesLabel && <span className="rounded bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">{closesLabel}</span>}
              </div>
            ) : nextTodayService ? (
              <div className="flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
                <span className="flex items-center gap-2 font-label-md text-xs font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-base text-primary">event_upcoming</span> Scheduled for today • Attendance opens before service
                </span>
              </div>
            ) : null}
            <button
              onClick={() => router.push(activeMeeting ? '/member/check-in' : nextTodayService ? `/member/meetings/${nextTodayService.id}` : '/member/meetings')}
              disabled={!activeMeeting && !nextTodayService}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-label-md text-label-md font-bold text-on-primary transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <span className="material-symbols-outlined">{activeMeeting ? 'location_on' : 'event'}</span>
              {activeMeeting ? 'Check In' : nextTodayService ? 'View Today’s Service Details' : 'No Active Check In'}
            </button>
          </div>
        </section>

        {/* Quick Church Actions */}
        <section className="grid grid-cols-4 gap-2 text-center">
          <Link href="/member/my-attendance" className="flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 transition-transform active:scale-95 shadow-[0px_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]">fact_check</span>
            </div>
            <span className="font-label-sm text-[11px] font-bold text-on-surface">Attendance</span>
          </Link>
          <Link href="/member/meetings" className="flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 transition-transform active:scale-95 shadow-[0px_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/10 text-secondary">
              <span className="material-symbols-outlined text-[20px]">event</span>
            </div>
            <span className="font-label-sm text-[11px] font-bold text-on-surface">Events</span>
          </Link>
          <Link href="/member/dues" className="flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 transition-transform active:scale-95 shadow-[0px_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary/10 text-tertiary">
              <span className="material-symbols-outlined text-[20px]">volunteer_activism</span>
            </div>
            <span className="font-label-sm text-[11px] font-bold text-on-surface">Finance</span>
          </Link>
          <Link href="/member/welfare" className="flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 transition-transform active:scale-95 shadow-[0px_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <span className="material-symbols-outlined text-[20px]">rate_review</span>
            </div>
            <span className="font-label-sm text-[11px] font-bold text-on-surface text-center">Requests</span>
          </Link>
          {[
            { href: '/member/calendar', label: 'Calendar', icon: 'calendar_month' },
            { href: '/member/files', label: 'Files', icon: 'folder_open' },
            { href: '/member/offline', label: 'Offline', icon: 'offline_pin' },
            { href: '/member/submit-excuse', label: 'Absence', icon: 'event_busy' },
          ].map(action => (
            <Link key={action.href} href={action.href} className="flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-sm">
              <span aria-hidden="true" className="material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">{action.icon}</span>
              <span className="font-label-sm text-[11px] font-bold text-on-surface">{action.label}</span>
            </Link>
          ))}
        </section>

        {availabilityOpen && (
          <Link href="/member/availability" className="flex items-center gap-3 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-on-surface">
            <span className="material-symbols-outlined text-secondary">event_available</span>
            <span className="flex-1 text-sm font-medium">This week’s availability is open — let your team know when you can serve.</span>
            <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
          </Link>
        )}

        <CampaignAlert />
        <EngagementNudge />
        <ProfileCompletionReminder />

        {/* Performance snapshot */}
        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.05)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface-variant">Your standing</h3>
            {perf?.recognition?.eligible && (
              <span className="rounded-full bg-secondary-container px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-secondary-container">Recognition eligible</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Ring value={perf?.attendanceRate ?? 0} label="attendance" />
            <div className="flex-1 space-y-2">
              {[
                ['Punctuality', `${(perf?.punctualityRate ?? 0).toFixed(0)}%`],
                ['Points', `${perf?.totalPoints ?? 0}`],
                ['Rank', perf?.rankPosition ? `#${perf.rankPosition}` : '—'],
                ['Streak', `${perf?.currentAttendanceStreak ?? 0} in a row`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-outline-variant/20 pb-1.5 last:border-0">
                  <span className="font-body-md text-body-md text-on-surface-variant">{k}</span>
                  <span className="font-label-md text-label-md font-bold text-primary">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* This month */}
        <section>
          <h3 className="mb-3 font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface-variant">{month} so far</h3>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['Present', perf?.attendedCount ?? 0, 'text-emerald-600'],
              ['On time', perf?.onTimeCount ?? 0, 'text-emerald-600'],
              ['Absent', perf?.absentCount ?? 0, 'text-rose-600'],
              ['Excused', perf?.excusedCount ?? 0, 'text-on-surface-variant'],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-center shadow-[0px_2px_8px_rgba(0,0,0,0.03)]">
                <p className={`font-headline-sm text-headline-sm font-extrabold ${tone as string}`}>{value as number}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">{label as string}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Upcoming */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h3 className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface-variant">Upcoming schedule</h3>
            <Link href="/member/meetings" className="font-label-sm text-label-sm font-bold text-primary hover:underline">View all</Link>
          </div>
          <div className="flex flex-col gap-2">
            {upcoming.length > 0 ? (
              upcoming.map((m, i) => (
                <Link key={m.id || i} href={`/member/meetings/${m.id}`} className="flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-[0px_2px_8px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-col items-center justify-center rounded bg-surface-container text-primary">
                      <span className="font-label-sm text-label-sm font-bold leading-none">{new Date(m.startTime || m.meetingDate).getDate()}</span>
                      <span className="text-[9px] uppercase leading-none">{new Date(m.startTime || m.meetingDate).toLocaleString([], { month: 'short' })}</span>
                    </div>
                    <div>
                      <p className="font-label-md text-label-md font-bold text-primary">{m.title}</p>
                      <p className="text-[13px] text-on-surface-variant">
                        {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {m.locationName}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-4 text-center font-body-md text-body-md text-on-surface-variant">
                No gatherings scheduled yet.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
