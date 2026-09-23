'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';
import { buildAdvancedGoogleCalendarUrl, extractVirtualUrl } from '../../../../lib/calendar-integration';

export default function MemberMeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'Upcoming' | 'Past' | 'Mandatory'>('Upcoming');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    setLoading(true);
    fetchApi('/meetings')
      .then((data) => setMeetings(Array.isArray(data) ? data : []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const filteredMeetings = meetings
    .filter((m) => {
      const meetingTime = new Date(m.startTime || m.meetingDate);
      const isClosedOrCancelled = ['CLOSED', 'CANCELLED'].includes(m.status);
      const isPast =
        isClosedOrCancelled ||
        (m.status !== 'ACTIVE' &&
          ((m.endTime && new Date(m.endTime) < now) ||
            (m.attendanceCloseTime && new Date(m.attendanceCloseTime) < now) ||
            (!m.endTime && !m.attendanceCloseTime && new Date(meetingTime.getTime() + 2 * 3600000) < now)));

      if (filter === 'Upcoming' && isPast) return false;
      if (filter === 'Past' && !isPast) return false;
      if (filter === 'Mandatory' && (!m.isCompulsory || isPast)) return false;
      if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
      const catName = m.category?.name || m.categoryName;
      if (selectedCategory !== 'All' && catName !== selectedCategory) return false;
      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(a.startTime || a.meetingDate).getTime();
      const timeB = new Date(b.startTime || b.meetingDate).getTime();
      if (filter === 'Past') {
        return timeB - timeA; // Most recent past first
      }
      return timeA - timeB; // Chronological ascending for upcoming & mandatory
    });

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen pb-safe">
      <header className="bg-background flex justify-between items-center w-full px-4 h-16 sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80 shrink-0"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="min-w-0 font-headline-sm text-base sm:text-headline-sm font-bold text-primary truncate">Services</h1>
        </div>
        <Link href="/member/calendar" className="text-primary hover:opacity-80 transition-all font-semibold text-xs shrink-0 flex items-center gap-1 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/20">
          <span className="material-symbols-outlined text-sm">calendar_month</span>
          <span>Calendar</span>
        </Link>
      </header>

      <main className="px-edge-margin pb-32 max-w-3xl mx-auto pt-4">
        {/* Segmented Controls */}
        <div className="bg-surface-container-low p-1 rounded-xl flex">
          {(['Upcoming', 'Past', 'Mandatory'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 rounded-lg font-label-md text-xs py-2 text-center transition-all ${
                filter === tab
                  ? 'bg-surface-container-lowest text-primary shadow-sm font-bold'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-lg">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings and services…"
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-primary focus:outline-none placeholder:text-outline-variant text-on-surface"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Sunday Service', 'Midweek Service', 'Special Programme', 'Unit Meeting', 'Training'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary text-on-primary font-bold shadow-sm'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 hover:border-primary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Meeting List */}
        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
              <p className="text-sm">Loading services & meetings…</p>
            </div>
          ) : filteredMeetings.length > 0 ? (
            filteredMeetings.map((m) => {
              const d = new Date(m.startTime || m.meetingDate);
              const monthStr = Number.isFinite(d.getTime()) ? d.toLocaleString('default', { month: 'short' }) : '—';
              const dayStr = Number.isFinite(d.getTime()) ? d.getDate() : '—';

              return (
                <div
                  key={m.id}
                  className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-outline-variant/40 transition-colors"
                >
                  <div className="flex min-w-0 gap-4 items-center">
                    <div className="flex flex-col items-center justify-center bg-[#0b1c30]/5 dark:bg-slate-800 rounded-xl w-14 h-14 shrink-0 border border-[#0b1c30]/10 dark:border-slate-700">
                      <span className="font-label-sm text-[10px] text-[#0b1c30]/75 dark:text-slate-300 uppercase font-bold">{monthStr}</span>
                      <span className="font-headline-md text-xl text-[#0b1c30] dark:text-white font-black">{dayStr}</span>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/member/meetings/${m.id}`} className="min-w-0 hover:underline">
                          <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white truncate">{m.title}</h3>
                        </Link>
                        {(m.serviceScheduleId || m.serviceSchedule || m.title.toLowerCase().includes('weekly')) && (
                          <span className="shrink-0 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold text-[10px] px-1.5 py-0.5 rounded border border-purple-500/20 inline-flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[11px]">autorenew</span>
                            <span>{m.title.toLowerCase().includes('wednesday') ? 'Every Wednesday' : 'Recurring'}</span>
                          </span>
                        )}
                        {(m.locationName?.toLowerCase().includes('online') || m.locationName?.toLowerCase().includes('google meet') || m.locationName?.toLowerCase().includes('virtual') || extractVirtualUrl(m)) && (
                          <span className="shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20 inline-flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[11px]">videocam</span>
                            <span>Online</span>
                          </span>
                        )}
                        {m.isCompulsory && (
                          <span className="shrink-0 bg-amber-500/10 text-amber-700 font-bold text-[10px] px-1.5 py-0.5 rounded">
                            Mandatory
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">schedule</span>
                          <span>{Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">
                            {m.locationName?.toLowerCase().includes('online') || extractVirtualUrl(m) ? 'videocam' : 'location_on'}
                          </span>
                          <span>{m.locationName || 'Church Sanctuary'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
                    {(() => {
                      const virtualLink = extractVirtualUrl(m);
                      return virtualLink ? (
                        <a
                          href={virtualLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                          title="Join Online Google Meet"
                        >
                          <span className="material-symbols-outlined text-[14px]">videocam</span>
                          <span>Join Meet</span>
                        </a>
                      ) : null;
                    })()}
                    {(() => {
                      const isWed = m.title.toLowerCase().includes('wednesday');
                      const calUrl = buildAdvancedGoogleCalendarUrl({
                        id: m.id,
                        title: m.title,
                        description: m.description,
                        notes: m.notes,
                        startTime: m.startTime || m.meetingDate,
                        endTime: m.endTime,
                        locationName: m.locationName,
                        virtualMeetingUrl: extractVirtualUrl(m),
                        mode: m.locationName?.toLowerCase().includes('online') || extractVirtualUrl(m) ? 'VIRTUAL' : 'IN_PERSON',
                        recurrenceRule: isWed && (m.serviceScheduleId || m.title.toLowerCase().includes('weekly')) ? 'FREQ=WEEKLY;BYDAY=WE' : null,
                        timezone: 'Africa/Lagos',
                      });
                      return (
                        <a
                          href={calUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-surface-container-low text-primary hover:bg-surface-container rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-outline-variant/20"
                          title="Add to Google Calendar"
                        >
                          <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                          <span>Add to Cal</span>
                        </a>
                      );
                    })()}
                    {(() => {
                      const now = new Date();
                      const start = new Date(m.startTime || m.meetingDate);
                      const openTime = m.attendanceOpenTime ? new Date(m.attendanceOpenTime) : new Date(start.getTime() - 30 * 60000);
                      const closeTime = m.attendanceCloseTime ? new Date(m.attendanceCloseTime) : (m.endTime ? new Date(m.endTime) : new Date(start.getTime() + 60 * 60000));
                      const cutoffTime = new Date(closeTime.getTime() + 60 * 60000);
                      const isEligible = now >= openTime && now <= cutoffTime && ['ACTIVE', 'SCHEDULED'].includes(m.status);
                      return isEligible ? (
                        <Link
                          href={`/member/check-in?meetingId=${m.id}`}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[15px]">location_on</span>
                          <span>Check In</span>
                        </Link>
                      ) : null;
                    })()}
                    <Link
                      href={`/member/submit-excuse?meetingId=${m.id}`}
                      className="px-3 py-1.5 bg-surface-container-low text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-container transition-colors"
                    >
                      Excuse
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6">
              <span className="material-symbols-outlined text-4xl text-outline-variant">event_busy</span>
              <p className="font-bold text-sm mt-2">No meetings found.</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Try changing your filters or search term.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
