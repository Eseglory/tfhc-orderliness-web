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
  PieChart,
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
  Award,
  Receipt,
  FileSpreadsheet,
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
  PageLoader,
  CardSkeleton,
  TableSkeleton,
} from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ViewType = 'matrix' | 'list' | 'grid' | 'analytics';

interface MonthPayment {
  id: string;
  reference: string;
  amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  paidOn: string;
  method: string;
  payerReference?: string | null;
  description?: string | null;
  receiptUrl?: string | null;
  receiptName?: string | null;
}

interface MonthCell {
  month: number;
  monthName: string;
  periodId: string | null;
  assignmentId: string | null;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status:
    | 'PAID'
    | 'PARTIALLY_PAID'
    | 'OUTSTANDING'
    | 'OVERDUE'
    | 'EXEMPT'
    | 'WAIVED'
    | 'NOT_ASSIGNED'
    | 'NOT_CREATED'
    | 'PENDING_VERIFICATION';
  storedStatus?: string;
  dueDate: string | null;
  note?: string | null;
  hasPendingPayment?: boolean;
  payments?: MonthPayment[];
}

interface MemberMatrixRow {
  id: string;
  memberId?: string;
  firstName: string;
  lastName: string;
  name: string;
  memberCode: string;
  email: string | null;
  phone: string | null;
  status: string;
  category: 'Executive' | 'Regular';
  monthlyRate: number;
  monthsAssessed: number;
  monthsPaidCount: number;
  monthsUnpaidCount: number;
  monthsWaivedCount: number;
  monthsRemaining: number;
  totalExpected: number;
  totalPaid: number;
  totalOutstanding: number;
  balanceDue: number;
  totalWaived: number;
  completionRate: number;
  complianceRate: number;
  classification: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'NEVER_PAID' | 'WAIVED';
  isOutstanding: boolean;
  assignedMonthsCount: number;
  overallStatus?: string;
  months: MonthCell[];
}

interface PerformanceGroup {
  count: number;
  expected: number;
  collected: number;
  outstanding: number;
  waived: number;
  collectionRate: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  neverPaidCount: number;
  waivedCount: number;
}

interface MatrixSummary {
  totalMembers: number;
  totalExecutiveMembers: number;
  totalRegularMembers: number;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  totalWaived: number;
  collectionRate: number;
  fullyPaidMembersCount: number;
  partiallyPaidMembersCount: number;
  neverPaidMembersCount: number;
  waivedMembersCount: number;
  outstandingMembersCount: number;
  partialMembersCount?: number;
  zeroPaidMembersCount?: number;
  executivePerformance?: PerformanceGroup;
  regularPerformance?: PerformanceGroup;
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
    waived?: number;
    collectionRate: number;
    paidCount: number;
    partialCount: number;
    overdueCount: number;
    outstandingCount: number;
    waivedCount?: number;
    totalAssigned: number;
    cumulativeExpected?: number;
    cumulativeCollected?: number;
  }>;
  cumulativeTrends?: Array<{
    month: number;
    monthName: string;
    cumulativeExpected: number;
    cumulativeCollected: number;
  }>;
  highestCollectionMonth?: { month: number; monthName: string; amount: number } | null;
  lowestCollectionMonth?: { month: number; monthName: string; amount: number } | null;
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

  // Filter states (Sections 8.A, 8.E)
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'Executive' | 'Regular'>('ALL');
  const [classificationFilter, setClassificationFilter] = useState<
    'ALL' | 'FULLY_PAID' | 'PARTIALLY_PAID' | 'NEVER_PAID' | 'WAIVED' | 'OUTSTANDING'
  >('ALL');
  const [sortBy, setSortBy] = useState<
    'name_asc' | 'name_desc' | 'paid_desc' | 'balance_desc' | 'compliance_desc' | 'rate_desc' | 'category_asc'
  >('name_asc');

  // Modals
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [viewingCampaignId, setViewingCampaignId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState<{ member: MemberMatrixRow; month?: MonthCell } | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedMemberForDrillDown, setSelectedMemberForDrillDown] = useState<MemberMatrixRow | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<{ url: string; name: string } | null>(null);

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
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have permission to view dues.'
          : 'Could not load annual dues data.'
      );
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

      // 2. Category Filter (Executive vs Regular)
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) {
        return false;
      }

      // 3. Classification / Status Filter (Section 8.A, 8.E)
      if (classificationFilter !== 'ALL') {
        if (classificationFilter === 'OUTSTANDING') {
          if (!m.isOutstanding && m.balanceDue <= 0) return false;
        } else if (classificationFilter === 'WAIVED') {
          if (m.classification !== 'WAIVED' && m.monthsWaivedCount === 0) return false;
        } else if (m.classification !== classificationFilter) {
          return false;
        }
      }

      // 4. Month-specific status filter
      if (selectedMonth !== 'all') {
        const monthCell = m.months.find((c) => c.month === selectedMonth);
        if (statusFilter && monthCell?.status !== statusFilter) return false;
      } else if (statusFilter) {
        // Full year filter: member has at least one month matching status
        const hasMatchingMonth = m.months.some((c) => c.status === statusFilter);
        if (!hasMatchingMonth) return false;
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
      if (sortBy === 'rate_desc') return b.monthlyRate - a.monthlyRate;
      if (sortBy === 'category_asc') return a.category.localeCompare(b.category);
      return 0;
    });

    return list;
  }, [data, search, selectedMonth, statusFilter, categoryFilter, classificationFilter, sortBy]);

  const handleExportCSV = () => {
    if (!data || filteredMembers.length === 0) return;
    const headers = [
      'Member Code',
      'Full Name',
      'Membership Category',
      'Monthly Rate (NGN)',
      'Assessed Months',
      'Paid Months',
      'Unpaid Months',
      'Waived Months',
      'Total Expected (NGN)',
      'Total Paid (NGN)',
      'Outstanding Balance (NGN)',
      'Total Waived (NGN)',
      'Completion %',
      'Classification',
      'Phone',
      'Email',
      ...MONTHS,
    ];
    const rows = filteredMembers.map((m) => {
      const monthCols = m.months.map((cell) => {
        if (cell.status === 'PAID') return `"PAID (${naira(cell.amountPaid)})"`;
        if (cell.status === 'WAIVED') return `"WAIVED"`;
        if (cell.status === 'PENDING_VERIFICATION') return `"PENDING_VERIFICATION"`;
        return `"${cell.status}"`;
      });
      return [
        `"${m.memberCode || ''}"`,
        `"${m.name}"`,
        `"${m.category}"`,
        `"${m.monthlyRate}"`,
        `"${m.monthsAssessed}"`,
        `"${m.monthsPaidCount}"`,
        `"${m.monthsUnpaidCount}"`,
        `"${m.monthsWaivedCount}"`,
        `"${m.totalExpected}"`,
        `"${m.totalPaid}"`,
        `"${m.balanceDue}"`,
        `"${m.totalWaived}"`,
        `"${m.complianceRate}%"`,
        `"${m.classification}"`,
        `"${m.phone || ''}"`,
        `"${m.email || ''}"`,
        ...monthCols,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `TFHC_Monthly_Dues_Report_${year}.csv`);
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

        {/* Loading State Skeleton & Loader */}
        {loading && !data ? (
          <div className="space-y-4">
            <CardSkeleton count={4} />
            <PageLoader
              message="Loading annual dues matrix…"
              description="Calculating 12-month member records, payments, and compliance"
              minHeight={260}
            />
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : null}

        {/* Top Executive KPI Cards (Section 8.C) */}
        {data?.summary && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* Total Members */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Members Roster</span>
                  <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <Users className="w-4 h-4" />
                  </span>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
                  {data.summary.totalMembers} <span className="text-xs font-semibold text-slate-400 font-normal">Members</span>
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium mt-1">
                  <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold">
                    {data.summary.totalExecutiveMembers || 0} Exec (₦2.5k)
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                    {data.summary.totalRegularMembers || 0} Reg (₦2k)
                  </span>
                </div>
              </div>

              {/* Total Expected */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Expected</span>
                  <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Calendar className="w-4 h-4" />
                  </span>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
                  {naira(data.summary.totalExpected)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Excludes waived months from assessed dues
                </p>
              </div>

              {/* Total Collected */}
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
                <p className="text-[10px] text-emerald-600 font-bold mt-1">
                  {data.summary.collectionRate}% collected to date
                </p>
              </div>

              {/* Outstanding Balance */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Outstanding Arrears</span>
                  <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                    <AlertCircle className="w-4 h-4" />
                  </span>
                </div>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-2">
                  {naira(data.summary.totalOutstanding)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {data.summary.outstandingMembersCount ||
                    data.summary.partiallyPaidMembersCount + data.summary.neverPaidMembersCount}{' '}
                  members with arrears
                </p>
              </div>

              {/* Total Waived */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Total Waived</span>
                  <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                </div>
                <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-2">
                  {naira(data.summary.totalWaived || 0)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {data.summary.waivedMembersCount || 0} members with waived months
                </p>
              </div>
            </div>

            {/* Member Payment Classification Quick Bar (Section 8.A) */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Member Payment Classification:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setClassificationFilter(classificationFilter === 'FULLY_PAID' ? 'ALL' : 'FULLY_PAID')}
                  className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    classificationFilter === 'FULLY_PAID'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Fully Paid: {data.summary.fullyPaidMembersCount}</span>
                </button>

                <button
                  onClick={() =>
                    setClassificationFilter(classificationFilter === 'PARTIALLY_PAID' ? 'ALL' : 'PARTIALLY_PAID')
                  }
                  className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    classificationFilter === 'PARTIALLY_PAID'
                      ? 'bg-amber-600 text-white shadow'
                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Partially Paid: {data.summary.partiallyPaidMembersCount}</span>
                </button>

                <button
                  onClick={() => setClassificationFilter(classificationFilter === 'NEVER_PAID' ? 'ALL' : 'NEVER_PAID')}
                  className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    classificationFilter === 'NEVER_PAID'
                      ? 'bg-rose-600 text-white shadow'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Never Paid: {data.summary.neverPaidMembersCount}</span>
                </button>

                <button
                  onClick={() => setClassificationFilter(classificationFilter === 'WAIVED' ? 'ALL' : 'WAIVED')}
                  className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    classificationFilter === 'WAIVED'
                      ? 'bg-yellow-600 text-white shadow'
                      : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300 hover:bg-yellow-100'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Waived: {data.summary.waivedMembersCount}</span>
                </button>

                <button
                  onClick={() =>
                    setClassificationFilter(classificationFilter === 'OUTSTANDING' ? 'ALL' : 'OUTSTANDING')
                  }
                  className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    classificationFilter === 'OUTSTANDING'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>
                    Outstanding: {data.summary.outstandingMembersCount ||
                      data.summary.partiallyPaidMembersCount + data.summary.neverPaidMembersCount}
                  </span>
                </button>

                {classificationFilter !== 'ALL' && (
                  <button
                    onClick={() => setClassificationFilter('ALL')}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ml-1"
                  >
                    Reset
                  </button>
                )}
              </div>
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

          {/* Multi-Criteria Filters Row (Sections 8.A, 8.E) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
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

            {/* Category Filter (Executive vs Regular) */}
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="ALL">All Categories</option>
                <option value="Executive">Executive (₦2,500/mo)</option>
                <option value="Regular">Regular (₦2,000/mo)</option>
              </select>
            </div>

            {/* Payment Classification Filter (Section 8.A) */}
            <div>
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="ALL">All Classifications</option>
                <option value="FULLY_PAID">Fully Paid (100%)</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="NEVER_PAID">Never Paid (0 Paid)</option>
                <option value="WAIVED">Waived Months</option>
                <option value="OUTSTANDING">Outstanding Arrears</option>
              </select>
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
                  <option key={idx + 1} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Criteria */}
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="name_asc">Sort: Name (A to Z)</option>
                <option value="name_desc">Sort: Name (Z to A)</option>
                <option value="paid_desc">Sort: Highest Paid</option>
                <option value="balance_desc">Sort: Highest Arrears</option>
                <option value="compliance_desc">Sort: Completion %</option>
                <option value="rate_desc">Sort: Monthly Rate</option>
                <option value="category_asc">Sort: Category</option>
              </select>
            </div>
          </div>

          {/* Active Filter Chips & Reset */}
          {(search ||
            categoryFilter !== 'ALL' ||
            classificationFilter !== 'ALL' ||
            selectedMonth !== 'all' ||
            statusFilter) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold">Active Filters:</span>
              {categoryFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-medium text-[11px]">
                  Category: {categoryFilter}
                </span>
              )}
              {classificationFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium text-[11px]">
                  Classification: {classificationFilter.replace('_', ' ')}
                </span>
              )}
              {selectedMonth !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium text-[11px]">
                  Month: {MONTHS[Number(selectedMonth) - 1]}
                </span>
              )}
              {search && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                  &quot;{search}&quot;
                </span>
              )}
              <button
                onClick={() => {
                  setSearch('');
                  setCategoryFilter('ALL');
                  setClassificationFilter('ALL');
                  setSelectedMonth('all');
                  setStatusFilter('');
                }}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-auto cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 1: 12-MONTH SPREADSHEET MATRIX VIEW (Sections 7, 8.A, 8.B)     */}
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
                  Click any member name to open individual financial history, or click an unpaid cell to record payment.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Paid
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Waived
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Partial
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Unpaid
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Pending
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3.5 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 min-w-[210px] border-r border-slate-200/60 dark:border-slate-700/60">
                      MEMBER &amp; CATEGORY
                    </th>
                    {SHORT_MONTHS.map((m, idx) => (
                      <th
                        key={idx}
                        className="px-2 py-3.5 text-center min-w-[82px] border-r border-slate-100 dark:border-slate-800/80"
                      >
                        {m}
                      </th>
                    ))}
                    <th className="px-3 py-3.5 text-right font-bold text-slate-600 min-w-[90px]">EXPECTED</th>
                    <th className="px-3 py-3.5 text-right font-bold text-emerald-600 min-w-[90px]">PAID</th>
                    <th className="px-3 py-3.5 text-right font-bold text-rose-600 min-w-[90px]">BALANCE</th>
                    <th className="px-3 py-3.5 text-right font-bold text-amber-600 min-w-[85px]">WAIVED</th>
                    <th className="px-3 py-3.5 text-center min-w-[75px]">RATE</th>
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
                          <div className="flex items-center gap-2.5 min-w-[190px]">
                            <button
                              onClick={() => setSelectedMemberForDrillDown(m)}
                              className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-black flex items-center justify-center text-[10px] ring-1 ring-indigo-200 dark:ring-indigo-800 shrink-0 hover:scale-105 transition-transform cursor-pointer"
                              title="Click for full breakdown"
                            >
                              {m.firstName?.[0] || 'M'}
                              {m.lastName?.[0] || ''}
                            </button>
                            <div className="min-w-0">
                              <button
                                onClick={() => setSelectedMemberForDrillDown(m)}
                                className="font-extrabold text-slate-900 dark:text-white truncate text-xs hover:text-indigo-600 dark:hover:text-indigo-400 text-left block cursor-pointer"
                              >
                                {m.name}
                              </button>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                                    m.category === 'Executive'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                >
                                  {m.category} (₦{(m.monthlyRate / 1000).toFixed(1)}k)
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 12 Month Cells */}
                        {m.months.map((cell) => {
                          const isPaid = cell.status === 'PAID';
                          const isWaived = cell.status === 'WAIVED' || cell.status === 'EXEMPT';
                          const isPending = cell.status === 'PENDING_VERIFICATION';
                          const isPartial = cell.status === 'PARTIALLY_PAID';
                          const isUnpaid = cell.status === 'OVERDUE' || cell.status === 'OUTSTANDING';

                          let cellStyle = 'bg-slate-50/50 text-slate-400 dark:bg-slate-800/30';
                          if (isPaid)
                            cellStyle =
                              'bg-emerald-50/80 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 ring-1 ring-emerald-300/60 hover:bg-emerald-100';
                          else if (isWaived)
                            cellStyle =
                              'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/80 dark:text-yellow-300 ring-1 ring-yellow-400/80 font-black';
                          else if (isPending)
                            cellStyle =
                              'bg-blue-100 text-blue-900 dark:bg-blue-950/80 dark:text-blue-300 ring-1 ring-blue-400/80 font-bold';
                          else if (isPartial)
                            cellStyle =
                              'bg-amber-50/90 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-amber-300/80 hover:bg-amber-100';
                          else if (isUnpaid)
                            cellStyle =
                              'bg-rose-50/90 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 ring-1 ring-rose-200/80 hover:bg-rose-100';

                          return (
                            <td
                              key={cell.month}
                              className="px-1 py-1.5 text-center border-r border-slate-100 dark:border-slate-800/80"
                            >
                              <button
                                onClick={() => {
                                  if (isUnpaid && canManage) {
                                    setPaymentModalData({ member: m, month: cell });
                                  } else {
                                    setSelectedMemberForDrillDown(m);
                                  }
                                }}
                                className={`w-full py-1 px-1 rounded-lg text-[10px] font-bold transition-all ${cellStyle} cursor-pointer hover:scale-105 active:scale-95`}
                                title={`${m.name} — ${cell.monthName} ${year}\nStatus: ${cell.status}\nPaid: ${naira(
                                  cell.amountPaid
                                )} / Rate: ${naira(m.monthlyRate)}`}
                              >
                                {isPaid ? (
                                  <span className="flex items-center justify-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                    <span>{naira(cell.amountPaid)}</span>
                                  </span>
                                ) : isWaived ? (
                                  <span className="text-yellow-800 dark:text-yellow-300 font-extrabold">WAIVED</span>
                                ) : isPending ? (
                                  <span className="text-blue-700 dark:text-blue-300 font-bold">Pending</span>
                                ) : isPartial ? (
                                  <span>{naira(cell.amountPaid)}</span>
                                ) : isUnpaid ? (
                                  <span className="flex items-center justify-center gap-0.5 text-rose-700">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    <span>Unpaid</span>
                                  </span>
                                ) : (
                                  <span>—</span>
                                )}
                              </button>
                            </td>
                          );
                        })}

                        {/* Expected, Paid, Balance, Waived, Rate */}
                        <td className="px-3 py-2 text-right font-bold text-slate-700 dark:text-slate-300">
                          {naira(m.totalExpected)}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {naira(m.totalPaid)}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-rose-600 dark:text-rose-400">
                          {naira(m.balanceDue)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-amber-600 dark:text-amber-400">
                          {naira(m.totalWaived)}
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
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setSelectedMemberForDrillDown(m)}
                              className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="View Member Breakdown"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canManage && (
                              <button
                                onClick={() => setPaymentModalData({ member: m })}
                                className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Record Payment"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={19} className="px-6 py-12 text-center text-slate-500">
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
                        <td
                          key={mb.month}
                          className="px-1 py-3 text-center border-r border-slate-200 dark:border-slate-700/80"
                        >
                          <div className="text-emerald-600 dark:text-emerald-400">{naira(mb.collected)}</div>
                          <div className="text-[9px] text-slate-400 font-medium">{mb.collectionRate}%</div>
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-slate-700 font-extrabold">
                        {naira(data.summary.totalExpected)}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-600 font-extrabold">
                        {naira(data.summary.totalCollected)}
                      </td>
                      <td className="px-3 py-3 text-right text-rose-600 font-extrabold">
                        {naira(data.summary.totalOutstanding)}
                      </td>
                      <td className="px-3 py-3 text-right text-amber-600 font-extrabold">
                        {naira(data.summary.totalWaived || 0)}
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
        {/* VIEW 2: TABULAR LIST VIEW (Section 8.B)                            */}
        {/* ------------------------------------------------------------------ */}
        {viewType === 'list' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3.5">MEMBER</th>
                    <th className="px-3 py-3.5">CATEGORY</th>
                    <th className="px-4 py-3.5">ASSESSMENT BREAKDOWN</th>
                    <th className="px-3 py-3.5 text-right">EXPECTED</th>
                    <th className="px-3 py-3.5 text-right">PAID</th>
                    <th className="px-3 py-3.5 text-right">BALANCE DUE</th>
                    <th className="px-3 py-3.5 text-right">WAIVED</th>
                    <th className="px-4 py-3.5">COMPLETION</th>
                    <th className="px-3 py-3.5 text-center">STATUS</th>
                    <th className="px-3 py-3.5 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setSelectedMemberForDrillDown(m)}
                              className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center text-xs ring-1 ring-indigo-200 dark:ring-indigo-800 shrink-0 hover:scale-105 cursor-pointer"
                            >
                              {m.firstName?.[0] || 'M'}
                              {m.lastName?.[0] || ''}
                            </button>
                            <div>
                              <button
                                onClick={() => setSelectedMemberForDrillDown(m)}
                                className="font-extrabold text-slate-900 dark:text-white hover:text-indigo-600 text-left block cursor-pointer"
                              >
                                {m.name}
                              </button>
                              <span className="font-mono text-[10px] text-indigo-600 font-bold">{m.memberCode}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              m.category === 'Executive'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {m.category} (₦{m.monthlyRate.toLocaleString()})
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {m.monthsPaidCount} Paid
                            </span>
                            <span className="text-slate-300">&bull;</span>
                            <span className="font-bold text-rose-600">{m.monthsUnpaidCount} Unpaid</span>
                            {m.monthsWaivedCount > 0 && (
                              <>
                                <span className="text-slate-300">&bull;</span>
                                <span className="font-bold text-amber-600">{m.monthsWaivedCount} Waived</span>
                              </>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">12 Months Assessed</span>
                        </td>
                        <td className="px-3 py-3.5 text-right font-semibold text-slate-700 dark:text-slate-300">
                          {naira(m.totalExpected)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {naira(m.totalPaid)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-black text-rose-600 dark:text-rose-400">
                          {naira(m.balanceDue)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-bold text-amber-600 dark:text-amber-400">
                          {naira(m.totalWaived)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-extrabold text-indigo-600">{m.complianceRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  m.complianceRate === 100
                                    ? 'bg-emerald-500'
                                    : m.complianceRate > 50
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                }`}
                                style={{ width: `${m.complianceRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              m.classification === 'FULLY_PAID'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : m.classification === 'PARTIALLY_PAID'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : m.classification === 'WAIVED'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {m.classification.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedMemberForDrillDown(m)}
                              className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                            >
                              History
                            </button>
                            {canManage && (
                              <button
                                onClick={() => setPaymentModalData({ member: m })}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 transition-colors cursor-pointer"
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
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
                    <button
                      onClick={() => setSelectedMemberForDrillDown(m)}
                      className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black flex items-center justify-center text-sm ring-1 ring-indigo-200 dark:ring-indigo-800 shrink-0 hover:scale-105 cursor-pointer"
                    >
                      {m.firstName?.[0] || 'M'}
                      {m.lastName?.[0] || ''}
                    </button>
                    <div>
                      <button
                        onClick={() => setSelectedMemberForDrillDown(m)}
                        className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight hover:text-indigo-600 text-left cursor-pointer"
                      >
                        {m.name}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-400">{m.memberCode}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                            m.category === 'Executive'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {m.category} (₦{m.monthlyRate.toLocaleString()})
                        </span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      m.classification === 'FULLY_PAID'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : m.classification === 'PARTIALLY_PAID'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : m.classification === 'WAIVED'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {m.classification.replace('_', ' ')}
                  </span>
                </div>

                {/* Financial Overview Chips */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Expected</span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {naira(m.totalExpected)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Paid</span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {naira(m.totalPaid)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Balance</span>
                    <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                      {naira(m.balanceDue)}
                    </span>
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
                      const isWaived = cell.status === 'WAIVED' || cell.status === 'EXEMPT';
                      const isPartial = cell.status === 'PARTIALLY_PAID';
                      const isOverdue = cell.status === 'OVERDUE' || cell.status === 'OUTSTANDING';

                      let badgeBg = 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500';
                      if (isPaid) badgeBg = 'bg-emerald-500 text-white';
                      else if (isWaived) badgeBg = 'bg-yellow-400 text-yellow-950 font-black';
                      else if (isPartial) badgeBg = 'bg-amber-500 text-white';
                      else if (isOverdue) badgeBg = 'bg-rose-500 text-white';

                      return (
                        <button
                          key={cell.month}
                          onClick={() => {
                            if (isOverdue && canManage) {
                              setPaymentModalData({ member: m, month: cell });
                            } else {
                              setSelectedMemberForDrillDown(m);
                            }
                          }}
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
                    onClick={() => setSelectedMemberForDrillDown(m)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
                  >
                    View History
                  </button>
                  {canManage && (
                    <button
                      onClick={() => setPaymentModalData({ member: m })}
                      className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                    >
                      Record Payment
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 4: ANALYTICS, GRAPHS & REPORTING (Section 8.D)                 */}
        {/* ------------------------------------------------------------------ */}
        {viewType === 'analytics' && data?.summary && (
          <div className="space-y-6">
            {/* 1. Monthly Revenue Collection Trend Bar Chart (Expected vs Actual Collected) */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                    <span>Monthly Expected vs. Actual Collections ({year})</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Comparative breakdown of monthly expected contributions against actual collections across all 12 months.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-emerald-500" /> Actual Collected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700" /> Expected
                  </span>
                </div>
              </div>

              {/* Highlights: Highest & Lowest Collection Months */}
              {(data.summary.highestCollectionMonth || data.summary.lowestCollectionMonth) && (
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                  {data.summary.highestCollectionMonth && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span>
                        <strong>Highest Collection:</strong> {data.summary.highestCollectionMonth.monthName} (
                        {naira(data.summary.highestCollectionMonth.amount)})
                      </span>
                    </div>
                  )}
                  {data.summary.lowestCollectionMonth && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>
                        <strong>Lowest Collection:</strong> {data.summary.lowestCollectionMonth.monthName} (
                        {naira(data.summary.lowestCollectionMonth.amount)})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Bar Chart Visualization */}
              <div className="grid grid-cols-12 gap-2 pt-6 pb-2 items-end h-64 border-b border-slate-100 dark:border-slate-800">
                {data.summary.monthlyBreakdown.map((mb) => {
                  const maxAmount = Math.max(
                    ...data.summary.monthlyBreakdown.map((x) => Math.max(x.expected || 0, x.collected || 0)),
                    80000
                  );
                  const expectedHeight = Math.min(100, Math.round(((mb.expected || 0) / maxAmount) * 100));
                  const collectedHeight = Math.min(100, Math.round(((mb.collected || 0) / maxAmount) * 100));

                  return (
                    <div key={mb.month} className="flex flex-col items-center justify-end h-full group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-16 z-20 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] py-1.5 px-2.5 rounded-xl shadow-xl whitespace-nowrap pointer-events-none">
                        <span className="font-bold">{mb.monthName}</span>
                        <span>Collected: {naira(mb.collected)}</span>
                        <span>Expected: {naira(mb.expected)}</span>
                        <span className="text-emerald-400 font-extrabold">Rate: {mb.collectionRate}%</span>
                        {mb.waivedCount ? <span className="text-yellow-300">{mb.waivedCount} waived</span> : null}
                      </div>

                      {/* Bar columns side by side */}
                      <div className="w-full max-w-[36px] flex items-end justify-center gap-1 h-full">
                        <div
                          className="w-1/2 rounded-t-lg bg-slate-200 dark:bg-slate-700 transition-all duration-500"
                          style={{ height: `${Math.max(4, expectedHeight)}%` }}
                          title={`Expected: ${naira(mb.expected)}`}
                        />
                        <div
                          className="w-1/2 rounded-t-lg bg-emerald-500 transition-all duration-500"
                          style={{ height: `${Math.max(4, collectedHeight)}%` }}
                          title={`Collected: ${naira(mb.collected)}`}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 mt-2">{SHORT_MONTHS[mb.month - 1]}</span>
                      <span className="text-[9px] font-extrabold text-emerald-600">{mb.collectionRate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Cumulative Collection Velocity Trajectory */}
            {data.summary.cumulativeTrends && data.summary.cumulativeTrends.length > 0 && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-600" />
                      <span>Cumulative Collection Trajectory</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Accumulated annual inflow over time compared against cumulative assessed dues.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-1.5 pt-4 items-end h-44 border-b border-slate-100 dark:border-slate-800">
                  {data.summary.cumulativeTrends.map((ct) => {
                    const maxCumulative =
                      data.summary.cumulativeTrends![data.summary.cumulativeTrends!.length - 1].cumulativeExpected || 1;
                    const expPct = Math.min(100, Math.round((ct.cumulativeExpected / maxCumulative) * 100));
                    const colPct = Math.min(100, Math.round((ct.cumulativeCollected / maxCumulative) * 100));

                    return (
                      <div key={ct.month} className="flex flex-col items-center justify-end h-full group relative">
                        <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] py-1 px-2 rounded-lg shadow-xl whitespace-nowrap pointer-events-none">
                          <span>{ct.monthName}</span>
                          <span>Inflow: {naira(ct.cumulativeCollected)}</span>
                        </div>
                        <div className="w-full max-w-[28px] flex items-end gap-1 h-full">
                          <div
                            className="w-full rounded-t-lg bg-indigo-500 transition-all duration-500"
                            style={{ height: `${Math.max(4, colPct)}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 mt-2">{SHORT_MONTHS[ct.month - 1]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Executive vs Regular Performance Comparison (Section 8.D) */}
            {data.summary.executivePerformance && data.summary.regularPerformance && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Executive Performance */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-slate-900 border border-purple-200/80 dark:border-purple-800/60 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                        <Award className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white">
                          Executive Members Performance
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          ₦2,500/month &bull; {data.summary.executivePerformance.count} Members
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                      {data.summary.executivePerformance.collectionRate}% Collected
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-purple-100 dark:border-purple-900/50">
                      <span className="text-[10px] text-slate-400 font-semibold block">Expected</span>
                      <span className="font-black text-slate-900 dark:text-white">
                        {naira(data.summary.executivePerformance.expected)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-purple-100 dark:border-purple-900/50">
                      <span className="text-[10px] text-slate-400 font-semibold block">Collected</span>
                      <span className="font-black text-emerald-600">
                        {naira(data.summary.executivePerformance.collected)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-purple-100 dark:border-purple-900/50">
                      <span className="text-[10px] text-slate-400 font-semibold block">Outstanding</span>
                      <span className="font-black text-rose-600">
                        {naira(data.summary.executivePerformance.outstanding)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
                    <span>
                      Fully Paid: <strong>{data.summary.executivePerformance.fullyPaidCount}</strong>
                    </span>
                    <span>
                      In Arrears:{' '}
                      <strong>
                        {data.summary.executivePerformance.partiallyPaidCount +
                          data.summary.executivePerformance.neverPaidCount}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Regular Performance */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50/50 to-white dark:from-slate-800/30 dark:to-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white">
                          Regular Members Performance
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          ₦2,000/month &bull; {data.summary.regularPerformance.count} Members
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                      {data.summary.regularPerformance.collectionRate}% Collected
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold block">Expected</span>
                      <span className="font-black text-slate-900 dark:text-white">
                        {naira(data.summary.regularPerformance.expected)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold block">Collected</span>
                      <span className="font-black text-emerald-600">
                        {naira(data.summary.regularPerformance.collected)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold block">Outstanding</span>
                      <span className="font-black text-rose-600">
                        {naira(data.summary.regularPerformance.outstanding)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
                    <span>
                      Fully Paid: <strong>{data.summary.regularPerformance.fullyPaidCount}</strong>
                    </span>
                    <span>
                      In Arrears:{' '}
                      <strong>
                        {data.summary.regularPerformance.partiallyPaidCount +
                          data.summary.regularPerformance.neverPaidCount}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Payment Status Distribution & Contributions Breakdown (Pie / Donut Visuals) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Member Payment Status Distribution */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h4 className="font-black text-sm text-slate-900 dark:text-white">
                        Member Status Distribution
                      </h4>
                      <p className="text-[11px] text-slate-400">Roster categorisation by payment compliance</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-500">{data.summary.totalMembers} Members</span>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      label: 'Fully Paid (100% Settled)',
                      count: data.summary.fullyPaidMembersCount,
                      color: 'bg-emerald-500',
                      textColor: 'text-emerald-700 dark:text-emerald-300',
                    },
                    {
                      label: 'Partially Paid (In Progress)',
                      count: data.summary.partiallyPaidMembersCount,
                      color: 'bg-amber-500',
                      textColor: 'text-amber-700 dark:text-amber-300',
                    },
                    {
                      label: 'Never Paid (0 Payments)',
                      count: data.summary.neverPaidMembersCount,
                      color: 'bg-rose-500',
                      textColor: 'text-rose-700 dark:text-rose-300',
                    },
                    {
                      label: 'Waived Members',
                      count: data.summary.waivedMembersCount,
                      color: 'bg-yellow-400',
                      textColor: 'text-yellow-800 dark:text-yellow-300',
                    },
                  ].map((item) => {
                    const pct = data.summary.totalMembers
                      ? Math.round((item.count / data.summary.totalMembers) * 100)
                      : 0;
                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                            {item.label}
                          </span>
                          <span className={`font-black ${item.textColor}`}>
                            {item.count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial Contributions Split */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h4 className="font-black text-sm text-slate-900 dark:text-white">Contributions Split</h4>
                      <p className="text-[11px] text-slate-400">Total volume of paid, outstanding, and waived dues</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-500">
                    Total: {naira(data.summary.totalExpected + (data.summary.totalWaived || 0))}
                  </span>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      label: 'Collected Contributions',
                      amount: data.summary.totalCollected,
                      color: 'bg-emerald-500',
                      textColor: 'text-emerald-600',
                    },
                    {
                      label: 'Outstanding Arrears',
                      amount: data.summary.totalOutstanding,
                      color: 'bg-rose-500',
                      textColor: 'text-rose-600',
                    },
                    {
                      label: 'Waived Contributions',
                      amount: data.summary.totalWaived || 0,
                      color: 'bg-yellow-400',
                      textColor: 'text-yellow-700',
                    },
                  ].map((item) => {
                    const totalVolume = data.summary.totalExpected + (data.summary.totalWaived || 0);
                    const pct = totalVolume ? Math.round((item.amount / totalVolume) * 100) : 0;
                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                            {item.label}
                          </span>
                          <span className={`font-black ${item.textColor}`}>
                            {naira(item.amount)} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 5. Defaulter & Arrears Analysis Table */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <div>
                    <h4 className="font-black text-sm text-slate-900 dark:text-white">
                      Outstanding Arrears &amp; Defaulter List
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Members with pending monthly contributions requiring follow-up
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  {data.summary.outstandingMembersCount ||
                    data.summary.partiallyPaidMembersCount + data.summary.neverPaidMembersCount}{' '}
                  Members
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                {filteredMembers
                  .filter((m) => m.balanceDue > 0)
                  .sort((a, b) => b.balanceDue - a.balanceDue)
                  .map((m) => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSelectedMemberForDrillDown(m)}
                          className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 font-black flex items-center justify-center text-xs"
                        >
                          {m.firstName?.[0]}
                          {m.lastName?.[0]}
                        </button>
                        <div>
                          <button
                            onClick={() => setSelectedMemberForDrillDown(m)}
                            className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 text-left block"
                          >
                            {m.name}
                          </button>
                          <span className="text-[10px] text-slate-400">
                            {m.category} &bull; {m.monthsUnpaidCount} unpaid months &bull;{' '}
                            {m.phone || m.email || 'No contact'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="font-black text-rose-600 text-xs block">{naira(m.balanceDue)} due</span>
                        {canManage && (
                          <button
                            onClick={() => setPaymentModalData({ member: m })}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 cursor-pointer"
                          >
                            Record Pay
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL: INDIVIDUAL MEMBER FINANCIAL DRILL-DOWN (Section 8.B)        */}
        {/* ------------------------------------------------------------------ */}
        {selectedMemberForDrillDown && (
          <MemberDetailModal
            member={selectedMemberForDrillDown}
            year={year}
            canManage={canManage}
            onClose={() => setSelectedMemberForDrillDown(null)}
            onRecordPay={(m, cell) => {
              setSelectedMemberForDrillDown(null);
              setPaymentModalData({ member: m, month: cell });
            }}
            onViewReceipt={(url, name) => setActiveReceipt({ url, name })}
          />
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL: PROOF OF PAYMENT RECEIPT VIEWER                              */}
        {/* ------------------------------------------------------------------ */}
        {activeReceipt && (
          <AdminReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
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
      title={`Executive Financial Administration Report — ${year}`}
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
            <p className="text-[11px] text-slate-500">Official Annual Membership Dues &amp; Compliance Audit Report ({year})</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-slate-700">Date Generated:</p>
            <p className="text-slate-500">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Total Roster: {data.summary.totalMembers} Members</p>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-5 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
          <div>
            <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Expected</span>
            <span className="text-sm font-black text-slate-900">{naira(data.summary.totalExpected)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-emerald-600 uppercase block">Total Collected</span>
            <span className="text-sm font-black text-emerald-600">{naira(data.summary.totalCollected)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-rose-600 uppercase block">Total Outstanding</span>
            <span className="text-sm font-black text-rose-600">{naira(data.summary.totalOutstanding)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-amber-600 uppercase block">Total Waived</span>
            <span className="text-sm font-black text-amber-600">{naira(data.summary.totalWaived || 0)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-indigo-600 uppercase block">Collection Rate</span>
            <span className="text-sm font-black text-indigo-600">{data.summary.collectionRate}%</span>
          </div>
        </div>

        {/* Executive vs Regular Breakdown Summary */}
        {data.summary.executivePerformance && data.summary.regularPerformance && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200">
              <div className="flex items-center justify-between font-bold text-purple-900 mb-1.5">
                <span>Executive Members (₦2,500/mo)</span>
                <span>{data.summary.executivePerformance.collectionRate}% Rate</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-600">
                <div>Exp: <strong className="text-slate-900">{naira(data.summary.executivePerformance.expected)}</strong></div>
                <div>Paid: <strong className="text-emerald-700">{naira(data.summary.executivePerformance.collected)}</strong></div>
                <div>Due: <strong className="text-rose-700">{naira(data.summary.executivePerformance.outstanding)}</strong></div>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between font-bold text-slate-900 mb-1.5">
                <span>Regular Members (₦2,000/mo)</span>
                <span>{data.summary.regularPerformance.collectionRate}% Rate</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-600">
                <div>Exp: <strong className="text-slate-900">{naira(data.summary.regularPerformance.expected)}</strong></div>
                <div>Paid: <strong className="text-emerald-700">{naira(data.summary.regularPerformance.collected)}</strong></div>
                <div>Due: <strong className="text-rose-700">{naira(data.summary.regularPerformance.outstanding)}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* Member Compliance Classification Tallies */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700">
          <span>Fully Paid: <strong className="text-emerald-700">{data.summary.fullyPaidMembersCount}</strong></span>
          <span>Partially Paid: <strong className="text-amber-700">{data.summary.partiallyPaidMembersCount}</strong></span>
          <span>Never Paid: <strong className="text-rose-700">{data.summary.neverPaidMembersCount}</strong></span>
          <span>Waived: <strong className="text-yellow-800">{data.summary.waivedMembersCount}</strong></span>
          <span>Total Arrears: <strong className="text-rose-800">{data.summary.outstandingMembersCount || (data.summary.partiallyPaidMembersCount + data.summary.neverPaidMembersCount)}</strong></span>
        </div>

        {/* 12-Month Matrix Print Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-[9px] border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="p-1.5 border-r border-slate-200 min-w-[140px]">Member</th>
                <th className="p-1.5 text-center border-r border-slate-200 min-w-[50px]">Category</th>
                {SHORT_MONTHS.map((m) => (
                  <th key={m} className="p-1 text-center border-r border-slate-200 min-w-[34px]">{m}</th>
                ))}
                <th className="p-1.5 text-right text-slate-700 min-w-[55px]">Expected</th>
                <th className="p-1.5 text-right text-emerald-700 min-w-[55px]">Paid</th>
                <th className="p-1.5 text-right text-rose-700 min-w-[55px]">Balance</th>
                <th className="p-1.5 text-right text-amber-700 min-w-[50px]">Waived</th>
                <th className="p-1.5 text-center min-w-[45px]">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="p-1.5 font-bold text-slate-900 border-r border-slate-200">
                    {m.name}
                    <span className="font-mono text-[8px] text-slate-400 block">{m.memberCode}</span>
                  </td>
                  <td className="p-1 text-center font-bold text-slate-600 border-r border-slate-200 text-[8px]">
                    {m.category === 'Executive' ? 'Exec (2.5k)' : 'Reg (2k)'}
                  </td>
                  {m.months.map((cell) => (
                    <td key={cell.month} className="p-0.5 text-center border-r border-slate-200">
                      {cell.status === 'PAID' ? (
                        <span className="font-bold text-emerald-600 text-[8.5px]">✓ {Math.round(cell.amountPaid / 1000)}k</span>
                      ) : cell.status === 'WAIVED' || cell.status === 'EXEMPT' ? (
                        <span className="font-bold text-amber-600 bg-amber-50 px-1 rounded text-[8px]">W</span>
                      ) : cell.status === 'PARTIALLY_PAID' ? (
                        <span className="font-bold text-amber-600 text-[8.5px]">{Math.round(cell.amountPaid / 1000)}k</span>
                      ) : (
                        <span className="text-rose-300 font-bold">—</span>
                      )}
                    </td>
                  ))}
                  <td className="p-1.5 text-right font-bold text-slate-700">{naira(m.totalExpected)}</td>
                  <td className="p-1.5 text-right font-black text-emerald-600">{naira(m.totalPaid)}</td>
                  <td className="p-1.5 text-right font-black text-rose-600">{naira(m.balanceDue)}</td>
                  <td className="p-1.5 text-right font-bold text-amber-600">{naira(m.totalWaived)}</td>
                  <td className="p-1.5 text-center font-bold">{m.complianceRate}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-[9px]">
              <tr>
                <td className="p-1.5 border-r border-slate-200 font-black">TOTALS</td>
                <td className="p-1 border-r border-slate-200 text-center font-bold">{data.members.length}</td>
                {data.summary.monthlyBreakdown.map((mb) => (
                  <td key={mb.month} className="p-0.5 text-center border-r border-slate-200 text-emerald-700 font-black">
                    {Math.round(mb.collected / 1000)}k
                  </td>
                ))}
                <td className="p-1.5 text-right text-slate-800 font-black">{naira(data.summary.totalExpected)}</td>
                <td className="p-1.5 text-right text-emerald-700 font-black">{naira(data.summary.totalCollected)}</td>
                <td className="p-1.5 text-right text-rose-700 font-black">{naira(data.summary.totalOutstanding)}</td>
                <td className="p-1.5 text-right text-amber-700 font-black">{naira(data.summary.totalWaived || 0)}</td>
                <td className="p-1.5 text-center text-indigo-700 font-black">{data.summary.collectionRate}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Sign-off & Verification */}
        <div className="grid grid-cols-2 gap-8 pt-6 text-xs">
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
  const [defaultAmount, setDefaultAmount] = useState(20000);
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
          <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Please make your ₦20,000 Christmas Party contribution before the deadline." />
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

// ----------------------------------------------------------------------------
// INDIVIDUAL MEMBER FINANCIAL BREAKDOWN & HISTORY MODAL (Section 8.B)
// ----------------------------------------------------------------------------
function MemberDetailModal({
  member,
  year,
  canManage,
  onClose,
  onRecordPay,
  onViewReceipt,
}: {
  member: MemberMatrixRow;
  year: number;
  canManage: boolean;
  onClose: () => void;
  onRecordPay: (m: MemberMatrixRow, cell?: MonthCell) => void;
  onViewReceipt: (url: string, name: string) => void;
}) {
  const getClassificationBadge = () => {
    switch (member.classification) {
      case 'FULLY_PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> Fully Paid (100%)
          </span>
        );
      case 'PARTIALLY_PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="w-3.5 h-3.5" /> Partially Paid
          </span>
        );
      case 'NEVER_PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5" /> Never Paid (0 Payments)
          </span>
        );
      case 'WAIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
            <ShieldCheck className="w-3.5 h-3.5" /> Waived
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Member Financial Breakdown & Payment History"
      description={`Comprehensive annual dues accounting record for ${year}`}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canManage && member.balanceDue > 0 && (
            <Button
              onClick={() => onRecordPay(member)}
              className="gap-1.5"
            >
              <DollarSign className="w-4 h-4" />
              <span>Record Payment ({naira(member.balanceDue)} due)</span>
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6 text-slate-800 dark:text-slate-200">
        {/* Member Profile Header */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black flex items-center justify-center text-lg shadow-sm">
              {member.firstName?.[0] || 'M'}
              {member.lastName?.[0] || ''}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{member.name}</h3>
                {getClassificationBadge()}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {member.memberCode}
                </span>
                <span>&bull;</span>
                <span
                  className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                    member.category === 'Executive'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {member.category} Member (₦{(member.monthlyRate / 1000).toFixed(1)}k / month)
                </span>
                {(member.phone || member.email) && (
                  <>
                    <span>&bull;</span>
                    <span>{member.phone || member.email}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 font-semibold block">Outstanding Balance</span>
            <span
              className={`text-xl font-black ${
                member.balanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {naira(member.balanceDue)}
            </span>
          </div>
        </div>

        {/* Financial KPI Matrix (Section 8.B breakdown requirements) */}
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
            Annual Assessment &amp; Position ({year})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-center text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Rate / Month</span>
              <span className="font-black text-slate-900 dark:text-white text-sm">
                {naira(member.monthlyRate)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Assessed Months</span>
              <span className="font-black text-slate-900 dark:text-white text-sm">
                {member.monthsAssessed}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
              <span className="text-[10px] font-semibold uppercase block">Months Paid</span>
              <span className="font-black text-sm">{member.monthsPaidCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300">
              <span className="text-[10px] font-semibold uppercase block">Months Unpaid</span>
              <span className="font-black text-sm">{member.monthsUnpaidCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300">
              <span className="text-[10px] font-semibold uppercase block">Months Waived</span>
              <span className="font-black text-sm">{member.monthsWaivedCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Months Remaining</span>
              <span className="font-black text-slate-900 dark:text-white text-sm">
                {member.monthsRemaining}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2 text-center text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Total Expected</span>
              <span className="font-black text-slate-900 dark:text-white text-sm">
                {naira(member.totalExpected)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
              <span className="text-[10px] font-semibold uppercase block">Total Paid</span>
              <span className="font-black text-sm">{naira(member.totalPaid)}</span>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300">
              <span className="text-[10px] font-semibold uppercase block">Total Outstanding</span>
              <span className="font-black text-sm">{naira(member.balanceDue)}</span>
            </div>
            <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300">
              <span className="text-[10px] font-semibold uppercase block">Total Waived</span>
              <span className="font-black text-sm">{naira(member.totalWaived)}</span>
            </div>
          </div>

          {/* Completion Progress Bar */}
          <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-400">Payment Completion</span>
              <span className="font-black text-indigo-600 dark:text-indigo-400">
                {member.completionRate}% Settled
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  member.completionRate === 100
                    ? 'bg-emerald-500'
                    : member.completionRate > 50
                    ? 'bg-indigo-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${member.completionRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* 12-Month Detailed Monthly Payment History Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
            12-Month Detailed Payment Ledger ({year})
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-3 py-2.5">Month</th>
                  <th className="px-3 py-2.5 text-right">Expected</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                  <th className="px-3 py-2.5">Transaction &amp; Verification Details</th>
                  <th className="px-3 py-2.5 text-center">Receipt</th>
                  {canManage && <th className="px-3 py-2.5 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {member.months.map((cell) => {
                  const isPaid = cell.status === 'PAID';
                  const isWaived = cell.status === 'WAIVED' || cell.status === 'EXEMPT';
                  const isPending = cell.status === 'PENDING_VERIFICATION';
                  const isPartial = cell.status === 'PARTIALLY_PAID';
                  const isUnpaid = cell.status === 'OVERDUE' || cell.status === 'OUTSTANDING';

                  const paymentRecord = cell.payments && cell.payments.length > 0 ? cell.payments[0] : null;

                  return (
                    <tr
                      key={cell.month}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">
                        {cell.monthName} {year}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300">
                        {isWaived ? '₦0 (Waived)' : naira(member.monthlyRate)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        ) : isWaived ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-300">
                            <ShieldCheck className="w-3 h-3" /> Waived
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Partial
                          </span>
                        ) : isUnpaid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="w-3 h-3" /> Unpaid
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                        {naira(cell.amountPaid)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-rose-600">
                        {naira(cell.balance)}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">
                        {paymentRecord ? (
                          <div>
                            <div className="font-mono text-slate-700 dark:text-slate-300 font-bold">
                              {paymentRecord.reference} &bull; {paymentRecord.method}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Paid:{' '}
                              {new Date(paymentRecord.paidOn).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            {paymentRecord.description && (
                              <div className="text-[10px] text-indigo-600 italic">
                                Note: {paymentRecord.description}
                              </div>
                            )}
                          </div>
                        ) : isWaived ? (
                          <span className="text-yellow-700 dark:text-yellow-400 font-semibold italic">
                            Monthly dues waived for this period
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No payment recorded</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {paymentRecord?.receiptUrl ? (
                          <button
                            onClick={() =>
                              onViewReceipt(
                                paymentRecord.receiptUrl!,
                                paymentRecord.receiptName || `${member.name} ${cell.monthName} Receipt`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 cursor-pointer"
                            title="View submitted receipt"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Receipt</span>
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2.5 text-center">
                          {isUnpaid || isPartial ? (
                            <button
                              onClick={() => onRecordPay(member, cell)}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 cursor-pointer"
                            >
                              Record
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// PROOF OF PAYMENT RECEIPT VIEWER MODAL
// ----------------------------------------------------------------------------
function AdminReceiptModal({
  receipt,
  onClose,
}: {
  receipt: { url: string; name: string };
  onClose: () => void;
}) {
  const isPdf =
    receipt.url.startsWith('data:application/pdf') ||
    receipt.name.toLowerCase().endsWith('.pdf');

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Payment Receipt"
      description={receipt.name}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            <a
              href={receipt.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in New Tab</span>
            </a>
            <a
              href={receipt.url}
              download={receipt.name || 'payment-receipt'}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Receipt</span>
            </a>
          </div>
        </div>
      }
    >
      <div className="p-2">
        {isPdf ? (
          <iframe
            src={receipt.url}
            className="w-full h-[65vh] rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner"
            title={receipt.name}
          />
        ) : (
          <div className="flex items-center justify-center p-3 bg-slate-100 dark:bg-slate-900 rounded-xl min-h-[350px] max-h-[70vh] overflow-auto">
            <img
              src={receipt.url}
              alt={receipt.name}
              className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-md"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
