'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../../components/Navbar';
import { Button, EmptyState, PageHeader, Spinner } from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

interface Dashboard {
  kpis: {
    total: number;
    upcoming: number;
    thisWeek: number;
    thisMonth: number;
    cancelled: number;
    recurringSeries: number;
    restricted: number;
  };
  eventsByType: { type: string; color: string | null; count: number }[];
  eventsByMonth: { month: string; count: number; avgAttendanceRate: number | null }[];
}

const MONTH_LABEL = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

export default function EventsDashboardPage() {
  const { loading: authLoading } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchApi<Dashboard>('/meetings/dashboard'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to the event dashboard.' : 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const kpi = (label: string, value: number, tone = 'text-on-surface') => (
    <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );

  const maxType = Math.max(1, ...(data?.eventsByType.map((t) => t.count) ?? [1]));
  const maxMonth = Math.max(1, ...(data?.eventsByMonth.map((m) => m.count) ?? [1]));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin/meetings" className="hover:text-primary">Events</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Dashboard</span>
        </nav>
        <PageHeader
          title="Event Dashboard"
          subtitle="A read on the church's event activity."
          actions={
            <Link href="/admin/calendar">
              <Button variant="secondary">Calendar</Button>
            </Link>
          }
        />

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error || !data ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kpi('Upcoming', data.kpis.upcoming, 'text-primary')}
              {kpi('This week', data.kpis.thisWeek)}
              {kpi('This month', data.kpis.thisMonth)}
              {kpi('Recurring series', data.kpis.recurringSeries)}
              {kpi('Total events', data.kpis.total)}
              {kpi('Restricted', data.kpis.restricted)}
              {kpi('Cancelled', data.kpis.cancelled, data.kpis.cancelled ? 'text-error' : 'text-on-surface')}
            </div>

            <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-on-surface">Events by type</h2>
              {data.eventsByType.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No events yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.eventsByType.map((t) => (
                    <div key={t.type} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-sm text-on-surface-variant" title={t.type}>{t.type}</span>
                      <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-container">
                        <div
                          className="flex h-full items-center justify-end rounded-md px-2 text-xs font-bold text-white"
                          style={{ width: `${Math.max(8, (t.count / maxType) * 100)}%`, background: t.color ?? '#64748B' }}
                        >
                          {t.count}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
              <h2 className="mb-1 text-base font-bold text-on-surface">Completed events by month</h2>
              <p className="mb-4 text-xs text-on-surface-variant">Bar height = events held · number = average attendance rate</p>
              {data.eventsByMonth.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No completed events in the last year.</p>
              ) : (
                <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ height: 180 }}>
                  {data.eventsByMonth.map((m) => (
                    <div key={m.month} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold text-on-surface-variant">
                        {m.avgAttendanceRate != null ? `${m.avgAttendanceRate}%` : ''}
                      </span>
                      <div
                        className="w-full rounded-t-md bg-inverse-surface"
                        style={{ height: `${Math.max(6, (m.count / maxMonth) * 130)}px` }}
                        title={`${m.count} events`}
                      />
                      <span className="text-[10px] text-on-surface-variant">{MONTH_LABEL(m.month)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
