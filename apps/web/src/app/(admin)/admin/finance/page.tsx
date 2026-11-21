'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Receipt,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  ChevronRight,
  RefreshCw,
  Landmark,
  FileText,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { Badge, Button, EmptyState, Spinner } from '../../../../components/ui';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

interface DashboardData {
  summary: {
    totalMonthlyDuesCollected: number;
    outstandingMonthlyDues: number;
    totalMonthlyDuesExpected: number;
    totalOtherContributionsCollected: number;
    totalOtherContributionsExpected: number;
    outstandingOtherContributions: number;
    pendingPaymentsCount: number;
    pendingPaymentsAmount: number;
    totalVerifiedCollections: number;
  };
  monthlyDues: {
    collected: number;
    outstanding: number;
    expected: number;
    collectionRate: number;
    currentPeriod: null | {
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
  };
  otherContributions: {
    collected: number;
    outstanding: number;
    expected: number;
    campaignsCount: number;
    campaigns: {
      id: string;
      label: string;
      description: string | null;
      defaultAmount: number;
      dueDate: string;
      status: string;
      showAsAlert: boolean;
      paymentAccount: { bankName: string; accountName: string; accountNumber: string } | null;
      expected: number;
      collected: number;
      outstanding: number;
      collectionRate: number;
      membersCount: number;
      paidCount: number;
    }[];
  };
  recentActivity: {
    id: string;
    reference: string;
    member: string;
    memberCode: string;
    purpose: string;
    amount: number;
    method: string;
    paidOn: string;
    status: string;
    duesPeriod: string | null;
    description: string | null;
    receiptUrl: string | null;
    receiptName: string | null;
    createdAt: string;
  }[];
  expenses: {
    pendingApproval: number;
    approvedUnpaid: number;
    paidThisMonth: number;
    ytdApprovedOrPaid: number;
    byCategory: { category: string; amount: number }[];
  };
}

export default function FinanceDashboardPage() {
  const { loading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchApi<DashboardData>('/finance/dashboard'));
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have access to finance.'
          : 'Could not load the finance dashboard.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TREASURY &amp; STEWARDSHIP</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">FINANCIAL OVERVIEW</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Finance &amp; Treasury Overview
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clear separation between recurring monthly dues, special contributions, and verified member payments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/finance/dues"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5 text-white" />
              Monthly Dues Suite
            </Link>
            <Link
              href="/admin/finance/payments"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
              Payment Management
            </Link>
            <Link
              href="/admin/finance/reports"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              Financial Reports
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
          <div className="flex justify-center py-24 text-slate-400">
            <Spinner />
          </div>
        ) : error || !data ? (
          <EmptyState
            title="Unavailable"
            description={error}
            action={
              <Button variant="secondary" onClick={load}>
                Retry
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {/* 5 Well-Organized Executive Summary KPI Cards (Section 4 Requirements) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {/* Card 1: Total Monthly Dues Collected */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Monthly Dues Collected
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {naira(data.summary.totalMonthlyDuesCollected)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {data.monthlyDues.collectionRate}% of assessed dues
                </p>
              </div>

              {/* Card 2: Outstanding Monthly Dues */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                    Outstanding Monthly Dues
                  </span>
                  <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-xl font-black text-rose-600">
                  {naira(data.summary.outstandingMonthlyDues)}
                </p>
                <p className="text-[11px] text-slate-500">Uncollected recurring arrears</p>
              </div>

              {/* Card 3: Total Other Contributions Collected */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">
                    Other Contributions
                  </span>
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {naira(data.summary.totalOtherContributionsCollected)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {data.otherContributions.campaignsCount} special drive(s)
                </p>
              </div>

              {/* Card 4: Pending Payment Verification */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                    Pending Verification
                  </span>
                  <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-xl font-black text-amber-600">
                  {data.summary.pendingPaymentsCount}
                </p>
                <p className="text-[11px] text-slate-500">
                  {naira(data.summary.pendingPaymentsAmount)} awaiting review
                </p>
              </div>

              {/* Card 5: Total Verified Collections */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Total Verified Collections
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-xl font-black text-emerald-600">
                  {naira(data.summary.totalVerifiedCollections)}
                </p>
                <p className="text-[11px] text-slate-500">All confirmed treasury receipts</p>
              </div>
            </div>

            {/* -------------------------------------------------------------- */}
            {/* SECTION 1: MONTHLY DUES (Distinct from other contributions)    */}
            {/* -------------------------------------------------------------- */}
            <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                      Recurring Monthly Membership Dues
                    </h2>
                    <p className="text-xs text-slate-400">
                      Regular monthly member obligations: Executive (₦2,500/mo) &bull; Regular (₦2,000/mo)
                    </p>
                  </div>
                </div>

                <Link
                  href="/admin/finance/dues"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 font-bold text-xs self-start sm:self-auto"
                >
                  <span>Manage Dues Suite &amp; Roster</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {data.monthlyDues.currentPeriod ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Active Period</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
                      {data.monthlyDues.currentPeriod.period}
                    </span>
                    <span className="text-[10px] text-slate-400">{data.monthlyDues.currentPeriod.members} members</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Period Expected</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
                      {naira(data.monthlyDues.currentPeriod.expected)}
                    </span>
                    <span className="text-[10px] text-slate-400">{data.monthlyDues.currentPeriod.paid} paid</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase block">
                      Period Collected
                    </span>
                    <span className="text-sm font-black text-emerald-600 mt-0.5 block">
                      {naira(data.monthlyDues.currentPeriod.collected)}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold">
                      {data.monthlyDues.currentPeriod.collectionRate}% collected
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase block">
                      Period Outstanding
                    </span>
                    <span className="text-sm font-black text-rose-600 mt-0.5 block">
                      {naira(data.monthlyDues.currentPeriod.outstanding)}
                    </span>
                    <span className="text-[10px] text-rose-700 font-bold">
                      {data.monthlyDues.currentPeriod.overdue} in arrears
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No active monthly dues period configured.
                </div>
              )}
            </section>

            {/* -------------------------------------------------------------- */}
            {/* SECTION 2: OTHER CONTRIBUTIONS (Christmas Party & Special Drives) */}
            {/* -------------------------------------------------------------- */}
            <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                      Other Contributions &amp; Special Drives
                    </h2>
                    <p className="text-xs text-slate-400">
                      Christmas Party (₦20,000/member), fundraising, and approved one-off campaigns with dedicated receiving accounts.
                    </p>
                  </div>
                </div>

                <Link
                  href="/admin/finance/dues"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 font-bold text-xs self-start sm:self-auto"
                >
                  <span>Create / Manage Special Drives</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {data.otherContributions.campaigns.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.otherContributions.campaigns.map((c) => (
                    <article
                      key={c.id}
                      className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/80 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                              {c.label}
                            </h3>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                              {naira(c.defaultAmount)} / member
                            </span>
                          </div>
                          {c.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.description}</p>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-slate-500">
                          Due:{' '}
                          {new Date(c.dueDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-semibold">Expected</span>
                          <span className="font-black text-slate-900 dark:text-white">{naira(c.expected)}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-semibold">Collected</span>
                          <span className="font-black text-emerald-600">{naira(c.collected)}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-semibold">Outstanding</span>
                          <span className="font-black text-rose-600">{naira(c.outstanding)}</span>
                        </div>
                      </div>

                      {c.paymentAccount && (
                        <div className="text-[11px] text-slate-500 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                          <span>
                            Account: <strong>{c.paymentAccount.bankName}</strong> &bull; {c.paymentAccount.accountName}
                          </span>
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {c.paymentAccount.accountNumber}
                          </span>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No special contribution campaigns active.
                </div>
              )}
            </section>

            {/* -------------------------------------------------------------- */}
            {/* SECTION 3: RECENT PAYMENT ACTIVITY                             */}
            {/* -------------------------------------------------------------- */}
            <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                      Recent Payment Activity &amp; Submissions
                    </h2>
                    <p className="text-xs text-slate-400">
                      Latest incoming bank transfers and member-declared contributions.
                    </p>
                  </div>
                </div>

                <Link
                  href="/admin/finance/payments"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs self-start sm:self-auto"
                >
                  <span>Review All Payments &amp; Verify Receipts</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {data.recentActivity && data.recentActivity.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2.5">Member</th>
                        <th className="px-3 py-2.5">Category</th>
                        <th className="px-3 py-2.5">Amount</th>
                        <th className="px-3 py-2.5">Method</th>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-center">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.recentActivity.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">
                            {p.member}
                            <span className="font-mono text-[10px] text-slate-400 block">{p.memberCode}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                p.purpose === 'MONTHLY_DUES'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                              }`}
                            >
                              {p.purpose === 'MONTHLY_DUES' ? 'Monthly Dues' : 'Special Contribution'}
                            </span>
                            {p.duesPeriod && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">{p.duesPeriod}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-black text-slate-900 dark:text-white">
                            {naira(p.amount)}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-500">
                            {p.method.replace('_', ' ')}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {new Date(p.paidOn).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                p.status === 'CONFIRMED'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : p.status === 'PENDING'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {p.receiptUrl ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600">
                                <Receipt className="w-3.5 h-3.5" />
                                <span>Attached</span>
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No payment records found.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
