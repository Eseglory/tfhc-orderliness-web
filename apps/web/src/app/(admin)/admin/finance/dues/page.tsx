'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Plus,
  Upload,
  Search,
  Filter,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Users,
  LayoutGrid,
  List,
  Grid3X3,
  BarChart3,
  Printer,
  Download,
  Calendar,
  DollarSign,
  ChevronRight,
  SlidersHorizontal,
  Clock,
  ShieldCheck,
  ArrowUpDown,
  FileText,
  UserCheck,
  AlertTriangle,
  XCircle,
  Eye,
  Edit,
  ExternalLink,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Spinner,
  inputClass,
  useToast,
} from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ViewType = 'matrix' | 'list' | 'grid' | 'analytics';

interface MonthCell {
  month: number;
  monthName: string;
  periodId: string | null;
  assignmentId: string | null;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: 'PAID' | 'PARTIALLY_PAID' | 'OUTSTANDING' | 'OVERDUE' | 'EXEMPT' | 'WAIVED' | 'NOT_ASSIGNED' | 'NOT_CREATED';
  dueDate: string | null;
  note?: string | null;
}

interface MemberMatrixRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  memberCode: string;
  email: string | null;
  phone: string | null;
  status: string;
  months: MonthCell[];
  totalExpected: number;
  totalPaid: number;
  balanceDue: number;
  complianceRate: number;
  monthsPaidCount: number;
  assignedMonthsCount: number;
}

interface MatrixSummary {
  totalMembers: number;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  fullyPaidMembersCount: number;
  partialMembersCount: number;
  zeroPaidMembersCount: number;
  monthlyBreakdown: Array<{
    month: number;
    monthName: string;
    hasPeriod: boolean;
    periodId: string | null;
    defaultAmount: number;
    dueDate: string | null;
    status: string;
    expected: number;
    collected: number;
    outstanding: number;
    collectionRate: number;
    paidCount: number;
    partialCount: number;
    overdueCount: number;
    outstandingCount: number;
    totalAssigned: number;
  }>;
}

interface MatrixData {
  year: number;
  periods: Array<{
    id: string;
    year: number;
    month: number;
    label: string;
    defaultAmount: number;
    dueDate: string;
    status: string;
  }>;
  members: MemberMatrixRow[];
  summary: MatrixSummary;
}

export default function DuesPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();

  // Primary states
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // View state: 'matrix' | 'list' | 'grid' | 'analytics'
  const [viewType, setViewType] = useState<ViewType>('matrix');

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [complianceFilter, setComplianceFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'paid_desc' | 'balance_desc' | 'compliance_desc'>('name_asc');

  // Modals
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [viewingCampaignId, setViewingCampaignId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState<{ member: MemberMatrixRow; month?: MonthCell } | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Special (one-off) contribution campaigns — separate from the recurring monthly matrix.
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const loadCampaigns = async () => {
    try {
      const rows = await fetchApi<any[]>('/finance/dues/periods');
      setCampaigns(rows.filter((r) => r.type === 'SPECIAL'));
    } catch {
      // non-fatal — the matrix is the primary view
    }
  };

  const canManage = can('dues.create') || can('dues.update') || can('payments.manage');

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<MatrixData>(`/finance/dues/matrix?year=${year}`);
      setData(res);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have permission to view dues.' : 'Could not load annual dues data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadMatrix();
      void loadCampaigns();
    }
  }, [authLoading, year]);

  // Filtered & Sorted Members
  const filteredMembers = useMemo(() => {
    if (!data?.members) return [];

    let list = data.members.filter((m) => {
      // 1. Search Query
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesQuery =
          m.name.toLowerCase().includes(q) ||
          (m.memberCode || '').toLowerCase().includes(q) ||
          (m.email || '').toLowerCase().includes(q) ||
          (m.phone || '').toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      // 2. Month-specific status filter
      if (selectedMonth !== 'all') {
        const monthCell = m.months.find((c) => c.month === selectedMonth);
        if (statusFilter && monthCell?.status !== statusFilter) return false;
      } else if (statusFilter) {
        // Full year filter: member has at least one month matching status
        const hasMatchingMonth = m.months.some((c) => c.status === statusFilter);
        if (!hasMatchingMonth) return false;
      }

      // 3. Compliance Filter
      if (complianceFilter === 'FULLY_PAID' && (m.assignedMonthsCount === 0 || m.monthsPaidCount !== m.assignedMonthsCount)) {
        return false;
      }
      if (complianceFilter === 'PARTIAL' && (m.monthsPaidCount === 0 || m.monthsPaidCount === m.assignedMonthsCount)) {
        return false;
      }
      if (complianceFilter === 'ZERO_PAID' && (m.assignedMonthsCount > 0 && m.totalPaid > 0)) {
        return false;
      }

      return true;
    });

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'paid_desc') return b.totalPaid - a.totalPaid;
      if (sortBy === 'balance_desc') return b.balanceDue - a.balanceDue;
      if (sortBy === 'compliance_desc') return b.complianceRate - a.complianceRate;
      return 0;
    });

    return list;
  }, [data, search, selectedMonth, statusFilter, complianceFilter, sortBy]);

  const handleExportCSV = () => {
    if (!data || filteredMembers.length === 0) return;
    const headers = ['Member Code', 'Full Name', 'Phone', 'Email', ...MONTHS, 'Total Expected', 'Total Paid', 'Balance Due', 'Compliance %'];
    const rows = filteredMembers.map((m) => {
      const monthCols = m.months.map((cell) => `"${cell.status === 'PAID' ? 'PAID (' + cell.amountPaid + ')' : cell.status}"`);
      return [
        `"${m.memberCode || ''}"`,
        `"${m.name}"`,
        `"${m.phone || ''}"`,
        `"${m.email || ''}"`,
        ...monthCols,
        `"${m.totalExpected}"`,
        `"${m.totalPaid}"`,
        `"${m.balanceDue}"`,
        `"${m.complianceRate}%"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `TFHC_Monthly_Dues_Matrix_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-20">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/finance" className="hover:text-indigo-600 transition-colors">FINANCE</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">ANNUAL DUES SUITE</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Monthly Dues Management
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Global 12-Month Matrix, Member Compliance Roster &amp; Financial Accounting
                </p>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowPdfModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm transition-all cursor-pointer"
              title="Printable Executive PDF"
            >
              <Printer className="w-4 h-4 text-indigo-500" />
              <span>Export Executive PDF</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export CSV</span>
            </button>

            {canManage && (
              <>
                <button
                  onClick={() => setImporting(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>Import Data</span>
                </button>

                <button
                  onClick={() => setCreatingPeriod(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Period</span>
                </button>

                <button
                  onClick={() => setCreatingCampaign(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Special Contribution</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Top Executive KPI Cards */}
        {data?.summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Annual Expected</span>
                <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Calendar className="w-4 h-4" />
                </span>
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
                {naira(data.summary.totalExpected)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {data.summary.totalMembers} active member records for {year}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Collected</span>
                <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </span>
              </div>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                {naira(data.summary.totalCollected)}
              </p>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, data.summary.collectionRate)}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Outstanding Balance</span>
                <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4" />
                </span>
              </div>
              <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-2">
                {naira(data.summary.totalOutstanding)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {data.summary.partialMembersCount + data.summary.zeroPaidMembersCount} members with pending dues
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Overall Compliance</span>
                <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                  {data.summary.collectionRate}%
                </p>
                <span className="text-xs font-bold text-emerald-600">
                  ({data.summary.fullyPaidMembersCount} 100% Paid)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {data.summary.zeroPaidMembersCount} zero paid &bull; {data.summary.partialMembersCount} partial
              </p>
            </div>
          </div>
        )}

        {/* Special (one-off) contribution campaigns — e.g. a Christmas Party fund */}
        {campaigns.length > 0 && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              Special Contributions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setViewingCampaignId(c.id)}
                  className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.label}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {naira(c.defaultAmount)} per member &bull; deadline {new Date(c.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{c.assignmentCount} assigned{c.paymentAccount ? ` · ${c.paymentAccount.bankName}` : ''}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Master Control Bar: 4 View Modes & Multi-Criteria Filtering */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            {/* View Style Switcher (4 View Styles) */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
              <button
                onClick={() => setViewType('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewType === 'matrix'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Spreadsheet / Excel Matrix View"
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>12-Month Matrix</span>
              </button>

              <button
                onClick={() => setViewType('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewType === 'list'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Tabular List View"
              >
                <List className="w-3.5 h-3.5" />
                <span>List Table</span>
              </button>

              <button
                onClick={() => setViewType('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewType === 'grid'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Member Visual Cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Visual Cards</span>
              </button>

              <button
                onClick={() => setViewType('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewType === 'analytics'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Analytics & Trends View"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Analytics &amp; Trends</span>
              </button>
            </div>

            {/* Year Selector & Quick Refresh */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Year:</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-black text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {[2026, 2025, 2024, 2023].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button
                onClick={loadMatrix}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                title="Refresh Matrix"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Multi-Criteria Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            {/* Search Input */}
            <div className="relative col-span-1 sm:col-span-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search member name, code, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            {/* Month Filter */}
            <div>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="all">Full Year (All 12 Months)</option>
                {MONTHS.map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>{m}</option>
                ))}
              </select>
            </div>

            {/* Payment Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="">All Payment Statuses</option>
                <option value="PAID">Paid (Cleared)</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="OUTSTANDING">Pending (Not Due)</option>
                <option value="OVERDUE">Overdue (Past Due)</option>
                <option value="EXEMPT">Exempt / Waived</option>
              </select>
            </div>

            {/* Compliance Filter */}
            <div>
              <select
                value={complianceFilter}
                onChange={(e) => setComplianceFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="">All Compliance Levels</option>
                <option value="FULLY_PAID">100% Compliant (All Paid)</option>
                <option value="PARTIAL">In Progress (Partial)</option>
                <option value="ZERO_PAID">Defaulters (0 Paid)</option>
              </select>
            </div>
          </div>

          {/* Active Filter Chips & Reset */}
          {(search || selectedMonth !== 'all' || statusFilter || complianceFilter) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold">Active Filters:</span>
              {selectedMonth !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium text-[11px]">
                  Month: {MONTHS[Number(selectedMonth) - 1]}
                </span>
              )}
              {statusFilter && (
                <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-medium text-[11px]">
                  Status: {statusFilter.replace('_', ' ')}
                </span>
              )}
              {complianceFilter && (
                <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-medium text-[11px]">
                  Compliance: {complianceFilter.replace('_', ' ')}
                </span>
              )}
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedMonth('all');
                  setStatusFilter('');
                  setComplianceFilter('');
                }}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-auto cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 1: 12-MONTH SPREADSHEET MATRIX VIEW                           */}
        {/* ------------------------------------------------------------------ */}
        {viewType === 'matrix' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Annual Dues Matrix — {year}</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold">
                    {filteredMembers.length} Members
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Horizontal cross-tabulation of all 12 dues periods with instant cell payments.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Paid</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Partial</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Overdue</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Pending</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3.5 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 min-w-[200px] border-r border-slate-200/60 dark:border-slate-700/60">
                      MEMBER &amp; CODE
                    </th>
                    {SHORT_MONTHS.map((m, idx) => (
                      <th key={idx} className="px-2.5 py-3.5 text-center min-w-[85px] border-r border-slate-100 dark:border-slate-800/80">
                        {m}
                      </th>
                    ))}
                    <th className="px-3 py-3.5 text-right font-bold text-emerald-600 min-w-[95px]">PAID</th>
                    <th className="px-3 py-3.5 text-right font-bold text-rose-600 min-w-[95px]">BALANCE</th>
                    <th className="px-3 py-3.5 text-center min-w-[80px]">RATE</th>
                    <th className="px-3 py-3.5 text-center min-w-[80px]">ACTION</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((m, idx) => (
                      <tr
                        key={m.id}
                        className={`hover:bg-indigo-50/30 dark:hover:bg-slate-800/50 transition-colors ${
                          idx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-900/40' : ''
                        }`}
                      >
                        {/* Sticky Member Identity */}
                        <td className="px-4 py-2.5 sticky left-0 z-10 bg-inherit border-r border-slate-200/60 dark:border-slate-700/60">
                          <div className="flex items-center gap-2.5 min-w-[180px]">
                            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-black flex items-center justify-center text-[10px] ring-1 ring-indigo-200 dark:ring-indigo-800 shrink-0">
                              {m.firstName?.[0] || 'M'}{m.lastName?.[0] || ''}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-slate-900 dark:text-white truncate text-xs">
                                {m.name}
                              </p>
                              <span className="font-mono text-[10px] text-slate-400 block truncate">
                                {m.memberCode}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 12 Month Cells */}
                        {m.months.map((cell) => {
                          const isPaid = cell.status === 'PAID';
                          const isPartial = cell.status === 'PARTIALLY_PAID';
                          const isOverdue = cell.status === 'OVERDUE';
                          const isOutstanding = cell.status === 'OUTSTANDING';

                          let cellStyle = 'bg-slate-50/50 text-slate-400 dark:bg-slate-800/30';
                          if (isPaid) cellStyle = 'bg-emerald-50/80 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100';
                          else if (isPartial) cellStyle = 'bg-amber-50/90 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100';
                          else if (isOverdue) cellStyle = 'bg-rose-50/90 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100';
                          else if (isOutstanding) cellStyle = 'bg-blue-50/60 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 hover:bg-blue-100';

                          return (
                            <td
                              key={cell.month}
                              className="px-1.5 py-1.5 text-center border-r border-slate-100 dark:border-slate-800/80"
                            >
                              <button
                                onClick={() => {
                                  if (canManage) {
                                    setPaymentModalData({ member: m, month: cell });
                                  }
                                }}
                                className={`w-full py-1 px-1.5 rounded-lg text-[11px] font-bold transition-all ${cellStyle} ${
                                  canManage ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                                }`}
                                title={`${m.name} — ${cell.monthName} ${year}\nStatus: ${cell.status}\nPaid: ${naira(cell.amountPaid)} / Due: ${naira(cell.amountDue)}`}
                              >
                                {isPaid ? (
                                  <span className="flex items-center justify-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                    <span>{naira(cell.amountPaid)}</span>
                                  </span>
                                ) : isPartial ? (
                                  <span>{naira(cell.amountPaid)}</span>
                                ) : isOverdue ? (
                                  <span className="flex items-center justify-center gap-0.5 text-rose-700">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    <span>Unpaid</span>
                                  </span>
                                ) : isOutstanding ? (
                                  <span className="text-blue-600">Due</span>
                                ) : (
                                  <span>—</span>
                                )}
                              </button>
                            </td>
                          );
                        })}

                        {/* Totals & Rates */}
                        <td className="px-3 py-2 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {naira(m.totalPaid)}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-rose-600 dark:text-rose-400">
                          {naira(m.balanceDue)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black ${
                              m.complianceRate === 100
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : m.complianceRate > 50
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {m.complianceRate}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => setPaymentModalData({ member: m })}
                            className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Record Payment"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={17} className="px-6 py-12 text-center text-slate-500">
                        <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-sm">No member dues records found</p>
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Footer Row: Monthly Totals */}
                {data?.summary?.monthlyBreakdown && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/90 font-black text-[11px] text-slate-800 dark:text-slate-200 border-t-2 border-slate-300 dark:border-slate-700">
                    <tr>
                      <td className="px-4 py-3 sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
                        MONTHLY TOTALS
                      </td>
                      {data.summary.monthlyBreakdown.map((mb) => (
                        <td key={mb.month} className="px-2 py-3 text-center border-r border-slate-200 dark:border-slate-700/80">
                          <div className="text-emerald-600 dark:text-emerald-400">
                            {naira(mb.collected)}
                          </div>
                          <div className="text-[9px] text-slate-400 font-medium">
                            {mb.collectionRate}%
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-emerald-600 font-extrabold">
                        {naira(data.summary.totalCollected)}
                      </td>
                      <td className="px-3 py-3 text-right text-rose-600 font-extrabold">
                        {naira(data.summary.totalOutstanding)}
                      </td>
                      <td className="px-3 py-3 text-center font-extrabold text-indigo-600">
                        {data.summary.collectionRate}%
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 2: TABULAR LIST VIEW                                          */}
        {/* ------------------------------------------------------------------ */}
        {viewType === 'list' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">MEMBER</th>
                    <th className="px-5 py-3.5">CONTACT &amp; EMAIL</th>
                    <th className="px-5 py-3.5 text-right">TOTAL BILLED</th>
                    <th className="px-5 py-3.5 text-right">TOTAL PAID</th>
                    <th className="px-5 py-3.5 text-right">BALANCE DUE</th>
                    <th className="px-5 py-3.5">COMPLIANCE PROGRESS</th>
                    <th className="px-5 py-3.5 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center text-xs ring-1 ring-indigo-200 dark:ring-indigo-800 shrink-0">
                              {m.firstName?.[0] || 'M'}{m.lastName?.[0] || ''}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-900 dark:text-white">{m.name}</p>
                              <span className="font-mono text-[10px] text-indigo-600 font-bold">{m.memberCode}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{m.email || 'No email'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{m.phone || 'No phone'}</p>
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-slate-700 dark:text-slate-300">
                          {naira(m.totalExpected)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {naira(m.totalPaid)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-rose-600 dark:text-rose-400">
                          {naira(m.balanceDue)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{m.monthsPaidCount} of {m.assignedMonthsCount} Months</span>
                              <span className="font-extrabold text-indigo-600">{m.complianceRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  m.complianceRate === 100 ? 'bg-emerald-500' : m.complianceRate > 50 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${m.complianceRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPaymentModalData({ member: m })}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 transition-colors cursor-pointer"
                            >
                              Pay Dues
                            </button>
                            <Link
                              href={`/admin/members/${m.id}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="View Profile"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        No member records found matching criteria
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 3: VISUAL CARDS / GRID VIEW                                   */}
        {/* ------------------------------------------------------------------ */}
        {viewType === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMembers.map((m) => (
              <div
                key={m.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 hover:shadow-md transition-shadow"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black flex items-center justify-center text-sm ring-1 ring-indigo-200 dark:ring-indigo-800 shrink-0">
                      {m.firstName?.[0] || 'M'}{m.lastName?.[0] || ''}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight">{m.name}</h3>
                      <span className="font-mono text-[10px] text-slate-400">{m.memberCode}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                      m.complianceRate === 100
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : m.complianceRate > 50
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {m.complianceRate}% Paid
                  </span>
                </div>

                {/* Financial Overview Chips */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Total Paid</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{naira(m.totalPaid)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Balance Due</span>
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400">{naira(m.balanceDue)}</span>
                  </div>
                </div>

                {/* 12 Mini Monthly Badges */}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    12-Month Payment Tracking
                  </span>
                  <div className="grid grid-cols-6 gap-1">
                    {m.months.map((cell) => {
                      const isPaid = cell.status === 'PAID';
                      const isPartial = cell.status === 'PARTIALLY_PAID';
                      const isOverdue = cell.status === 'OVERDUE';

                      let badgeBg = 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500';
                      if (isPaid) badgeBg = 'bg-emerald-500 text-white';
                      else if (isPartial) badgeBg = 'bg-amber-500 text-white';
                      else if (isOverdue) badgeBg = 'bg-rose-500 text-white';

                      return (
                        <button
                          key={cell.month}
                          onClick={() => setPaymentModalData({ member: m, month: cell })}
                          className={`py-1 rounded text-[10px] font-bold text-center transition-transform active:scale-90 ${badgeBg} cursor-pointer`}
                          title={`${SHORT_MONTHS[cell.month - 1]}: ${cell.status}`}
                        >
                          {SHORT_MONTHS[cell.month - 1]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setPaymentModalData({ member: m })}
                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                  >
                    Record Payment
                  </button>
                  <Link
                    href={`/admin/members/${m.id}`}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                    title="View Profile"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 4: ANALYTICS & COLLECTION VELOCITY VIEW                       */}
        {/* ------------------------------------------------------------------ */}
        {viewType === 'analytics' && data?.summary && (
          <div className="space-y-6">
            {/* Monthly Collection Trend Bar Chart */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Monthly Revenue Collection Trend ({year})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Comparative breakdown of expected dues vs actual collections across all 12 months.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-emerald-500" /> Collected</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700" /> Expected</span>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 pt-6 pb-2 items-end h-64 border-b border-slate-100 dark:border-slate-800">
                {data.summary.monthlyBreakdown.map((mb) => {
                  const maxExpected = Math.max(...data.summary.monthlyBreakdown.map((x) => x.expected || 1), 80000);
                  const expectedHeight = (mb.expected / maxExpected) * 100;
                  const collectedHeight = (mb.collected / maxExpected) * 100;

                  return (
                    <div key={mb.month} className="flex flex-col items-center justify-end h-full group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] py-1 px-2 rounded-lg shadow-xl whitespace-nowrap">
                        <span>{mb.monthName}: {naira(mb.collected)}</span>
                        <span className="text-slate-400">Rate: {mb.collectionRate}%</span>
                      </div>

                      {/* Bar columns */}
                      <div className="w-full max-w-[28px] flex items-end gap-1 h-full">
                        <div
                          className="w-full rounded-t-lg bg-emerald-500 transition-all duration-500"
                          style={{ height: `${collectedHeight}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 mt-2">{SHORT_MONTHS[mb.month - 1]}</span>
                      <span className="text-[9px] font-extrabold text-emerald-600">{mb.collectionRate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Compliance Leaderboard & Defaulter Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fully Compliant Members */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h4 className="font-black text-sm text-slate-900 dark:text-white">100% Compliant Members</h4>
                      <p className="text-[11px] text-slate-400">Members with zero outstanding balances for {year}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {data.summary.fullyPaidMembersCount} Members
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {filteredMembers
                    .filter((m) => m.complianceRate === 100)
                    .map((m) => (
                      <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 font-bold flex items-center justify-center text-[10px]">
                            {m.firstName?.[0]}{m.lastName?.[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{m.name}</p>
                            <span className="font-mono text-[10px] text-slate-400">{m.memberCode}</span>
                          </div>
                        </div>
                        <span className="font-black text-emerald-600">{naira(m.totalPaid)}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Action Required: Defaulters / Outstanding Members */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <div>
                      <h4 className="font-black text-sm text-slate-900 dark:text-white">Pending Collections &amp; Defaulters</h4>
                      <p className="text-[11px] text-slate-400">Members requiring follow-up reminders</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    {data.summary.partialMembersCount + data.summary.zeroPaidMembersCount} Members
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {filteredMembers
                    .filter((m) => m.balanceDue > 0)
                    .map((m) => (
                      <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{m.name}</p>
                          <span className="text-[10px] text-slate-400">{m.phone || m.email || 'No contact'}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-rose-600 block">{naira(m.balanceDue)} due</span>
                          <button
                            onClick={() => setPaymentModalData({ member: m })}
                            className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                          >
                            Record Pay
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL 1: EXECUTIVE PRINTABLE PDF REPORT VIEW                       */}
        {/* ------------------------------------------------------------------ */}
        {showPdfModal && data && (
          <ExecutivePdfModal
            data={data}
            year={year}
            onClose={() => setShowPdfModal(false)}
          />
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL 2: QUICK RECORD PAYMENT                                      */}
        {/* ------------------------------------------------------------------ */}
        {paymentModalData && (
          <QuickPaymentModal
            member={paymentModalData.member}
            month={paymentModalData.month}
            year={year}
            onClose={() => setPaymentModalData(null)}
            onDone={() => {
              setPaymentModalData(null);
              loadMatrix();
            }}
          />
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL 3: CREATE PERIOD                                             */}
        {/* ------------------------------------------------------------------ */}
        {creatingPeriod && (
          <CreatePeriodModal
            onClose={() => setCreatingPeriod(false)}
            onDone={() => {
              setCreatingPeriod(false);
              loadMatrix();
            }}
          />
        )}

        {creatingCampaign && (
          <CreateCampaignModal
            onClose={() => setCreatingCampaign(false)}
            onDone={() => {
              setCreatingCampaign(false);
              void loadCampaigns();
            }}
          />
        )}

        {viewingCampaignId && (
          <CampaignDetailModal
            periodId={viewingCampaignId}
            onClose={() => setViewingCampaignId(null)}
            onChanged={() => void loadCampaigns()}
          />
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL 4: SPREADSHEET IMPORT                                        */}
        {/* ------------------------------------------------------------------ */}
        {importing && (
          <ImportModal
            onClose={() => setImporting(false)}
            onDone={() => {
              setImporting(false);
              loadMatrix();
            }}
          />
        )}
      </div>
    </AdminLayoutShell>
  );
}

// ----------------------------------------------------------------------------
// EXECUTIVE PRINTABLE PDF REPORT MODAL
// ----------------------------------------------------------------------------
function ExecutivePdfModal({
  data,
  year,
  onClose,
}: {
  data: MatrixData;
  year: number;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Executive Financial Report — ${year}`}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint} className="gap-1.5">
            <Printer className="w-4 h-4" />
            <span>Print to PDF</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6 text-slate-800" ref={printRef}>
        {/* Print Document Header */}
        <div className="border-b-2 border-indigo-600 pb-4 flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-tight text-slate-900">THE FATHER&apos;S HOUSE CHURCH</h2>
            <p className="text-xs font-bold text-indigo-600 tracking-wider uppercase">Orderliness Unit &bull; Financial Administration</p>
            <p className="text-[11px] text-slate-500">Annual Dues &amp; Member Compliance Accounting Report ({year})</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-slate-700">Date Generated:</p>
            <p className="text-slate-500">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Expected</span>
            <span className="text-base font-black text-slate-900">{naira(data.summary.totalExpected)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-600 uppercase block">Total Collected</span>
            <span className="text-base font-black text-emerald-600">{naira(data.summary.totalCollected)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-rose-600 uppercase block">Total Outstanding</span>
            <span className="text-base font-black text-rose-600">{naira(data.summary.totalOutstanding)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-indigo-600 uppercase block">Compliance Rate</span>
            <span className="text-base font-black text-indigo-600">{data.summary.collectionRate}%</span>
          </div>
        </div>

        {/* 12-Month Matrix Print Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="p-2 border-r border-slate-200">Member</th>
                {SHORT_MONTHS.map((m) => (
                  <th key={m} className="p-1.5 text-center border-r border-slate-200">{m}</th>
                ))}
                <th className="p-2 text-right text-emerald-700">Paid</th>
                <th className="p-2 text-right text-rose-700">Balance</th>
                <th className="p-2 text-center">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900 border-r border-slate-200">
                    {m.name}
                    <span className="font-mono text-[9px] text-slate-400 block">{m.memberCode}</span>
                  </td>
                  {m.months.map((cell) => (
                    <td key={cell.month} className="p-1 text-center border-r border-slate-200">
                      {cell.status === 'PAID' ? (
                        <span className="font-bold text-emerald-600">✓ {Math.round(cell.amountPaid / 1000)}k</span>
                      ) : cell.status === 'PARTIALLY_PAID' ? (
                        <span className="font-bold text-amber-600">{Math.round(cell.amountPaid / 1000)}k</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-right font-bold text-emerald-600">{naira(m.totalPaid)}</td>
                  <td className="p-2 text-right font-bold text-rose-600">{naira(m.balanceDue)}</td>
                  <td className="p-2 text-center font-bold">{m.complianceRate}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
              <tr>
                <td className="p-2 border-r border-slate-200">TOTALS</td>
                {data.summary.monthlyBreakdown.map((mb) => (
                  <td key={mb.month} className="p-1 text-center border-r border-slate-200 text-emerald-600">
                    {naira(mb.collected)}
                  </td>
                ))}
                <td className="p-2 text-right text-emerald-600">{naira(data.summary.totalCollected)}</td>
                <td className="p-2 text-right text-rose-600">{naira(data.summary.totalOutstanding)}</td>
                <td className="p-2 text-center text-indigo-600">{data.summary.collectionRate}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Sign-off & Verification */}
        <div className="grid grid-cols-2 gap-8 pt-8 text-xs">
          <div className="space-y-6">
            <p className="font-bold text-slate-700">Prepared by:</p>
            <div className="border-b border-slate-400 w-48" />
            <p className="text-[11px] text-slate-500">Unit Financial Secretary / Admin</p>
          </div>
          <div className="space-y-6 text-right">
            <p className="font-bold text-slate-700">Approved by:</p>
            <div className="border-b border-slate-400 w-48 ml-auto" />
            <p className="text-[11px] text-slate-500">Head of Department / Executive Leadership</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// QUICK PAYMENT MODAL
// ----------------------------------------------------------------------------
function QuickPaymentModal({
  member,
  month,
  year,
  onClose,
  onDone,
}: {
  member: MemberMatrixRow;
  month?: MonthCell;
  year: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [selectedMonthNum, setSelectedMonthNum] = useState<number>(month?.month || 1);
  const [amount, setAmount] = useState<number>(month?.balance || 2000);
  const [channel, setChannel] = useState('TRANSFER');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const activeMonthCell = member.months.find((c) => c.month === selectedMonthNum) || month;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetchApi('/finance/payments/record', {
        method: 'POST',
        body: JSON.stringify({
          memberId: member.id,
          amount: Number(amount),
          channel,
          purpose: 'DUES',
          assignmentId: activeMonthCell?.assignmentId || undefined,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
          paidAt: new Date().toISOString(),
        }),
      });

      notify(`Payment of ${naira(amount)} recorded for ${member.name}.`, 'success');
      onDone();
    } catch (err: any) {
      notify(err.message || 'Could not record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record Dues Payment — ${member.name}`}
      description="Apply a confirmed dues payment towards a specific monthly period."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Record &amp; Confirm Payment</Button>
        </>
      }
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Member Code</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">{member.memberCode}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Current Balance Due</span>
            <span className="font-black text-rose-600">{naira(member.balanceDue)}</span>
          </div>
        </div>

        <Field label="Monthly Period">
          <select
            className={inputClass}
            value={selectedMonthNum}
            onChange={(e) => {
              const mNum = Number(e.target.value);
              setSelectedMonthNum(mNum);
              const mCell = member.months.find((c) => c.month === mNum);
              if (mCell && mCell.balance > 0) setAmount(mCell.balance);
            }}
          >
            {member.months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.monthName} {year} ({m.status === 'PAID' ? 'Fully Paid' : `Balance: ${naira(m.balance)}`})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount Paid (₦)" required>
            <input
              type="number"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={100}
              required
            />
          </Field>

          <Field label="Payment Method">
            <select className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="POS">POS Terminal</option>
              <option value="ONLINE">Online Portal</option>
            </select>
          </Field>
        </div>

        <Field label="Reference / Transaction ID (Optional)">
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. TXN-94829103"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>

        <Field label="Notes (Optional)">
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. Paid via Sunday offering basket"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// CREATE PERIOD MODAL
// ----------------------------------------------------------------------------
function CreatePeriodModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [defaultAmount, setDefaultAmount] = useState(2000);
  const [dueDate, setDueDate] = useState('');
  const [generate, setGenerate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await fetchApi('/finance/dues/periods', {
        method: 'POST',
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          defaultAmount: Number(defaultAmount),
          dueDate: dueDate || undefined,
          generate,
        }),
      });
      notify('Dues period created', 'success');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create period');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create Dues Period"
      description="Sets up a monthly dues target and assigns it to all active members."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year">
            <input type="number" className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2100} />
          </Field>
          <Field label="Month">
            <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Default amount (₦)" required>
          <input type="number" className={inputClass} value={defaultAmount} onChange={(e) => setDefaultAmount(Number(e.target.value))} min={0} step={100} />
        </Field>
        <Field label="Due date" hint="Defaults to the 5th of the month">
          <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="rounded" />
          <span>Automatically assign to all active members</span>
        </label>
        {err && <p role="alert" className="text-sm font-medium text-rose-600">{err}</p>}
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// CREATE SPECIAL CONTRIBUTION CAMPAIGN
// ----------------------------------------------------------------------------
function CreateCampaignModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [defaultAmount, setDefaultAmount] = useState(50000);
  const [dueDate, setDueDate] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [showAsAlert, setShowAsAlert] = useState(true);
  const [generate, setGenerate] = useState(true);
  const [accounts, setAccounts] = useState<{ id: string; bankName: string; accountNumber: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchApi<{ id: string; bankName: string; accountNumber: string }[]>('/finance/payment-accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return setErr('Give this contribution a title.');
    if (!dueDate) return setErr('Set a deadline.');
    setSaving(true);
    setErr('');
    try {
      await fetchApi('/finance/dues/periods', {
        method: 'POST',
        body: JSON.stringify({
          type: 'SPECIAL',
          label: label.trim(),
          description: description.trim() || undefined,
          defaultAmount: Number(defaultAmount),
          dueDate,
          paymentAccountId: paymentAccountId || undefined,
          showAsAlert,
          generate,
        }),
      });
      notify('Special contribution created', 'success');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the contribution');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New Special Contribution"
      description="A one-off drive (e.g. a Christmas Party fund) with its own deadline and bank account — separate from the recurring monthly dues."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" required>
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Christmas Party Contribution" maxLength={160} />
        </Field>
        <Field label="Message to members" hint="Shown on the dashboard alert and the member's dues page">
          <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Please make your ₦50,000 Christmas Party contribution before the deadline." />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount per member (₦)" required>
            <input type="number" className={inputClass} value={defaultAmount} onChange={(e) => setDefaultAmount(Number(e.target.value))} min={0} step={500} />
          </Field>
          <Field label="Deadline" required>
            <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Payment account" hint="Shown to members for this contribution specifically">
          <select className={inputClass} value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
            <option value="">Use the default accounts shown for monthly dues</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.bankName} — {a.accountNumber}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={showAsAlert} onChange={(e) => setShowAsAlert(e.target.checked)} className="rounded" />
          <span>Show as a daily dismissible pop-up on the member dashboard until paid</span>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="rounded" />
          <span>Automatically assign to all active members</span>
        </label>
        {err && <p role="alert" className="text-sm font-medium text-rose-600">{err}</p>}
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// SPECIAL CONTRIBUTION CAMPAIGN DETAIL
// ----------------------------------------------------------------------------
function CampaignDetailModal({ periodId, onClose, onChanged }: { periodId: string; onClose: () => void; onChanged: () => void }) {
  const { notify } = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setDetail(await fetchApi(`/finance/dues/periods/${periodId}`));
    } catch {
      notify('Could not load this contribution', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [periodId]);

  const toggleStatus = async () => {
    await fetchApi(`/finance/dues/periods/${periodId}/toggle-status`, { method: 'POST' });
    onChanged();
    void load();
  };

  const exempt = async (assignmentId: string) => {
    const reason = window.prompt('Reason for exempting this member?');
    if (!reason) return;
    setBusyId(assignmentId);
    try {
      await fetchApi(`/finance/dues/assignments/${assignmentId}/status`, { method: 'POST', body: JSON.stringify({ status: 'EXEMPT', reason }) });
      onChanged();
      void load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={detail?.period?.label ?? 'Special Contribution'} description={detail?.period?.description}>
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : !detail ? (
        <EmptyState title="Not found" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Expected</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{naira(detail.summary.expected)}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Collected</p>
              <p className="text-sm font-black text-emerald-600">{naira(detail.summary.collected)}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Outstanding</p>
              <p className="text-sm font-black text-rose-600">{naira(detail.summary.outstanding)}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Paid</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{detail.summary.paid} / {detail.summary.members}</p>
            </div>
          </div>

          {detail.period.paymentAccount && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-xs">
              <p className="font-bold text-slate-900 dark:text-white">{detail.period.paymentAccount.bankName}</p>
              <p>{detail.period.paymentAccount.accountName} · <span className="font-mono">{detail.period.paymentAccount.accountNumber}</span></p>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="secondary" onClick={toggleStatus}>
              {detail.period.status === 'OPEN' ? 'Close campaign' : 'Reopen campaign'}
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-bold text-slate-500">Member</th>
                  <th className="text-right p-2 font-bold text-slate-500">Due</th>
                  <th className="text-right p-2 font-bold text-slate-500">Paid</th>
                  <th className="text-left p-2 font-bold text-slate-500">Status</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {detail.assignments.map((a: any) => (
                  <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-2 text-slate-900 dark:text-white">{a.member.name}</td>
                    <td className="p-2 text-right">{naira(a.amountDue)}</td>
                    <td className="p-2 text-right">{naira(a.amountPaid)}</td>
                    <td className="p-2"><Badge>{a.status}</Badge></td>
                    <td className="p-2 text-right">
                      {!['EXEMPT', 'WAIVED', 'PAID'].includes(a.status) && (
                        <button
                          onClick={() => exempt(a.id)}
                          disabled={busyId === a.id}
                          className="text-[10px] font-bold text-indigo-600 hover:underline disabled:opacity-50"
                        >
                          Exempt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// SPREADSHEET IMPORT MODAL
// ----------------------------------------------------------------------------
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [directoryText, setDirectoryText] = useState('');
  const [duesText, setDuesText] = useState('');
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (apply: boolean) => {
    setErr('');
    setBusy(true);
    try {
      let dirReport: any = null;
      if (directoryText.trim()) {
        const rows = JSON.parse(directoryText).members ?? JSON.parse(directoryText);
        dirReport = await fetchApi('/members/import', { method: 'POST', body: JSON.stringify({ rows, apply }) });
      }
      let duesReport: any = null;
      if (duesText.trim()) {
        const payload = JSON.parse(duesText);
        duesReport = await fetchApi('/finance/dues/import', {
          method: 'POST',
          body: JSON.stringify({ ...payload, apply, createUnmatchedMembers: apply }),
        });
      }
      setReport({ dir: dirReport, dues: duesReport, applied: apply });
      if (apply) {
        notify('Import applied successfully', 'success');
        onDone();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed — check the JSON.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Import from Spreadsheet"
      description="Paste directory and/or dues-matrix JSON to seed multiple members and payment periods at once."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={() => run(false)} loading={busy}>Dry run</Button>
          <Button onClick={() => run(true)} loading={busy}>Apply</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Member directory JSON (optional)" hint="{ members: [{ firstName, lastName, email, phoneNumber, birthday, profession }] }">
          <textarea className={`${inputClass} font-mono text-xs`} rows={5} value={directoryText} onChange={(e) => setDirectoryText(e.target.value)} />
        </Field>
        <Field label="Dues matrix JSON (optional)" hint='{ year, defaultAmount, rows: [{ name, amount, paidMonths: [1,2,...] }] }'>
          <textarea className={`${inputClass} font-mono text-xs`} rows={5} value={duesText} onChange={(e) => setDuesText(e.target.value)} />
        </Field>
        {err && <p role="alert" className="text-sm font-medium text-rose-600">{err}</p>}
        {report && (
          <div className="space-y-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-xs">
            <p className="font-semibold">{report.applied ? 'Applied' : 'Dry run'}</p>
            {report.dir && <p>Directory — created {report.dir.created.length}, updated {report.dir.updated.length}, errors {report.dir.errors.length}</p>}
            {report.dues && (
              <>
                <p>
                  Dues — matched {report.dues.matched.length}, new members {report.dues.createdMembers.length}, payments {report.dues.paymentsWritten}
                </p>
                {report.dues.unmatched?.length > 0 && <p className="text-rose-600">Unmatched: {report.dues.unmatched.map((u: any) => u.name).join(', ')}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
