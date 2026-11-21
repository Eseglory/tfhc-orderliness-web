'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  RefreshCw,
  Eye,
  FileText,
  ExternalLink,
  Download,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileSpreadsheet,
  HardDrive,
  Archive,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { Badge, Button, EmptyState, Field, Modal, Spinner, inputClass, useToast } from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

interface Payment {
  id: string;
  reference: string;
  member: string;
  memberCode: string;
  purpose: string;
  amount: number;
  method: string;
  payerReference: string | null;
  description: string | null;
  paidOn: string;
  status: string;
  rejectionReason: string | null;
  duesPeriod: string | null;
  receiptUrl?: string | null;
  receiptName?: string | null;
  isReceiptArchived?: boolean;
  receiptArchivedReason?: string | null;
  receiptRetentionUntil?: string | null;
  receiptOriginalSize?: number | null;
  receiptOptimizedSize?: number | null;
  receiptCompressionRatio?: number | null;
  createdAt: string;
  amountPayable?: number | null;
  amountPaid?: number;
  claimedAmount?: number;
  confirmedAmount?: number;
  isAdjusted?: boolean;
  adminNote?: string | null;
  assignmentStatus?: string | null;
  assignmentBalance?: number | null;
  duesAssignmentId?: string | null;
}

interface StorageMetrics {
  totalStorageBytes: number;
  totalStorageFormatted: string;
  totalReceiptsCount: number;
  averageReceiptSizeBytes: number;
  averageReceiptSizeFormatted: string;
  monthlyDuesStorageBytes: number;
  monthlyDuesStorageFormatted: string;
  otherContributionsStorageBytes: number;
  otherContributionsStorageFormatted: string;
  totalOriginalBytes: number;
  totalSavedBytes: number;
  savingsPercentage: number;
  activeCount: number;
  approachingRetentionLimitCount: number;
  eligibleForRetentionActionCount: number;
  protectedCount: number;
  purgedCount: number;
  retentionPolicy: {
    retentionPeriodDays: number;
    retentionPeriodLabel: string;
    autoPurgeEnabled: boolean;
    status: string;
    description: string;
  };
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  CONFIRMED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  REFUNDED: 'neutral',
};

const ITEMS_PER_PAGE = 25;

export default function PaymentsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<string>('PENDING');
  const [purpose, setPurpose] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState<number | ''>('');
  const [maxAmount, setMaxAmount] = useState<number | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);
  const [reviewingPayment, setReviewingPayment] = useState<Payment | null>(null);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [storageCandidates, setStorageCandidates] = useState<any[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showConfirmCleanup, setShowConfirmCleanup] = useState(false);
  const [purging, setPurging] = useState(false);
  const manage = can('payments.manage');

  const loadStorageMetrics = async () => {
    setLoadingStorage(true);
    try {
      const data = await fetchApi<StorageMetrics>('/finance/receipts/storage');
      setStorageMetrics(data);
    } catch (e: any) {
      notify(e.message || 'Could not load storage metrics', 'error');
    } finally {
      setLoadingStorage(false);
    }
  };

  const loadCandidatesPreview = async () => {
    setLoadingCandidates(true);
    try {
      const res = await fetchApi<any>('/finance/receipts/retention/preview');
      setStorageCandidates(res.candidates || []);
    } catch (e: any) {
      notify(e.message || 'Could not load retention candidates', 'error');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleApplyCleanup = async () => {
    setPurging(true);
    try {
      const res = await fetchApi<any>('/finance/receipts/retention/cleanup', {
        method: 'POST',
        body: JSON.stringify({ dryRun: false }),
      });
      notify(res.message || 'Receipt cleanup completed successfully', 'success');
      setShowConfirmCleanup(false);
      loadStorageMetrics();
      loadCandidatesPreview();
      load();
    } catch (e: any) {
      notify(e.message || 'Cleanup operation failed', 'error');
    } finally {
      setPurging(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (purpose && purpose !== 'ALL') q.set('purpose', purpose);
      if (fromDate) q.set('from', fromDate);
      if (toDate) q.set('to', toDate);
      if (search.trim()) q.set('search', search.trim());

      const data = await fetchApi<Payment[]>(`/finance/payments?${q.toString()}`);
      setRows(data);
      setCurrentPage(1);
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have access to payments.'
          : 'Could not load payments.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, status, purpose, fromDate, toDate]);

  const confirm = async (p: Payment) => {
    setBusy(p.id);
    try {
      await fetchApi(`/finance/payments/${p.id}/confirm`, { method: 'POST', body: '{}' });
      notify(`Payment ${p.reference} confirmed & credited to member dues`, 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not confirm payment', 'error');
    } finally {
      setBusy('');
    }
  };

  // Client-side additional filtering (amount & local search fallback)
  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (minAmount !== '' && p.amount < Number(minAmount)) return false;
      if (maxAmount !== '' && p.amount > Number(maxAmount)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesMember = p.member.toLowerCase().includes(q);
        const matchesCode = p.memberCode.toLowerCase().includes(q);
        const matchesRef = p.reference.toLowerCase().includes(q);
        const matchesPayer = p.payerReference?.toLowerCase().includes(q) ?? false;
        const matchesDesc = p.description?.toLowerCase().includes(q) ?? false;
        const matchesPeriod = p.duesPeriod?.toLowerCase().includes(q) ?? false;
        if (!matchesMember && !matchesCode && !matchesRef && !matchesPayer && !matchesDesc && !matchesPeriod) {
          return false;
        }
      }
      return true;
    });
  }, [rows, minAmount, maxAmount, search]);

  // Pagination calculation
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const stats = useMemo(() => {
    const totalAmount = filtered.reduce((acc, p) => acc + p.amount, 0);
    const confirmedCount = filtered.filter((p) => p.status === 'CONFIRMED').length;
    const pendingCount = filtered.filter((p) => p.status === 'PENDING').length;
    const rejectedCount = filtered.filter((p) => p.status === 'REJECTED').length;
    return { totalAmount, confirmedCount, pendingCount, rejectedCount };
  }, [filtered]);

  const exportCsv = () => {
    const headers = [
      'Reference',
      'Member Code',
      'Member Name',
      'Payment Category',
      'Contribution Period / Drive',
      'Amount (NGN)',
      'Payment Method',
      'Payment Date',
      'Status',
      'Payer Narration',
      'Payment Note',
      'Rejection Reason',
    ];
    const dataRows = filtered.map((p) => [
      `"${p.reference}"`,
      `"${p.memberCode}"`,
      `"${p.member}"`,
      `"${p.purpose}"`,
      `"${p.duesPeriod || ''}"`,
      `"${p.amount}"`,
      `"${p.method}"`,
      `"${p.paidOn}"`,
      `"${p.status}"`,
      `"${p.payerReference || ''}"`,
      `"${p.description || ''}"`,
      `"${p.rejectionReason || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...dataRows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `TFHC_Payment_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/finance" className="hover:text-indigo-600 transition-colors">
                FINANCE
              </Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">PAYMENT LEDGER</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Member Payment Management
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Centralized verification ledger for monthly dues, Christmas party contributions, and bank receipts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setShowStorageModal(true);
                loadStorageMetrics();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 transition-all shadow-xs cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Storage & Retention</span>
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                Pending Verification
              </span>
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-amber-600">{stats.pendingCount}</p>
            <p className="text-[11px] text-slate-400">Declared receipts awaiting action</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
                Confirmed / Verified
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-emerald-600">{stats.confirmedCount}</p>
            <p className="text-[11px] text-slate-400">Credited to obligations</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                Rejected Submissions
              </span>
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-rose-600">{stats.rejectedCount}</p>
            <p className="text-[11px] text-slate-400">Invalid submissions rejected</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Total Value (In View)
              </span>
              <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              {naira(stats.totalAmount)}
            </p>
            <p className="text-[11px] text-slate-400">{filtered.length} transactions total</p>
          </div>
        </div>

        {/* Filter Controls Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Status Pills */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              {[
                { id: 'PENDING', label: 'Pending Review' },
                { id: 'CONFIRMED', label: 'Confirmed' },
                { id: 'REJECTED', label: 'Rejected' },
                { id: '', label: 'All Statuses' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    status === tab.id
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Purpose / Category Pills */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              {[
                { id: 'ALL', label: 'All Categories' },
                { id: 'MONTHLY_DUES', label: 'Monthly Dues' },
                { id: 'SPECIAL_CONTRIBUTION', label: 'Special Contributions' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPurpose(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    purpose === tab.id
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search & Date Range Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search member, code, ref, narration…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold shrink-0">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold shrink-0">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min ₦"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-1/2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <input
                type="number"
                placeholder="Max ₦"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-1/2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Payment Records Table */}
        {loading ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState
            title="Unavailable"
            description={error}
            action={
              <Button variant="secondary" onClick={load}>
                Retry
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No Payments Found"
            description={
              status === 'PENDING'
                ? 'No transactions currently awaiting verification.'
                : 'No payment records match the current filter criteria.'
            }
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Member</th>
                    <th className="px-3 py-3.5">Category &amp; Period</th>
                    <th className="px-3 py-3.5">Payable / Claimed</th>
                    <th className="px-3 py-3.5">Verified Amount</th>
                    <th className="px-3 py-3.5">Method</th>
                    <th className="px-3 py-3.5">Transaction Ref</th>
                    <th className="px-3 py-3.5">Receipt Proof</th>
                    <th className="px-3 py-3.5">Status</th>
                    {manage && <th className="px-4 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-medium">
                  {paginatedRows.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{p.member}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {p.memberCode} &bull; {new Date(p.paidOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </td>

                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            p.purpose === 'MONTHLY_DUES'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          }`}
                        >
                          {p.purpose === 'MONTHLY_DUES' ? 'Monthly Dues' : 'Special Contribution'}
                        </span>
                        {p.duesPeriod && (
                          <span className="text-[10px] text-slate-500 block mt-0.5 font-semibold">
                            {p.duesPeriod}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3.5">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {p.amountPayable ? naira(p.amountPayable) : 'N/A'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Claimed: <span className="font-bold text-slate-600 dark:text-slate-300">{naira(p.claimedAmount ?? p.amount)}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3.5">
                        {p.isAdjusted ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                {naira(p.confirmedAmount ?? p.amount)}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                Adjusted
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 line-through">
                              Claimed: {naira(p.claimedAmount ?? p.amount)}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-black text-slate-900 dark:text-white text-sm">
                              {naira(p.amount)}
                            </span>
                            {p.status === 'PENDING' && (
                              <span className="text-[10px] text-amber-600 font-semibold block">Awaiting Verification</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300">
                        {p.method.replace('_', ' ')}
                      </td>

                      <td className="px-3 py-3.5">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                          {p.reference}
                        </span>
                        {p.payerReference && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Payer: {p.payerReference}
                          </span>
                        )}
                        {p.description && (
                          <span className="text-[10px] text-slate-500 italic block mt-0.5 line-clamp-1">
                            Note: {p.description}
                          </span>
                        )}
                        {p.adminNote && (
                          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded mt-1 border border-amber-200 dark:border-amber-900/50 block">
                            Admin Note: {p.adminNote}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3.5">
                        {p.receiptUrl ? (
                          <button
                            onClick={() => setViewingReceipt(p)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer shadow-xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Proof</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No receipt</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5">
                        <Badge tone={TONE[p.status] ?? 'neutral'}>{p.status}</Badge>
                        {p.rejectionReason && (
                          <span className="text-[10px] text-rose-500 font-semibold block mt-0.5">
                            Reason: {p.rejectionReason}
                          </span>
                        )}
                      </td>

                      {manage && (
                        <td className="px-4 py-3.5 text-right">
                          {p.status === 'PENDING' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setRejecting(p)}
                                className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => setReviewingPayment(p)}
                                className="px-3 py-1 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-xs cursor-pointer"
                              >
                                Review &amp; Confirm
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} records
                </span>

                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-bold text-slate-700 dark:text-slate-300">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Receipt Viewer Modal */}
      {viewingReceipt && (
        <ReceiptModal
          payment={viewingReceipt}
          manage={manage}
          onClose={() => setViewingReceipt(null)}
          onConfirm={async () => {
            const p = viewingReceipt;
            setViewingReceipt(null);
            setReviewingPayment(p);
          }}
          onReject={() => {
            const p = viewingReceipt;
            setViewingReceipt(null);
            setRejecting(p);
          }}
        />
      )}

      {/* Payment Verification & Review Modal */}
      {reviewingPayment && (
        <PaymentReviewModal
          payment={reviewingPayment}
          onClose={() => setReviewingPayment(null)}
          onDone={() => {
            setReviewingPayment(null);
            load();
          }}
          onReject={() => {
            const p = reviewingPayment;
            setReviewingPayment(null);
            setRejecting(p);
          }}
        />
      )}

      {/* Rejection Modal */}
      {rejecting && (
        <RejectModal
          payment={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            notify('Payment rejected and reason recorded', 'success');
            load();
          }}
        />
      )}

      {/* Storage Management Modal */}
      {showStorageModal && (
        <StorageManagementModal
          metrics={storageMetrics}
          loading={loadingStorage}
          candidates={storageCandidates}
          loadingCandidates={loadingCandidates}
          onRefresh={loadStorageMetrics}
          onPreviewCandidates={loadCandidatesPreview}
          onApplyCleanup={() => setShowConfirmCleanup(true)}
          onClose={() => {
            setShowStorageModal(false);
            setStorageCandidates(null);
          }}
        />
      )}

      {/* Confirmation Modal for Cleanup */}
      {showConfirmCleanup && (
        <ConfirmCleanupModal
          purging={purging}
          candidatesCount={storageCandidates?.length ?? 0}
          onConfirm={handleApplyCleanup}
          onClose={() => setShowConfirmCleanup(false)}
        />
      )}
    </AdminLayoutShell>
  );
}

function ReceiptModal({
  payment,
  manage,
  onClose,
  onConfirm,
  onReject,
}: {
  payment: Payment;
  manage: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onReject: () => void;
}) {
  const isPdf =
    payment.receiptUrl?.startsWith('data:application/pdf') ||
    payment.receiptName?.toLowerCase().endsWith('.pdf');

  return (
    <Modal
      open
      onClose={onClose}
      title="Payment Receipt &amp; Proof of Payment"
      description={`${payment.member} (${payment.memberCode}) — ${naira(payment.amount)}`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {payment.receiptUrl && (
              <a
                href={payment.receiptUrl}
                download={payment.receiptName || `receipt-${payment.reference}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Receipt</span>
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {manage && payment.status === 'PENDING' && (
              <>
                <Button variant="danger" onClick={onReject}>
                  Reject
                </Button>
                <Button variant="primary" onClick={onConfirm}>
                  Review &amp; Confirm
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Payment Summary Box */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-950/70 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Purpose</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {payment.purpose === 'MONTHLY_DUES' ? 'Monthly Dues' : 'Special Contribution'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Period</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {payment.duesPeriod || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Payer Ref / Narration</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {payment.payerReference || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Reference</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {payment.reference}
            </span>
          </div>
        </div>

        {payment.description && (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            <strong>Member Payment Note:</strong> {payment.description}
          </div>
        )}

        {/* Retention Policy & Optimization Metadata Indicator */}
        {payment.receiptUrl && !payment.isReceiptArchived && (
          <div className="flex items-center justify-between text-[11px] bg-slate-100 dark:bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              {payment.receiptOptimizedSize
                ? `WebP Optimized (${Math.round((payment.receiptOptimizedSize / 1024))} KB • ${payment.receiptCompressionRatio || 0}% saved)`
                : 'Receipt Verified'}
            </span>
            <span className="text-slate-500 font-mono text-[10px]">
              {payment.receiptRetentionUntil
                ? `Retention: Active until ${new Date(payment.receiptRetentionUntil).toLocaleDateString()}`
                : '3-Month Retention Active'}
            </span>
          </div>
        )}

        {/* Receipt Image / PDF Preview or Archived Notice */}
        {payment.isReceiptArchived || !payment.receiptUrl ? (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center space-y-2">
            <Archive className="w-12 h-12 text-amber-600 dark:text-amber-400 mx-auto" />
            <h4 className="font-extrabold text-sm text-amber-900 dark:text-amber-200">
              Receipt File Safely Archived (3-Month Retention Policy)
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto leading-relaxed">
              In accordance with financial storage management, receipt image files for confirmed payments are purged after 90 days.
              The financial ledger record, transaction reference, amount paid, and verification audit trail remain permanently preserved.
            </p>
            {payment.receiptRetentionUntil && (
              <p className="text-[11px] text-amber-600 font-mono">
                Archived: {new Date(payment.receiptRetentionUntil).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-900/5 dark:bg-black/30 p-2 overflow-hidden flex flex-col items-center justify-center min-h-[260px] max-h-[460px]">
            {isPdf ? (
              <div className="text-center p-8 space-y-3">
                <FileText className="w-16 h-16 text-indigo-500 mx-auto" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">PDF Document Attached</p>
                <p className="text-xs text-slate-400">{payment.receiptName || 'receipt.pdf'}</p>
                <a
                  href={payment.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open PDF in New Tab</span>
                </a>
              </div>
            ) : (
              <img
                src={payment.receiptUrl}
                alt="Payment proof receipt"
                className="max-h-[420px] w-auto max-w-full rounded-xl object-contain shadow-md"
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RejectModal({
  payment,
  onClose,
  onDone,
}: {
  payment: Payment;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject Payment ${payment.reference}?`}
      description={`${payment.member} — ${naira(payment.amount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={async () => {
              if (!reason.trim()) {
                notify('Please provide a reason for rejecting this payment.', 'error');
                return;
              }
              setSaving(true);
              try {
                await fetchApi(`/finance/payments/${payment.id}/reject`, {
                  method: 'POST',
                  body: JSON.stringify({ reason: reason.trim() }),
                });
                onDone();
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Could not reject payment', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            Reject Payment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          State the reason for rejecting this payment. This explanation will be recorded in the audit trail and displayed directly to the member in their payment history.
        </p>
        <Field label="Administrative Rejection Reason" required>
          <input
            className={inputClass}
            placeholder="e.g. Transaction reference could not be verified on the bank statement"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            required
          />
        </Field>
      </div>
    </Modal>
  );
}

function PaymentReviewModal({
  payment,
  onClose,
  onDone,
  onReject,
}: {
  payment: Payment;
  onClose: () => void;
  onDone: () => void;
  onReject: () => void;
}) {
  const { notify } = useToast();
  const initialAmount = payment.claimedAmount ?? payment.amount;
  const [verifiedAmount, setVerifiedAmount] = useState<number>(initialAmount);
  const [adminNote, setAdminNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(true);

  const amountPayable = payment.amountPayable ?? null;
  const isAdjusted = verifiedAmount !== initialAmount;
  const outstandingAfter = amountPayable !== null ? Math.max(0, amountPayable - verifiedAmount) : null;

  const isPdf =
    payment.receiptUrl?.startsWith('data:application/pdf') ||
    payment.receiptName?.toLowerCase().endsWith('.pdf');

  const handleConfirm = async () => {
    if (verifiedAmount <= 0) {
      notify('Verified amount must be greater than zero.', 'error');
      return;
    }
    if (amountPayable !== null && verifiedAmount > amountPayable) {
      notify(`Verified amount cannot exceed the total payable of ${naira(amountPayable)}.`, 'error');
      return;
    }
    if (isAdjusted && !adminNote.trim()) {
      notify('Please provide an administrative note explaining the discrepancy to the member.', 'error');
      return;
    }

    setBusy(true);
    try {
      await fetchApi(`/finance/payments/${payment.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          confirmedAmount: Number(verifiedAmount),
          adminNote: adminNote.trim() || undefined,
        }),
      });
      notify(`Payment ${payment.reference} confirmed for ${naira(verifiedAmount)}`, 'success');
      onDone();
    } catch (e: any) {
      notify(e.message || 'Could not confirm payment', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Payment Verification & Approval Review"
      description={`Review member submission: ${payment.member} (${payment.memberCode})`}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="danger" onClick={onReject} disabled={busy}>
            Reject Submission
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={handleConfirm}
            >
              Confirm &amp; Credit {naira(verifiedAmount)}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* 4 Financial Metric Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contribution</span>
            <span className="font-extrabold text-slate-800 dark:text-slate-200 truncate block">
              {payment.duesPeriod || (payment.purpose === 'MONTHLY_DUES' ? 'Monthly Dues' : 'Special Contribution')}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Amount Payable</span>
            <span className="font-black text-slate-900 dark:text-white text-sm">
              {amountPayable ? naira(amountPayable) : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Claimed by Member</span>
            <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
              {naira(initialAmount)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Balance After Verification</span>
            <span className={`font-black text-sm ${outstandingAfter && outstandingAfter > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {outstandingAfter !== null ? (outstandingAfter > 0 ? `${naira(outstandingAfter)} (Partial)` : '₦0 (Fully Paid)') : 'N/A'}
            </span>
          </div>
        </div>

        {/* Receipt Proof Section with preview */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase text-slate-400 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              Uploaded Receipt Proof
            </span>
            <div className="flex items-center gap-2">
              {payment.receiptUrl && (
                <button
                  type="button"
                  onClick={() => setShowReceiptPreview(!showReceiptPreview)}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {showReceiptPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
              )}
              {payment.receiptUrl && (
                <a
                  href={payment.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Full Size
                </a>
              )}
            </div>
          </div>

          {showReceiptPreview && payment.receiptUrl && (
            <div className="rounded-lg bg-slate-950/5 dark:bg-black/30 p-2 flex items-center justify-center max-h-[240px] overflow-auto">
              {isPdf ? (
                <div className="text-center py-4">
                  <p className="font-bold text-slate-800 dark:text-slate-200">PDF Document Attached</p>
                  <a
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-indigo-600 font-bold hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View Receipt in new tab
                  </a>
                </div>
              ) : (
                <img
                  src={payment.receiptUrl}
                  alt="Receipt"
                  className="max-h-[220px] max-w-full object-contain rounded-md shadow-xs"
                />
              )}
            </div>
          )}

          {!payment.receiptUrl && (
            <p className="text-slate-400 italic text-[11px]">No receipt file attached by member.</p>
          )}

          {payment.description && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
              <strong>Member Narration:</strong> &quot;{payment.description}&quot;
            </p>
          )}
        </div>

        {/* Verified Amount Paid Input */}
        <div>
          <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
            Confirmed Amount Paid (₦)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₦</span>
            <input
              type="number"
              min={1}
              max={amountPayable ?? undefined}
              value={verifiedAmount}
              onChange={(e) => setVerifiedAmount(Number(e.target.value))}
              className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-sm font-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Enter the exact verified amount shown on the bank transfer receipt. Adjust if different from member&apos;s claim.
          </span>
        </div>

        {/* Discrepancy Alert */}
        {isAdjusted && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Amount Adjustment Discrepancy</span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
              Member claimed <strong>{naira(initialAmount)}</strong>, but you are verifying <strong>{naira(verifiedAmount)}</strong>.
              {outstandingAfter !== null && outstandingAfter > 0 ? (
                <> A remaining balance of <strong>{naira(outstandingAfter)}</strong> will stay outstanding.</>
              ) : null}
            </p>
          </div>
        )}

        {/* Administrative Note */}
        <div>
          <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
            Administrative Comment / Explanation {isAdjusted && <span className="text-rose-500 font-black">* (Required for adjustments)</span>}
          </label>
          <textarea
            rows={3}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder={
              isAdjusted
                ? `e.g. Your receipt confirms a payment of ${naira(verifiedAmount)}, not ${naira(initialAmount)}. Your remaining balance is ${outstandingAfter ? naira(outstandingAfter) : '₦0'}.`
                : 'Optional internal or member note regarding this verification...'
            }
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            This comment is recorded in the financial audit trail and visible to the member on their payment details.
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// STORAGE MANAGEMENT & RETENTION MODAL
// ----------------------------------------------------------------------------
function StorageManagementModal({
  metrics,
  loading,
  candidates,
  loadingCandidates,
  onRefresh,
  onPreviewCandidates,
  onApplyCleanup,
  onClose,
}: {
  metrics: StorageMetrics | null;
  loading: boolean;
  candidates: any[] | null;
  loadingCandidates: boolean;
  onRefresh: () => void;
  onPreviewCandidates: () => void;
  onApplyCleanup: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Receipt Storage Management & Retention Policy"
      description="Storage efficiency, automatic WebP optimization metrics, and 3-month retention controls."
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" onClick={onRefresh} loading={loading} className="gap-1.5 font-bold text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Stats</span>
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {loading || !metrics ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-8 h-8" />
          </div>
        ) : (
          <>
            {/* 4 Storage KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900">
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                  Total Storage
                </span>
                <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
                  {metrics.totalStorageFormatted}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {metrics.totalReceiptsCount} receipt files
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Average Receipt Size
                </span>
                <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
                  {metrics.averageReceiptSizeFormatted}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold block">
                  WebP optimized
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Compression Savings
                </span>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {metrics.savingsPercentage}% Saved
                </span>
                <span className="text-[10px] text-slate-500 block">
                  from raw camera sizes
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900">
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                  Retention Policy
                </span>
                <span className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1 block">
                  3 Months
                </span>
                <span className="text-[10px] text-slate-500 block">
                  90-day retention
                </span>
              </div>
            </div>

            {/* Storage Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  Monthly Dues Receipts Storage
                </h4>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {metrics.monthlyDuesStorageFormatted}
                  </span>
                  <span className="text-xs text-slate-400">Regular recurring obligations</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Other Contributions Storage
                </h4>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {metrics.otherContributionsStorageFormatted}
                  </span>
                  <span className="text-xs text-slate-400">Christmas party &amp; projects</span>
                </div>
              </div>
            </div>

            {/* Retention Status & Policy Controls */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                    Retention Status Breakdown
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Receipt file lifecycle management under the 3-month retention policy.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  {metrics.retentionPolicy.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-bold">Active (&lt;60 days)</span>
                  <span className="text-base font-extrabold text-slate-800 dark:text-slate-200">
                    {metrics.activeCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <span className="text-[10px] text-amber-600 font-bold block">Expiring Soon (60-90d)</span>
                  <span className="text-base font-extrabold text-amber-700 dark:text-amber-300">
                    {metrics.approachingRetentionLimitCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                  <span className="text-[10px] text-purple-600 font-bold block">Eligible (&gt;90d Confirmed)</span>
                  <span className="text-base font-extrabold text-purple-700 dark:text-purple-300">
                    {metrics.eligibleForRetentionActionCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] text-emerald-600 font-bold block">Protected (Audit Lock)</span>
                  <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                    {metrics.protectedCount}
                  </span>
                </div>
              </div>

              {/* Audit Protection Notice */}
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-blue-600" />
                  Audit &amp; Compliance Guarantee
                </p>
                <p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
                  Pending or rejected payments are automatically locked and protected from deletion.
                  When confirmed receipt images are archived, all financial transaction amounts, dates, member records, and audit logs are retained permanently.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={onPreviewCandidates}
                  loading={loadingCandidates}
                  className="gap-1.5 font-bold text-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview Eligible Receipts (Dry Run)</span>
                </Button>

                {metrics.eligibleForRetentionActionCount > 0 && (
                  <Button
                    variant="danger"
                    onClick={onApplyCleanup}
                    className="gap-1.5 font-bold text-xs"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Run Safe Cleanup ({metrics.eligibleForRetentionActionCount} files)</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Dry Run Candidates List */}
            {candidates !== null && (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                    Eligible Candidate Receipts ({candidates.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Dry Run — No files modified
                  </span>
                </div>

                {candidates.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">
                    No confirmed receipts currently exceed the 90-day retention threshold.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {candidates.map((c) => (
                      <div key={c.id} className="py-2 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">
                            {c.member} ({c.memberCode})
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {c.reference} &bull; {c.period} &bull; {naira(c.amount)}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold text-purple-600 block">
                            {c.ageDays} days old
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Uploaded: {new Date(c.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// CONFIRM CLEANUP MODAL
// ----------------------------------------------------------------------------
function ConfirmCleanupModal({
  purging,
  candidatesCount,
  onConfirm,
  onClose,
}: {
  purging: boolean;
  candidatesCount: number;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm Receipt Retention Cleanup?"
      description="Purge physical image files for confirmed receipts past 90 days."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={purging}>
            Cancel
          </Button>
          <Button variant="danger" loading={purging} onClick={onConfirm} className="gap-1.5 font-bold">
            <Archive className="w-4 h-4" />
            <span>Confirm &amp; Purge Expired Files</span>
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
        <p className="font-bold text-slate-900 dark:text-white">
          You are about to execute the 3-month retention cleanup for eligible settled receipts.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-slate-500 dark:text-slate-400">
          <li>Only confirmed receipts older than 90 days will have their image file removed.</li>
          <li>All transaction records, reference numbers, amounts, dates, and verification approvals remain permanently preserved.</li>
          <li>Pending, rejected, or disputed payments are strictly protected and will not be touched.</li>
          <li>A complete audit record of this action will be written to the system audit trail.</li>
        </ul>
      </div>
    </Modal>
  );
}

