'use client';

import { pwaRuntime } from '../../../../lib/pwa/runtime';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
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
  locationName: string | null;
  status: string;
  meetingUrl?: string | null;
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
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineStatus, setOfflineStatus] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'SERVICE' | 'EVENT' | 'MEETING'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadCalendar = async () => {
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
  };

  useEffect(() => {
    loadCalendar();
  }, [selectedMonth]);

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
    <div className="bg-background text-on-background min-h-screen p-6 max-w-4xl mx-auto pb-32 font-body-md">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/10 pb-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container flex-shrink-0 p-1">
            <LogoIcon alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="font-headline-md text-2xl font-bold text-primary">Member Calendar</h1>
            <p className="text-on-surface-variant text-xs mt-0.5">Your schedule of upcoming services, meetings, and special events.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            aria-label="Calendar month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm font-semibold text-on-surface focus:outline-none focus:border-primary"
          />
        </div>
      </header>

      <div className="mb-4 space-y-2">
        <button className="underline min-h-11" onClick={async () => {
          try {
            const store = await pwaRuntime();
            await store.save(`schedule:${selectedMonth}`, items.map(({ id, title, startTime, endTime, locationName, status }) => ({ id, title, startTime, endTime, locationName, status })), undefined, 'schedule', 86400000);
            setOfflineStatus('Schedule saved for 24 hours. Open the offline workspace to view it without a connection.');
          } catch (error) { setOfflineStatus(error instanceof Error ? error.message : 'Could not save schedule.'); }
        }} disabled={loading || !items.length}>Save schedule for offline</button>
        <p role="status">{offlineStatus}</p>
        <a className="underline" href="/offline.html">Open offline workspace</a>
      </div>
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
                        <div className="flex items-center gap-2">
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
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${item.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                            {item.status}
                          </span>
                        </div>

                        <h3 className="font-bold text-base text-primary">{item.title}</h3>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {item.endTime && ` – ${new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          </span>

                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">location_on</span>
                            {item.locationName || (item.meetingUrl ? 'Online Meeting' : 'Church Venue')}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <ShareEvent event={item} />
                        {item.status === 'ACTIVE' && (
                          <Link
                            href={`/member/check-in?meetingId=${item.id}`}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                          >
                            Mark Attendance
                          </Link>
                        )}
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
    </div>
  );
}
