'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../lib/api';
import { LogoIcon } from '../../../components/LogoIcon';

export default function MemberDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [hasUnread, setHasUnread] = useState(false);
  useEffect(() => {
    const refresh = () => fetchApi('/members/me/notifications').then((items: any[]) => setHasUnread(items.some(item => item.status === 'UNREAD'))).catch(() => {});
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([]);

  useEffect(() => {
    fetchApi('/scoring/my-performance')
      .then((data) => setProfile(data))
      .catch((err) => console.error(err));

    fetchApi('/meetings/active')
      .then((activeMeetingResponse) => {
        if (activeMeetingResponse) setActiveMeeting(activeMeetingResponse);
      })
      .catch((err) => console.error(err));

    fetchApi('/meetings')
      .then((allMs) => setUpcomingMeetings(allMs.slice(0, 3)))
      .catch((err) => console.error(err));
  }, []);

  const attendanceRate = (profile?.attendanceRate ?? 0).toFixed(1);
  const punctualityRate = (profile?.punctualityRate ?? 0).toFixed(1);
  const totalPoints = profile?.totalPoints ?? 0;
  const rankPosition = profile?.rankPosition ?? '—';
  const currentStreak = profile?.currentAttendanceStreak ?? 0;

  const closesInLabel = (() => {
    if (!activeMeeting?.attendanceCloseTime) return null;
    const mins = Math.round((new Date(activeMeeting.attendanceCloseTime).getTime() - Date.now()) / 60000);
    if (mins <= 0) return 'Closing now';
    if (mins < 60) return `Closes in ${mins} min${mins === 1 ? '' : 's'}`;
    return `Closes ${new Date(activeMeeting.attendanceCloseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  })();

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex flex-col pb-24 relative overflow-x-hidden">
      {/* TopAppBar matching Stitch Screen 1 verbatim */}
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center p-1">
            <Link href="/member/profile" aria-label="My profile" className="w-full h-full">{profile?.member?.profilePhotoUrl ? <img src={profile.member.profilePhotoUrl} alt="User profile photo" className="w-full h-full rounded-full object-cover" /> : <LogoIcon alt="User profile photo" className="w-full h-full object-contain" />}</Link>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Dashboard</span>
            <span className="font-headline-sm text-headline-sm font-bold text-primary">
              Hello{profile?.member ? `, ${profile.member.firstName}` : ''}
            </span>
          </div>
        </div>
        <Link href="/member/notifications" className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors group">
          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors" data-icon="notifications">notifications</span>
          {hasUnread && <span aria-label="Unread notifications" className="absolute top-2 right-2.5 w-2 h-2 bg-error rounded-full"></span>}
        </Link>
      </header>

      {/* Main Content matching Stitch Screen 1 verbatim */}
      <main className="flex-1 flex flex-col gap-stack-lg px-edge-margin py-stack-md max-w-md mx-auto sm:max-w-xl md:max-w-4xl w-full">
        {/* Live Meeting Banner Widget */}
        <section className="bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-tertiary-container"></div>
          <div className="p-4 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-primary mb-1 font-bold">
                  {activeMeeting ? activeMeeting.title : 'No meeting is open right now'}{' '}
                  {activeMeeting?.isCompulsory && (
                    <span className="font-label-sm text-label-sm text-error bg-error-container px-2 py-0.5 rounded-full ml-2 align-middle">
                      Compulsory
                    </span>
                  )}
                </h2>
                <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>{' '}
                  {activeMeeting
                    ? `${new Date(activeMeeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${activeMeeting.locationName}`
                    : 'Check back when your next service begins.'}
                </p>
              </div>
            </div>
            {activeMeeting && (
              <div className="bg-surface-variant/50 rounded-lg p-3 flex items-center justify-between border border-surface-variant">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-on-tertiary-container pulse-dot"></div>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">Attendance Window Open</span>
                </div>
                {closesInLabel && (
                  <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-high px-2 py-1 rounded">
                    {closesInLabel}
                  </span>
                )}
              </div>
            )}
            <button
              onClick={() => router.push('/member/check-in')}
              disabled={!activeMeeting}
              className="w-full bg-primary hover:opacity-90 text-on-primary font-label-md text-label-md py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-transform duration-200 active:scale-[0.98] font-bold disabled:opacity-50"
            >
              <span className="material-symbols-outlined" data-icon="location_on">location_on</span>
              {activeMeeting ? 'Proceed to Check-In' : 'No active check-in'}
            </button>
          </div>
        </section>

        {/* Quick Stats Carousel */}
        <section>
          <div className="flex justify-between items-end mb-3">
            <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-bold">Performance Overview</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 snap-x">
            {/* Stat Card 1 */}
            <div className="snap-start min-w-[140px] flex-shrink-0 bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 p-3 flex flex-col justify-between h-[110px]">
              <div className="flex justify-between items-start w-full">
                <span className="material-symbols-outlined text-outline">group_add</span>
              </div>
              <div>
                <div className="font-headline-md text-headline-md text-primary font-bold">{attendanceRate}%</div>
                <div className="font-label-sm text-label-sm text-on-surface-variant">Attendance Rate</div>
              </div>
            </div>

            {/* Stat Card 2 */}
            <div className="snap-start min-w-[140px] flex-shrink-0 bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 p-3 flex flex-col justify-between h-[110px]">
              <div className="flex justify-between items-start w-full">
                <span className="material-symbols-outlined text-outline">timer</span>
              </div>
              <div>
                <div className="font-headline-md text-headline-md text-primary font-bold">{punctualityRate}%</div>
                <div className="font-label-sm text-label-sm text-on-surface-variant">Punctuality</div>
              </div>
            </div>

            {/* Stat Card 3 */}
            <div className="snap-start min-w-[140px] flex-shrink-0 bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 p-3 flex flex-col justify-between h-[110px] relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-secondary-container/20 rounded-full blur-xl"></div>
              <div className="flex justify-between items-start w-full relative z-10">
                <span className="material-symbols-outlined text-secondary">workspace_premium</span>
                <span className="font-label-sm text-label-sm font-bold text-secondary">#{rankPosition}</span>
              </div>
              <div className="relative z-10">
                <div className="font-headline-md text-headline-md text-primary font-bold">{totalPoints}</div>
                <div className="font-label-sm text-label-sm text-on-surface-variant">Total Points</div>
              </div>
            </div>

            {/* Stat Card 4 */}
            <div className="snap-start min-w-[140px] flex-shrink-0 bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 p-3 flex flex-col justify-between h-[110px]">
              <div className="flex justify-between items-start w-full">
                <span className="material-symbols-outlined text-outline">local_fire_department</span>
              </div>
              <div>
                <div className="font-headline-md text-headline-md text-primary font-bold">{currentStreak}</div>
                <div className="font-label-sm text-label-sm text-on-surface-variant">Consecutive Streak</div>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Schedule */}
        <section>
          <div className="flex justify-between items-end mb-3">
            <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-bold">Upcoming Schedule</h3>
            <Link href="/member/meetings" className="font-label-sm text-label-sm text-primary hover:underline font-bold">View All</Link>
          </div>
          <div className="flex flex-col gap-2">
            {upcomingMeetings.length > 0 ? (
              upcomingMeetings.map((m, idx) => (
                <div key={m.id || idx} className="bg-surface-container-lowest rounded-lg p-3 border border-outline-variant/30 flex items-center justify-between shadow-[0px_2px_8px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-surface-container flex flex-col items-center justify-center text-primary">
                      <span className="font-label-sm text-label-sm font-bold">{new Date(m.startTime || m.meetingDate).getDate()}</span>
                      <span className="font-[9px] uppercase leading-none">{new Date(m.startTime || m.meetingDate).toLocaleString([], { month: 'short' })}</span>
                    </div>
                    <div>
                      <div className="font-label-md text-label-md text-primary font-bold">{m.title}</div>
                      <div className="font-body-md text-[13px] text-on-surface-variant">
                        {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {m.locationName}
                      </div>
                    </div>
                  </div>
                  <div className="font-label-sm text-label-sm bg-surface-variant text-on-surface-variant px-2 py-1 rounded font-bold">
                    +{m.pointWeight * 10 || 15} pts
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-surface-container-lowest rounded-lg p-4 border border-outline-variant/30 text-center text-on-surface-variant font-body-md text-body-md">
                No meetings scheduled yet.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
