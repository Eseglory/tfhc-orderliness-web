'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import { Badge, Button, EmptyState, PageHeader, Spinner } from '../../../../components/ui';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

interface Dashboard {
  expenses: {
    pendingApproval: number;
    approvedUnpaid: number;
    paidThisMonth: number;
    ytdApprovedOrPaid: number;
    byCategory: { category: string; amount: number }[];
  };
  payments: { pending: number };
  dues: null | {
    period: string;
    members: number;
    expected: number;
    collected: number;
    outstanding: number;
    collectionRate: number;
    paid: number;
    overdue: number;
    exempt: number;
  };
  duesTrend: { label: string; expected: number; collected: number }[];
}

export default function FinanceDashboardPage() {
  const { loading: authLoading } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchApi<Dashboard>('/finance/dashboard'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to finance.' : 'Could not load the finance dashboard.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const kpi = (label: string, value: string, sub?: string, tone = 'text-on-surface') => (
    <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );

  const maxTrend = Math.max(1, ...(data?.duesTrend.flatMap((t) => [t.expected, t.collected]) ?? [1]));
  const maxCat = Math.max(1, ...(data?.expenses.byCategory.map((c) => c.amount) ?? [1]));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          title="Finance"
          subtitle="Dues collection, payments and expenditure at a glance."
          actions={
            <div className="flex gap-2">
              <Link href="/admin/finance/dues"><Button variant="secondary">Dues</Button></Link>
              <Link href="/admin/finance/expenses"><Button variant="secondary">Expenses</Button></Link>
            </div>
          }
        />

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error || !data ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : (
          <>
            {data.dues ? (
              <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-on-surface">Dues — {data.dues.period}</h2>
                  <Link href="/admin/finance/dues" className="text-xs font-semibold text-primary hover:underline">Open period →</Link>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {kpi('Expected', naira(data.dues.expected))}
                  {kpi('Collected', naira(data.dues.collected), `${data.dues.collectionRate}% collection rate`, 'text-tertiary')}
                  {kpi('Outstanding', naira(data.dues.outstanding), `${data.dues.overdue} overdue`, data.dues.outstanding ? 'text-error' : 'text-on-surface')}
                  {kpi('Members', String(data.dues.members), `${data.dues.paid} fully paid · ${data.dues.exempt} exempt`)}
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-container">
                  <div className="h-full rounded-full bg-tertiary" style={{ width: `${data.dues.collectionRate}%` }} />
                </div>
              </section>
            ) : (
              <EmptyState title="No dues period yet" description="Create a monthly dues period to start tracking collection." action={<Link href="/admin/finance/dues"><Button>Set up dues</Button></Link>} />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {kpi('Expenses awaiting approval', String(data.expenses.pendingApproval), undefined, data.expenses.pendingApproval ? 'text-secondary' : 'text-on-surface')}
              {kpi('Approved, not yet paid', String(data.expenses.approvedUnpaid))}
              {kpi('Expenses paid this month', naira(data.expenses.paidThisMonth))}
              {kpi('Payments awaiting confirmation', String(data.payments.pending), undefined, data.payments.pending ? 'text-secondary' : 'text-on-surface')}
            </div>

            {data.duesTrend.length > 0 && (
              <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
                <h2 className="mb-4 text-base font-bold text-on-surface">Dues collection trend</h2>
                <div className="space-y-3">
                  {data.duesTrend.map((t) => (
                    <div key={t.label} className="space-y-1">
                      <div className="flex justify-between text-xs text-on-surface-variant">
                        <span>{t.label}</span>
                        <span>{naira(t.collected)} / {naira(t.expected)}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-surface-container">
                        <div className="h-full rounded-full bg-inverse-surface/30" style={{ width: `${(t.expected / maxTrend) * 100}%` }}>
                          <div className="h-full rounded-full bg-tertiary" style={{ width: `${t.expected ? (t.collected / t.expected) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.expenses.byCategory.length > 0 && (
              <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
                <h2 className="mb-4 text-base font-bold text-on-surface">Expenditure by category (year to date)</h2>
                <div className="space-y-2.5">
                  {data.expenses.byCategory.map((c) => (
                    <div key={c.category} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 truncate text-sm text-on-surface-variant">{c.category}</span>
                      <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-container">
                        <div className="flex h-full items-center justify-end rounded-md bg-inverse-surface px-2 text-xs font-bold text-white" style={{ width: `${Math.max(12, (c.amount / maxCat) * 100)}%` }}>
                          {naira(c.amount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
