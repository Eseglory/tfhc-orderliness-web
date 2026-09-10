'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  ChevronRight,
  RefreshCw,
  Landmark,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { Badge, Button, EmptyState, Spinner } from '../../../../components/ui';
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
  }, [authLoading]);

  const maxTrend = Math.max(1, ...(data?.duesTrend.flatMap((t) => [t.expected, t.collected]) ?? [1]));
  const maxCat = Math.max(1, ...(data?.expenses.byCategory.map((c) => c.amount) ?? [1]));

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TREASURY &amp; STEWARDSHIP</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">FINANCIAL INTELLIGENCE</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Finance &amp; Treasury Overview
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time monitoring of monthly dues, disbursements, member payments, and budget health.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/finance/dues"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
              Dues Periods
            </Link>
            <Link
              href="/admin/finance/expenses"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <Receipt className="w-3.5 h-3.5 text-amber-500" />
              Expenses
            </Link>
            <Link
              href="/admin/finance/payments"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
              Payments
            </Link>
            <Link
              href="/admin/finance/accounts"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <Landmark className="w-3.5 h-3.5 text-slate-400" />
              Bank Accounts
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error || !data ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : (
          <>
            {/* 4 Metric KPI Cards - Swipeable on mobile */}
            <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-1 sm:pb-0">
              <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    DUES COLLECTED
                  </span>
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {data.dues ? naira(data.dues.collected) : '₦0'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {data.dues ? `${data.dues.collectionRate}% collection rate` : 'No active period'}
                </div>
              </div>

              <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    OUTSTANDING DUES
                  </span>
                  <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {data.dues ? naira(data.dues.outstanding) : '₦0'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {data.dues ? `${data.dues.overdue} overdue members` : '0 overdue'}
                </div>
              </div>

              <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    EXPENSES THIS MONTH
                  </span>
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {naira(data.expenses.paidThisMonth)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  <span>YTD: {naira(data.expenses.ytdApprovedOrPaid)}</span>
                </div>
              </div>

              <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    PENDING APPROVALS
                  </span>
                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {data.expenses.pendingApproval}
                  </span>
                  <span className="text-xs font-bold text-slate-400">expenses</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  <span>{data.payments.pending} payments awaiting review</span>
                </div>
              </div>
            </div>

            {/* Current Dues Period Card */}
            {data.dues ? (
              <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Active Dues Period — {data.dues.period}
                    </h2>
                  </div>
                  <Link
                    href="/admin/finance/dues"
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Manage Roster <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Expected</p>
                    <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{naira(data.dues.expected)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Collected</p>
                    <p className="mt-1 text-lg font-black text-emerald-600">{naira(data.dues.collected)}</p>
                    <p className="text-[10px] text-slate-400">{data.dues.collectionRate}% target reached</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Outstanding</p>
                    <p className={`mt-1 text-lg font-black ${data.dues.outstanding > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                      {naira(data.dues.outstanding)}
                    </p>
                    <p className="text-[10px] text-slate-400">{data.dues.overdue} overdue</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Congregants</p>
                    <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{data.dues.members}</p>
                    <p className="text-[10px] text-slate-400">{data.dues.paid} paid · {data.dues.exempt} exempt</p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>Collection Progress</span>
                    <span>{data.dues.collectionRate}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, data.dues.collectionRate)}%` }}
                    />
                  </div>
                </div>
              </section>
            ) : (
              <EmptyState
                title="No Active Dues Period"
                description="Set up a monthly dues period to start tracking collections and member assignments."
                action={
                  <Link href="/admin/finance/dues">
                    <Button>Set Up Dues</Button>
                  </Link>
                }
              />
            )}

            {/* Trends and Categories Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Dues Trend */}
              {data.duesTrend.length > 0 && (
                <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Dues Collection Trend
                    </h2>
                  </div>
                  <div className="space-y-4 pt-2">
                    {data.duesTrend.map((t) => (
                      <div key={t.label} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-700 dark:text-slate-300">{t.label}</span>
                          <span className="text-slate-500">
                            {naira(t.collected)} / <span className="text-slate-400">{naira(t.expected)}</span>
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${t.expected ? Math.min(100, (t.collected / t.expected) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Expense by Category */}
              {data.expenses.byCategory.length > 0 && (
                <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-amber-500" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Expenditure by Category (YTD)
                    </h2>
                  </div>
                  <div className="space-y-3 pt-2">
                    {data.expenses.byCategory.map((c) => (
                      <div key={c.category} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{c.category}</span>
                          <span className="text-slate-900 dark:text-white font-extrabold">{naira(c.amount)}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.max(8, (c.amount / maxCat) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayoutShell>
  );
}

