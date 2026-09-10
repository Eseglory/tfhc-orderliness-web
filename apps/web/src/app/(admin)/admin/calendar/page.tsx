'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import { Badge, Button, PageHeader, Spinner } from '../../../../components/ui';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

interface CalEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  status: string;
  locationName: string;
  isCompulsory: boolean;
  visibility: string;
  eventType: { key: string; name: string; color: string | null; icon: string | null } | null;
  category: { name: string } | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CalendarPage() {
  const { loading: authLoading } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CalEvent | null>(null);

  const range = useMemo(() => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    from.setDate(from.getDate() - from.getDay() - 7);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    to.setDate(to.getDate() + (6 - to.getDay()) + 7);
    return { from, to };
  }, [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`;
      setEvents(await fetchApi<CalEvent[]>(`/meetings/calendar?${q}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the calendar.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.startTime));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [events]);

  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    const rows: Date[][] = [];
    for (let i = 0; i < 6; i++) rows.push(cells.slice(i * 7, i * 7 + 7));
    // drop a trailing all-other-month row
    return rows.filter((row) => !(row[0].getMonth() !== cursor.getMonth() && row[6].getMonth() !== cursor.getMonth() && row[0] > first));
  }, [cursor]);

  const agenda = useMemo(() => {
    const inMonth = events
      .filter((e) => {
        const d = new Date(e.startTime);
        return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const groups = new Map<string, CalEvent[]>();
    for (const e of inMonth) {
      const k = dayKey(new Date(e.startTime));
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    }
    return [...groups.entries()];
  }, [events, cursor]);

  const move = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const today = dayKey(new Date());

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <PageHeader
          title="Calendar"
          subtitle="Every event you can see, month by month."
          actions={
            <Link href="/admin/meetings">
              <Button variant="secondary">All events</Button>
            </Link>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="secondary" onClick={() => move(-1)} aria-label="Previous month">‹</Button>
            <Button variant="secondary" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button>
            <Button variant="secondary" onClick={() => move(1)} aria-label="Next month">›</Button>
            <h2 className="ml-2 text-lg font-bold text-on-surface">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </h2>
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-container p-1">
            {(['month', 'agenda'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-semibold capitalize ${view === v ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <p role="alert" className="rounded-xl bg-error-container p-4 text-sm text-on-error-container">{error}</p>
        ) : view === 'month' ? (
          <div className="overflow-x-auto">
            <div className="min-w-[44rem] overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
              <div className="grid grid-cols-7 border-b border-outline-variant/20 bg-surface-container-low/50 text-center text-xs font-bold uppercase text-on-surface-variant">
                {DOW.map((d) => (
                  <div key={d} className="py-2">{d}</div>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((d) => {
                    const k = dayKey(d);
                    const list = byDay.get(k) ?? [];
                    const otherMonth = d.getMonth() !== cursor.getMonth();
                    return (
                      <div key={k} className={`min-h-[7rem] border-b border-r border-outline-variant/15 p-1.5 ${otherMonth ? 'bg-surface-container-low/30' : ''}`}>
                        <div className={`mb-1 text-xs font-semibold ${k === today ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary' : otherMonth ? 'text-on-surface-variant/50' : 'text-on-surface-variant'}`}>
                          {d.getDate()}
                        </div>
                        <div className="space-y-1">
                          {list.slice(0, 3).map((e) => (
                            <button
                              key={e.id}
                              onClick={() => setSelected(e)}
                              className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium hover:opacity-80"
                              style={{ background: (e.eventType?.color ?? '#64748B') + '22', color: e.eventType?.color ?? '#334155' }}
                            >
                              <span className="truncate">
                                {!e.allDay && new Date(e.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} {e.title}
                              </span>
                            </button>
                          ))}
                          {list.length > 3 && <div className="px-1 text-[10px] text-on-surface-variant">+{list.length - 3} more</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {agenda.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant/40 p-8 text-center text-sm text-on-surface-variant">
                No events this month.
              </p>
            ) : (
              agenda.map(([day, list]) => (
                <div key={day}>
                  <h3 className="mb-2 text-sm font-bold text-on-surface">
                    {new Date(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <div className="space-y-2">
                    {list.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-3 text-left shadow-sm hover:border-outline-variant/50"
                      >
                        <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: e.eventType?.color ?? '#64748B' }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-on-surface">{e.title}</p>
                          <p className="text-xs text-on-surface-variant">
                            {e.allDay ? 'All day' : new Date(e.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {e.locationName}
                          </p>
                        </div>
                        {e.visibility === 'RESTRICTED' && <Badge tone="warning">Restricted</Badge>}
                        <Badge tone={e.status === 'ACTIVE' ? 'success' : e.status === 'CANCELLED' ? 'danger' : 'info'}>{e.status}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-surface-container-lowest p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-on-surface">{selected.title}</h3>
                <p className="text-sm text-on-surface-variant">{selected.eventType?.name ?? selected.category?.name}</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container">✕</button>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-on-surface-variant">When</dt><dd>{new Date(selected.startTime).toLocaleString()}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-on-surface-variant">Venue</dt><dd>{selected.locationName}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-on-surface-variant">Status</dt><dd>{selected.status}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-on-surface-variant">Attendance</dt><dd>{selected.isCompulsory ? 'Compulsory' : 'Optional'}</dd></div>
            </dl>
            <div className="mt-4 flex justify-end gap-2">
              <Link href={`/admin/live-meeting/${selected.id}`}>
                <Button variant="secondary">Open monitor</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
