'use client';

import { pwaRuntime } from '../../../../lib/pwa/runtime';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi, ApiError } from '../../../../lib/api';
import { ShareEvent } from '../../../../components/ShareEvent';
import { LogoIcon } from '../../../../components/LogoIcon';

type CalendarItem = {
  id: string;
  title: string;
  domainType: 'EVENT' | 'MEETING' | 'APPOINTMENT' | 'OPERATIONS';
  eventTypeKey?: string;
  eventType?: { key?: string } | null;
  startTime: string;
  endTime: string | null;
  attendanceOpenTime?: string | null;
  attendanceCloseTime?: string | null;
  locationName: string | null;
  status: string;
  meetingUrl?: string | null;
  description?: string | null;
  notes?: string | null;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
};

const SERVICE_EVENT_TYPE_KEYS = new Set(['SERVICE', 'SPECIAL_SERVICE']);

/** The member calendar's own Service/Event/Meeting taxonomy, derived from the
 *  API's domainType + event type key (there is no "SERVICE" domainType — a
 *  service is just an EVENT whose event type is one of the service kinds). */
function activityType(item: CalendarItem): 'SERVICE' | 'EVENT' | 'MEETING' {
  if (item.domainType === 'MEETING') return 'MEETING';
  const key = item.eventTypeKey || item.eventType?.key;
  if (key && SERVICE_EVENT_TYPE_KEYS.has(key)) return 'SERVICE';
  return 'EVENT';
}

function getLocalDayKey(dateInput: Date | string): string {
  const d = new Date(dateInput);
  if (!Number.isFinite(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function MemberCalendarPage() {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineStatus, setOfflineStatus] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'SERVICE' | 'EVENT' | 'MEETING'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59)).toISOString();

      let data: CalendarItem[];
      try {
        data = await fetchApi<CalendarItem[]>(`/calendar/feed?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        // Support the existing production calendar contract during phased API upgrades.
        data = await fetchApi<CalendarItem[]>(`/meetings/calendar?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`);
      }
      setItems(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load calendar activities.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const filteredItems = items.filter((item) => {
    if (filterType === 'ALL') return true;
    return activityType(item) === filterType;
  });

  // Group items by day
  const groupedByDay = filteredItems.reduce((acc, item) => {
    const dayKey = getLocalDayKey(item.startTime);
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(item);
    return acc;
  }, {} as Record<string, CalendarItem[]>);

  // Sort each day's items chronologically
  for (const dayKey of Object.keys(groupedByDay)) {
    groupedByDay[dayKey].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  const sortedDays = Object.keys(groupedByDay).filter((k) => k !== 'unknown').sort();

  return (
    <div className="bg-background text-on-background min-h-screen pb-32 font-body-md">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-4 h-16 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80 shrink-0"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-base sm:text-lg font-bold text-primary truncate">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            aria-label="Calendar month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-2.5 py-1.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
          />
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto space-y-4">

      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">offline_pin</span>
          <div>
            <p className="text-xs font-bold text-on-surface">Offline Schedule</p>
            <p className="text-[11px] text-on-surface-variant">Save this month&apos;s schedule for offline viewing without data.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              try {
                const store = await pwaRuntime();
                await store.save(
                  `schedule:${selectedMonth}`,
                  items.map(({ id, title, startTime, endTime, locationName, status }) => ({
                    id,
                    title,
                    startTime,
                    endTime,
                    locationName,
                    status,
                  })),
                  undefined,
                  'schedule',
                  86400000,
                );
                setOfflineStatus('Schedule saved for 24 hours. Open the offline workspace to view it without a connection.');
              } catch (error) {
                setOfflineStatus(error instanceof Error ? error.message : 'Could not save schedule.');
              }
            }}
            disabled={loading || !items.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            <span>Save for Offline</span>
          </button>

          <Link
            href="/member/offline"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low text-on-surface border border-outline-variant/30 text-xs font-semibold hover:border-primary transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">tune</span>
            <span>Offline Settings</span>
          </Link>
        </div>
      </div>
      {offlineStatus && (
        <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
          {offlineStatus}
        </p>
      )}
      {/* Filter Tabs */}
      <div className="flex gap-2 pb-4 overflow-x-auto mb-6">
        {(['ALL', 'SERVICE', 'EVENT', 'MEETING'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              filterType === type
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {type === 'ALL' ? 'All Activities' : type === 'SERVICE' ? 'Services' : type === 'EVENT' ? 'Events' : 'Meetings'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
          <p>Loading schedule…</p>
        </div>
      ) : error ? (
        <div className="bg-error/10 border border-error/20 p-6 rounded-2xl text-center">
          <p className="text-error font-medium">{error}</p>
          <button onClick={loadCalendar} className="mt-3 px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold">
            Retry
          </button>
        </div>
      ) : sortedDays.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8">
          <span className="material-symbols-outlined text-4xl text-outline-variant">event_available</span>
          <p className="font-bold text-base mt-2">No activities scheduled for this period.</p>
          <p className="text-xs text-on-surface-variant mt-1">Check back later or choose another month.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDays.map((dayKey) => {
            const [y, m, d] = dayKey.split('-').map(Number);
            const dayDate = new Date(y, m - 1, d);
            const dayItems = groupedByDay[dayKey];
            const isToday = getLocalDayKey(new Date()) === dayKey;

            return (
              <div key={dayKey} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${isToday ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}>
                    {dayDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  {isToday && <span className="text-xs font-bold text-primary">TODAY</span>}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {dayItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-5 shadow-sm hover:border-outline-variant/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              activityType(item) === 'SERVICE'
                                ? 'bg-indigo-500/10 text-indigo-700'
                                : activityType(item) === 'EVENT'
                                ? 'bg-amber-500/10 text-amber-700'
                                : 'bg-teal-500/10 text-teal-700'
                            }`}
                          >
                            {activityType(item)}
                          </span>
                          {(item.isRecurring || item.title.toLowerCase().includes('weekly')) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">autorenew</span>
                              <span>Recurring</span>
                            </span>
                          )}
                          {(item.locationName?.toLowerCase().includes('online') || item.locationName?.toLowerCase().includes('virtual') || item.locationName?.toLowerCase().includes('google meet') || item.meetingUrl) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">videocam</span>
                              <span>Online</span>
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${item.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                            {item.status}
                          </span>
                        </div>

                        <h3 className="font-bold text-base text-[#0b1c30] dark:text-white">{item.title}</h3>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {item.endTime && ` – ${new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          </span>

                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">
                              {item.meetingUrl || item.locationName?.toLowerCase().includes('online') ? 'videocam' : 'location_on'}
                            </span>
                            <span>{item.locationName || (item.meetingUrl ? 'Online Meeting' : 'Church Venue')}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {item.meetingUrl && (
                          <a
                            href={item.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">videocam</span>
                            <span>Join</span>
                          </a>
                        )}
                        <ShareEvent event={item} />
                        {(() => {
                          const now = new Date();
                          const start = new Date(item.startTime);
                          const openTime = item.attendanceOpenTime ? new Date(item.attendanceOpenTime) : new Date(start.getTime() - 30 * 60000);
                          const closeTime = item.attendanceCloseTime ? new Date(item.attendanceCloseTime) : (item.endTime ? new Date(item.endTime) : new Date(start.getTime() + 60 * 60000));
                          const cutoffTime = new Date(closeTime.getTime() + 60 * 60000);
                          const isEligible = now >= openTime && now <= cutoffTime && ['ACTIVE', 'SCHEDULED'].includes(item.status);
                          return isEligible ? (
                            <Link
                              href={`/member/check-in?meetingId=${item.id}`}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 active:scale-95"
                            >
                              <span className="material-symbols-outlined text-sm">location_on</span>
                              <span>Check In</span>
                            </Link>
                          ) : null;
                        })()}
                        <Link
                          href={`/member/submit-excuse?meetingId=${item.id}`}
                          className="px-3 py-2 bg-surface-container-low text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-container transition-colors"
                        >
                          Submit Excuse
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </main>
    </div>
  );
}
