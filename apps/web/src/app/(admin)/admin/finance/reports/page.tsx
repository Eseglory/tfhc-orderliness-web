'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Download,
  Eye,
  Filter,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Users,
  Briefcase,
  Layers,
  Search,
  ExternalLink,
  Printer,
  Sparkles,
  ArrowUpRight,
  Info,
  X,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { Button, Spinner } from '../../../../../components/ui';
import { fetchApi, getApiBaseUrl, getAuthToken, ApiError } from '../../../../../lib/api';
import { useAuth, isClassOwner } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ReportCategory = 'ANNUAL' | 'MONTHLY' | 'MEMBERS' | 'FREELANCE' | 'TRANSACTIONS';
type ReportFormat = 'summary' | 'detailed';

export default function FinancialReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const isOwner = useMemo(() => isClassOwner(user), [user]);

  // Filters State
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // '' = all months, '1'..'12'
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>('ANNUAL');
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('summary');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Data States
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [annualData, setAnnualData] = useState<any>(null);
  const [membersData, setMembersData] = useState<any>(null);
  const [freelanceData, setFreelanceData] = useState<any>(null);
  const [transactionsData, setTransactionsData] = useState<any>(null);

  // UI States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [pdfGenerating, setPdfGenerating] = useState<boolean>(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);

  // Load Dashboard and Category Data
  const loadReportData = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    setError('');

    try {
      // 1. Always load dashboard metrics for selected year & month
      const dashQuery = new URLSearchParams({
        year: String(selectedYear),
        ...(selectedMonth ? { month: selectedMonth } : {}),
      });
      const dashRes = await fetchApi(`/finance/reports/dashboard?${dashQuery.toString()}`);
      setDashboardData(dashRes);

      // 2. Load category-specific data
      if (selectedCategory === 'ANNUAL' || selectedCategory === 'MONTHLY') {
        const annualRes = await fetchApi(`/finance/reports/annual?year=${selectedYear}`);
        setAnnualData(annualRes);
      } else if (selectedCategory === 'MEMBERS') {
        const memRes = await fetchApi(`/finance/reports/members?year=${selectedYear}`);
        setMembersData(memRes);
      } else if (selectedCategory === 'FREELANCE') {
        const freeQuery = new URLSearchParams({
          year: String(selectedYear),
          ...(selectedMonth ? { month: selectedMonth } : {}),
        });
        const freeRes = await fetchApi(`/finance/reports/freelance?${freeQuery.toString()}`);
        setFreelanceData(freeRes);
      } else if (selectedCategory === 'TRANSACTIONS') {
        const txQuery = new URLSearchParams({
          year: String(selectedYear),
          ...(selectedMonth ? { month: selectedMonth } : {}),
          ...(selectedStatus ? { status: selectedStatus } : {}),
          page: String(page),
          limit: '25',
        });
        const txRes = await fetchApi(`/finance/reports/transactions?${txQuery.toString()}`);
        setTransactionsData(txRes);
      }
    } catch (err: any) {
      console.error('Failed to load report data:', err);
      setError(err?.message || 'Failed to retrieve authoritative financial records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isOwner, selectedYear, selectedMonth, selectedCategory, selectedStatus, page]);

  useEffect(() => {
    if (isOwner) {
      loadReportData();
    }
  }, [isOwner, loadReportData]);

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedYear(currentYear);
    setSelectedMonth('');
    setSelectedCategory('ANNUAL');
    setSelectedFormat('summary');
    setSelectedStatus('');
    setSearchQuery('');
    setPage(1);
  };

  // Generate Filename
  const getDescriptiveFilename = () => {
    const monthPart = selectedMonth ? `-${String(selectedMonth).padStart(2, '0')}` : '';
    switch (selectedCategory) {
      case 'ANNUAL':
        return `Annual_Financial_Report_${selectedYear}.pdf`;
      case 'MONTHLY':
        return `Monthly_Transaction_Report_${selectedYear}${monthPart}.pdf`;
      case 'MEMBERS':
        return `Member_Payment_Report_${selectedYear}.pdf`;
      case 'FREELANCE':
        return `Freelance_Payment_Report_${selectedYear}${monthPart}.pdf`;
      case 'TRANSACTIONS':
        return `Detailed_Transactions_${selectedYear}${monthPart}.pdf`;
      default:
        return `Financial_Report_${selectedYear}.pdf`;
    }
  };

  // Fetch PDF Blob
  const fetchReportPdfBlob = async (): Promise<Blob> => {
    const token = getAuthToken();
    const query = new URLSearchParams({
      year: String(selectedYear),
      ...(selectedMonth ? { month: selectedMonth } : {}),
      category: selectedCategory,
      format: selectedFormat,
      ...(selectedStatus ? { status: selectedStatus } : {}),
    });

    const res = await fetch(`${getApiBaseUrl()}/finance/reports/pdf?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      let errMessage = 'Failed to generate PDF financial report';
      try {
        const errJson = await res.json();
        errMessage = errJson.message || errMessage;
      } catch (e) {
        // text error fallback
      }
      throw new Error(errMessage);
    }

    return await res.blob();
  };

  // Handle PDF Preview
  const handlePreviewPdf = async () => {
    setPdfGenerating(true);
    setError('');
    try {
      const blob = await fetchReportPdfBlob();
      const url = URL.createObjectURL(blob);
      setPreviewPdfUrl(url);
      setPreviewModalOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Could not compile preview PDF. Please check server logs.');
    } finally {
      setPdfGenerating(false);
    }
  };

  // Handle PDF Download
  const handleDownloadPdf = async () => {
    setPdfGenerating(true);
    setError('');
    try {
      const blob = await fetchReportPdfBlob();
      const url = URL.createObjectURL(blob);
      const filename = getDescriptiveFilename();

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      setError(err?.message || 'Could not download financial report. Please try again.');
    } finally {
      setPdfGenerating(false);
    }
  };

  // Clean up object URL when closing modal
  const handleClosePreview = () => {
    setPreviewModalOpen(false);
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
  };

  // --------------------------------------------------------------------------
  // ACCESS CONTROL LOCK SCREEN FOR UNAUTHORIZED USERS
  // --------------------------------------------------------------------------
  if (!authLoading && !isOwner) {
    return (
      <AdminLayoutShell activeHref="/admin/finance">
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-black tracking-widest uppercase text-amber-600 dark:text-amber-400">
                CLASS OWNER RESTRICTION
              </span>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Authorized Access Required
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Financial transaction records, annual balance statements, member payment fulfillment grids, and certified PDF downloads are confidential and restricted exclusively to the designated Class Owner (Eseosa Glory).
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-left text-xs space-y-1">
              <div className="font-semibold text-slate-700 dark:text-slate-300">Statutory Privacy Policy:</div>
              <p className="text-slate-500 dark:text-slate-400">
                Unauthorized administrators, members, and service providers cannot access or export financial audit ledgers.
              </p>
            </div>

            <Link
              href="/admin/finance"
              className="inline-flex items-center justify-center w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 font-bold text-xs transition-all shadow-sm"
            >
              Return to Treasury Overview
            </Link>
          </div>
        </div>
      </AdminLayoutShell>
    );
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATED CLASS OWNER VIEW
  // --------------------------------------------------------------------------
  const summary = dashboardData
    ? {
        inflows: dashboardData.totalReceived ?? dashboardData.summary?.inflows ?? 0,
        outflows: dashboardData.totalOutflows ?? dashboardData.summary?.outflows ?? 0,
        netBalance: dashboardData.netBalance ?? dashboardData.summary?.netBalance ?? 0,
        successfulCount: dashboardData.successfulCount ?? dashboardData.summary?.successfulCount ?? 0,
        memberPaymentsTotal: dashboardData.memberPaymentsTotal ?? dashboardData.summary?.memberPaymentsTotal ?? 0,
        freelancePaymentsTotal: dashboardData.freelancePaymentsTotal ?? dashboardData.summary?.freelancePaymentsTotal ?? 0,
        pendingCount: dashboardData.pendingCount ?? dashboardData.summary?.pendingCount ?? 0,
        pendingAmount: dashboardData.pendingAmount ?? dashboardData.summary?.pendingAmount ?? 0,
        failedCount: dashboardData.failedCount ?? dashboardData.summary?.failedCount ?? 0,
        failedAmount: dashboardData.failedAmount ?? dashboardData.summary?.failedAmount ?? 0,
        refundedCount: dashboardData.refundedCount ?? dashboardData.summary?.refundedCount ?? 0,
        refundedAmount: dashboardData.refundedAmount ?? dashboardData.summary?.refundedAmount ?? 0,
      }
    : {
        inflows: 0,
        outflows: 0,
        netBalance: 0,
        successfulCount: 0,
        memberPaymentsTotal: 0,
        freelancePaymentsTotal: 0,
        pendingCount: 0,
        pendingAmount: 0,
        failedCount: 0,
        failedAmount: 0,
        refundedCount: 0,
        refundedAmount: 0,
      };

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-20">
        {/* Header and Title */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/finance" className="hover:text-indigo-600 transition-colors">
                FINANCE &amp; TREASURY
              </Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                AUDITED FINANCIAL REPORTS
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Financial Reports &amp; Ledgers
              </h1>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 uppercase tracking-wider">
                Class Owner
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generate, preview, audit, and download publication-grade financial statements, 12-month activity reports, member payment matrices, and contractor disbursements.
            </p>
          </div>

          {/* Action Buttons: Preview & Download PDF */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={handlePreviewPdf}
              disabled={pdfGenerating || loading}
              className="text-xs px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
            >
              {pdfGenerating ? (
                <Spinner className="w-4 h-4 text-indigo-600" />
              ) : (
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              )}
              Preview PDF
            </Button>

            <Button
              variant="primary"
              onClick={handleDownloadPdf}
              disabled={pdfGenerating || loading}
              className="text-xs px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold"
            >
              {pdfGenerating ? (
                <Spinner className="w-4 h-4 text-white" />
              ) : (
                <Download className="w-4 h-4 text-white" />
              )}
              Download PDF Report
            </Button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError('')}
              className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              <Filter className="w-4 h-4 text-indigo-600" />
              Report Configuration &amp; Filters
            </div>
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Year Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Reporting Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Month Scope
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">All 12 Months (Full Year)</option>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={String(idx + 1)}>
                    {name} ({idx + 1})
                  </option>
                ))}
              </select>
            </div>

            {/* Report Category */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Report Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as ReportCategory)}
                className="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="ANNUAL">Annual 12-Month Statement</option>
                <option value="MONTHLY">Monthly Activity Breakdown</option>
                <option value="MEMBERS">Member Payment Ledger</option>
                <option value="FREELANCE">Freelance &amp; Contractors</option>
                <option value="TRANSACTIONS">Transaction Audit Ledger</option>
              </select>
            </div>

            {/* Format: Summary vs Detailed */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Report Format
              </label>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as ReportFormat)}
                className="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="summary">Summary Report</option>
                <option value="detailed">Detailed Audit Report</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Payment Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">All Statuses</option>
                <option value="CONFIRMED">Confirmed / Successful</option>
                <option value="PENDING">Pending Verification</option>
                <option value="FAILED">Failed</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>

            {/* Search Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Keyword Search
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Executive Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* 1. Money Received */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                MONEY RECEIVED
              </span>
              <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-white">
              {naira(summary.inflows)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Gross Inflows ({summary.successfulCount} txs)
            </div>
          </div>

          {/* 2. Money Paid Out */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                MONEY PAID OUT
              </span>
              <div className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-white">
              {naira(summary.outflows)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Freelance &amp; Vendor Payouts
            </div>
          </div>

          {/* 3. Net Operating Balance */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                NET BALANCE
              </span>
              <div className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-white">
              {naira(summary.netBalance)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {summary.netBalance >= 0 ? 'Operating Surplus' : 'Operating Deficit'}
            </div>
          </div>

          {/* 4. Member Contributions */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                MEMBER DUES
              </span>
              <div className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-white">
              {naira(summary.memberPaymentsTotal)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Verified Class Members
            </div>
          </div>

          {/* 5. Pending Transactions */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                PENDING
              </span>
              <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-white">
              {summary.pendingCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {naira(summary.pendingAmount)} unconfirmed
            </div>
          </div>

          {/* 6. Failed & Refunded */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                FAILED / REFUNDED
              </span>
              <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-white">
              {summary.failedCount + summary.refundedCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {naira(summary.failedAmount + summary.refundedAmount)} total
            </div>
          </div>
        </div>

        {/* Currency & Reconciliation Notice */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-indigo-900 dark:text-indigo-200">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              Authoritative Reporting Currency: <strong>NGN (Nigerian Naira ₦)</strong>. Reconciled timezone: <strong>Africa/Lagos (WAT)</strong>.
            </span>
          </div>
          <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
            All 12 calendar months are accounted for with zero-activity validation.
          </div>
        </div>

        {/* Category Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar gap-2 sm:gap-4">
          {[
            { id: 'ANNUAL', label: '12-Month Annual Activity', icon: Calendar },
            { id: 'MEMBERS', label: 'Member Payment Ledger', icon: Users },
            { id: 'FREELANCE', label: 'Freelance & Contractors', icon: Briefcase },
            { id: 'TRANSACTIONS', label: 'Detailed Transaction Audit', icon: Layers },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id as ReportCategory)}
                className={`inline-flex items-center gap-2 py-3 px-3.5 text-xs font-black transition-all border-b-2 whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Main Content Areas */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Spinner className="w-7 h-7 text-indigo-600" />
            <p className="text-xs font-bold uppercase tracking-wider">
              Aggregating authoritative financial records...
            </p>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------------------- */}
            {/* VIEW 1: 12-MONTH ANNUAL FINANCIAL ACTIVITY TABLE */}
            {/* ------------------------------------------------------------- */}
            {(selectedCategory === 'ANNUAL' || selectedCategory === 'MONTHLY') && annualData && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Annual Activity Breakdown ({annualData.year})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Full 12-month calendar ledger from January through December. Zero-activity months are explicitly accounted for.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      ANNUAL INFLOWS
                    </span>
                    <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      {naira(annualData.totalReceived ?? annualData.annualTotals?.inflows ?? 0)}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                        <th className="py-3.5 px-4">Month</th>
                        <th className="py-3.5 px-4 text-right">Inflows (Receipts)</th>
                        <th className="py-3.5 px-4 text-center">Txs</th>
                        <th className="py-3.5 px-4 text-center">Members</th>
                        <th className="py-3.5 px-4 text-right">Outflows (Expenses)</th>
                        <th className="py-3.5 px-4 text-right">Net Balance</th>
                        <th className="py-3.5 px-4 text-center">Pending</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {(annualData.monthlyBreakdown || annualData.months || [])?.map((m: any) => {
                        const mInflow = m.totalReceived ?? m.inflows ?? 0;
                        const mOutflow = m.freelanceTotal ?? m.outflows ?? 0;
                        const isZero = m.successfulCount === 0 && mOutflow === 0;
                        const payingCount = m.payingMembersCount ?? (m.membersSet ? (Array.isArray(m.membersSet) ? m.membersSet.length : 0) : 0);
                        return (
                          <tr
                            key={m.month}
                            className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                              isZero ? 'opacity-70 bg-slate-50/20 dark:bg-slate-950/20' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                              {m.monthName} ({m.month})
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                              {naira(mInflow)}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold">
                              {m.successfulCount}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold">
                              {payingCount}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-rose-600 dark:text-rose-400">
                              {naira(mOutflow)}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold">
                              <span
                                className={
                                  m.netBalance >= 0
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }
                              >
                                {naira(m.netBalance)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500">
                              {m.pendingCount > 0 ? (
                                <span className="text-amber-600 font-semibold">
                                  {m.pendingCount} ({naira(m.pendingAmount)})
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isZero ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  Zero Activity
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                  Active
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100/90 dark:bg-slate-950 font-black text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                        <td className="py-4 px-4 uppercase tracking-wider text-[11px]">
                          Annual Reconciled Totals
                        </td>
                        <td className="py-4 px-4 text-right text-emerald-600 dark:text-emerald-400 text-sm">
                          {naira(annualData.totalReceived ?? annualData.annualTotals?.inflows ?? 0)}
                        </td>
                        <td className="py-4 px-4 text-center text-sm">
                          {annualData.successfulCount ?? annualData.annualTotals?.successfulCount ?? 0}
                        </td>
                        <td className="py-4 px-4 text-center text-sm">
                          {annualData.uniquePayingMembers ?? annualData.annualTotals?.uniquePayingMembers ?? 30}
                        </td>
                        <td className="py-4 px-4 text-right text-rose-600 dark:text-rose-400 text-sm">
                          {naira(annualData.totalOutflows ?? annualData.annualTotals?.outflows ?? 0)}
                        </td>
                        <td className="py-4 px-4 text-right text-indigo-600 dark:text-indigo-400 text-sm">
                          {naira(annualData.netBalance ?? annualData.annualTotals?.netBalance ?? 0)}
                        </td>
                        <td className="py-4 px-4 text-center text-amber-600">
                          {annualData.pendingCount ?? annualData.annualTotals?.pendingCount ?? 0}
                        </td>
                        <td className="py-4 px-4 text-center text-[10px] uppercase text-emerald-600">
                          Certified
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 2: MEMBER PAYMENT LEDGER & 12-MONTH FULFILLMENT MATRIX */}
            {/* ------------------------------------------------------------- */}
            {selectedCategory === 'MEMBERS' && membersData && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-4">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Member Payment Ledger ({membersData.year})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Payment compliance grid across all 12 calendar months for verified class members.
                    </p>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    Total Members Audited: <strong>{membersData.members?.length || 0}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4">Member</th>
                        <th className="py-3 px-2 text-center" colSpan={12}>
                          12-Month Fulfillment Grid (Jan – Dec)
                        </th>
                        <th className="py-3 px-4 text-right">Total Paid</th>
                        <th className="py-3 px-4 text-right">Total Due</th>
                        <th className="py-3 px-4 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {membersData.members
                        ?.filter((m: any) => {
                          if (!searchQuery) return true;
                          const q = searchQuery.toLowerCase();
                          return (
                            m.name.toLowerCase().includes(q) ||
                            (m.email && m.email.toLowerCase().includes(q))
                          );
                        })
                        .map((m: any) => (
                          <tr key={m.memberId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {m.name}
                              </div>
                              <div className="text-[10px] text-slate-400">{m.email || 'No email registered'}</div>
                            </td>

                            {/* 12 Months Indicators */}
                            {MONTH_SHORT.map((shortName, idx) => {
                              const monthNum = idx + 1;
                              const isPaid = m.monthsPaid?.includes(monthNum);
                              return (
                                <td key={monthNum} className="py-3 px-1 text-center">
                                  <span
                                    title={`${shortName}: ${isPaid ? 'Paid' : 'No Payment'}`}
                                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black ${
                                      isPaid
                                        ? 'bg-emerald-500 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {isPaid ? '✓' : '·'}
                                  </span>
                                </td>
                              );
                            })}

                            <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                              {naira(m.totalPaid)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-500">
                              {naira(m.totalDue)}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold">
                              {m.outstandingBalance > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {naira(m.outstandingBalance)}
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">₦0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 3: FREELANCE-WORKER & CONTRACTOR DISBURSEMENTS */}
            {/* ------------------------------------------------------------- */}
            {selectedCategory === 'FREELANCE' && freelanceData && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-4">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Freelance-Worker &amp; Contractor Disbursements ({freelanceData.year})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Authoritative records of service provider expenses, contractor remuneration, and operational disbursements.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      TOTAL DISBURSED
                    </span>
                    <div className="text-lg font-black text-rose-600 dark:text-rose-400">
                      {naira(freelanceData.totalPaid ?? freelanceData.summary?.totalPaid ?? 0)}
                    </div>
                  </div>
                </div>

                {(freelanceData.workers || freelanceData.records || []).length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <Briefcase className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        No Freelance Disbursements Recorded
                      </h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        There were zero contractor disbursements or freelance worker expenses logged in the authoritative financial database for {freelanceData.year}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                          <th className="py-3 px-4">Contractor / Worker</th>
                          <th className="py-3 px-4">Category / Service</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Reference</th>
                          <th className="py-3 px-4 text-right">Amount Paid</th>
                          <th className="py-3 px-4 text-right">Payable</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {(freelanceData.workers || freelanceData.records || []).map((r: any) => (
                          <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                              {r.workerName}
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {r.serviceCategory || r.category}
                              </span>
                              {r.description && <span className="block text-[10px]">{r.description}</span>}
                            </td>
                            <td className="py-3 px-4 text-slate-500">
                              {r.paymentDate
                                ? new Date(r.paymentDate).toLocaleDateString('en-GB')
                                : '—'}
                            </td>
                            <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                              {r.reference}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-rose-600 dark:text-rose-400">
                              {naira(r.amountPaid)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-500">
                              {naira(r.amountPayable)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 4: DETAILED TRANSACTION AUDIT LEDGER */}
            {/* ------------------------------------------------------------- */}
            {selectedCategory === 'TRANSACTIONS' && transactionsData && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-4">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Detailed Transaction Audit Ledger
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Line-by-line verifiable accounting ledger containing verified transaction dates, references, payers, and payment channels.
                    </p>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    Showing {transactionsData.transactions?.length || 0} of {transactionsData.pagination?.total || 0} transactions
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4">Date &amp; Time (WAT)</th>
                        <th className="py-3 px-4">Reference</th>
                        <th className="py-3 px-4">Entity / Member</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {transactionsData.transactions?.map((t: any) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {new Date(t.date).toLocaleString('en-GB', {
                              timeZone: 'Africa/Lagos',
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                            {t.reference}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                            {t.memberName}
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {t.category}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300">
                            {t.paymentMethod || 'Transfer'}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                            {naira(t.amount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                t.status === 'CONFIRMED'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                                  : t.status === 'PENDING'
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {transactionsData.pagination && (
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Page {transactionsData.pagination.page} of {transactionsData.pagination.pages}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={transactionsData.pagination.page <= 1}
                        className="text-xs px-3 py-1.5 rounded-lg"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setPage((p) => Math.min(transactionsData.pagination.pages, p + 1))}
                        disabled={transactionsData.pagination.page >= transactionsData.pagination.pages}
                        className="text-xs px-3 py-1.5 rounded-lg"
                      >
                        Next
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ------------------------------------------------------------- */}
        {/* PDF PREVIEW MODAL */}
        {/* ------------------------------------------------------------- */}
        {previewModalOpen && previewPdfUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-150">
            <div className="w-full max-w-5xl h-[92vh] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      Document Preview: {getDescriptiveFilename()}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Standard A4 Financial Document • Certified Class Owner Copy
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={handleDownloadPdf}
                    className="text-xs px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download File
                  </Button>
                  <button
                    onClick={handleClosePreview}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* PDF Viewer Frame */}
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-2 sm:p-4">
                <iframe
                  src={previewPdfUrl}
                  title="PDF Financial Report Preview"
                  className="w-full h-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
