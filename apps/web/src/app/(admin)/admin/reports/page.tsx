'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  Download,
  Flame,
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  Building2,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Info,
  QrCode,
  Smartphone,
  UserCheck,
  UserX,
  Sparkles,
  ExternalLink,
  Calculator,
  UserPlus,
  Baby,
  X,
  ArrowUpDown,
  FileSpreadsheet,
  Check,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';
import { fetchApi, API_BASE_URL, getAuthToken } from '@/lib/api';

type TabType = 'COMBINED' | 'SERVICES' | 'MONTHLY' | 'PERSON';

interface FilterOptions {
  members: { id: string; firstName: string; lastName: string; memberCode: string; subTeamId: string | null }[];
  teams: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  eventTypes: { id: string; name: string; color: string | null }[];
  supervisingMinisters: { id: string; firstName: string; lastName: string; memberCode: string; roleInUnit: string }[];
  recentMeetings: { id: string; title: string; startTime: string; category: { name: string } }[];
}

interface DetailedReportRecord {
  id: string;
  memberId: string;
  memberCode: string;
  memberName: string;
  subTeamId: string | null;
  subTeamName: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  serviceCategory: string;
  availabilityStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NO_RESPONSE';
  attendanceStatus: 'ATTENDED' | 'ABSENT' | 'EXCUSED' | 'EXEMPT' | 'NOT_MARKED';
  actualAttendanceStatus: string | null;
  combinedStatus:
    | 'AVAILABLE_ATTENDED'
    | 'AVAILABLE_ABSENT'
    | 'UNAVAILABLE_ATTENDED'
    | 'UNAVAILABLE_ABSENT'
    | 'NO_RESPONSE_ATTENDED'
    | 'NO_RESPONSE_ABSENT';
  arrivalTime: string | null;
  attendanceMethod: string | null;
  pointsEarned: number;
}

interface ReportSummaryMetrics {
  totalRecords: number;
  totalActiveMembers: number;
  totalMeetingsHeld: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalNoResponse: number;
  totalAttended: number;
  totalAbsent: number;
  totalExcused: number;
  availableAndAttended: number;
  availableAndAbsent: number;
  unavailableAndAttended: number;
  unavailableAndAbsent: number;
  noResponseAndAttended: number;
  noResponseAndAbsent: number;
  attendanceRate: number;
  availabilityResponseRate: number;
  conversionRate: number;
  totalPhysicalHeadcount: number;
  averagePhysicalHeadcount: number;
}

interface ServiceSummaryItem {
  meetingId: string;
  title: string;
  meetingDate: string;
  categoryName: string;
  locationName: string;
  status: string;
  supervisingMinisterName: string | null;
  totalExpectedMembers: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalNoResponse: number;
  totalAttended: number;
  totalAbsent: number;
  totalExcused: number;
  availableAndAttended: number;
  availableAndAbsent: number;
  unavailableAndAttended: number;
  unavailableAndAbsent: number;
  noResponseAndAttended: number;
  noResponseAndAbsent: number;
  attendanceRate: number;
  availabilityResponseRate: number;
  conversionRate: number;
  officialHeadcount: number | null;
  variance: number | null;
}

interface MonthlySummaryItem {
  monthKey: string;
  monthLabel: string;
  servicesHeld: number;
  totalSubmissions: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalNoResponse: number;
  totalAttended: number;
  availableAndAttended: number;
  availableAndAbsent: number;
  attendanceRate: number;
  availabilityResponseRate: number;
  conversionRate: number;
}

interface ReportApiResponse {
  records: DetailedReportRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: ReportSummaryMetrics;
  serviceSummaries: ServiceSummaryItem[];
  monthlySummaries: MonthlySummaryItem[];
  since: string;
  until: string;
}

interface PersonReportResponse {
  member: {
    id: string;
    memberCode: string;
    fullName: string;
    roleInUnit: string;
    subTeamName: string;
    status: string;
  };
  stats: {
    totalServices: number;
    servicesAvailable: number;
    servicesUnavailable: number;
    servicesNoResponse: number;
    servicesAttended: number;
    servicesMissed: number;
    availableButAbsent: number;
    attendanceRate: number;
    availabilityResponseRate: number;
    conversionRate: number;
  };
  history: DetailedReportRecord[];
}

interface ServiceReportResponse {
  meeting: {
    id: string;
    title: string;
    startTime: string;
    endTime: string | null;
    locationName: string;
    status: string;
    category: string;
    eventType: string | null;
    supervisingMinister: string | null;
    headcount: any | null;
  };
  summary: ReportSummaryMetrics;
  categorized: {
    availableAndAttended: DetailedReportRecord[];
    availableAndAbsent: DetailedReportRecord[];
    unavailableAndAttended: DetailedReportRecord[];
    unavailableAndAbsent: DetailedReportRecord[];
    noResponseAndAttended: DetailedReportRecord[];
    noResponseAndAbsent: DetailedReportRecord[];
  };
}

export default function AdminReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('COMBINED');

  // Filter States
  const [datePreset, setDatePreset] = useState<string>('30'); // '7' | '30' | '90' | 'this_month' | 'last_month' | 'custom' | 'month_picker'
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // YYYY-MM
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('ALL');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>('ALL');
  const [selectedSubTeamId, setSelectedSubTeamId] = useState<string>('ALL');
  const [selectedMinisterId, setSelectedMinisterId] = useState<string>('ALL');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('ALL'); // 'ALL' | 'AVAILABLE' | 'NOT_AVAILABLE' | 'NO_RESPONSE'
  const [attendanceFilter, setAttendanceFilter] = useState<string>('ALL'); // 'ALL' | 'ATTENDED' | 'ABSENT' | 'EXCUSED'
  const [combinedStatusFilter, setCombinedStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Data States
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [reportData, setReportData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drilldown Modals
  const [selectedPersonModalId, setSelectedPersonModalId] = useState<string | null>(null);
  const [personReportData, setPersonReportData] = useState<PersonReportResponse | null>(null);
  const [loadingPersonModal, setLoadingPersonModal] = useState<boolean>(false);

  const [selectedServiceModalId, setSelectedServiceModalId] = useState<string | null>(null);
  const [serviceReportData, setServiceReportData] = useState<ServiceReportResponse | null>(null);
  const [loadingServiceModal, setLoadingServiceModal] = useState<boolean>(false);
  const [serviceModalCategoryTab, setServiceModalCategoryTab] = useState<string>('availableAndAttended');

  // Load Filter Options
  useEffect(() => {
    fetchApi<FilterOptions>('/reports/filter-options')
      .then(setFilterOptions)
      .catch((err) => console.error('Failed to load filter options:', err));
  }, []);

  // Build Query String
  const buildQuery = useCallback(
    (forExport = false) => {
      const params = new URLSearchParams();

      if (datePreset === 'custom') {
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
      } else if (datePreset === 'this_month') {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        params.set('month', `${y}-${m}`);
      } else if (datePreset === 'last_month') {
        const now = new Date();
        now.setMonth(now.getMonth() - 1);
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        params.set('month', `${y}-${m}`);
      } else if (datePreset === 'month_picker' && selectedMonth) {
        params.set('month', selectedMonth);
      } else {
        params.set('days', datePreset);
      }

      if (selectedMeetingId !== 'ALL') params.set('meetingId', selectedMeetingId);
      if (selectedCategoryId !== 'ALL') params.set('categoryId', selectedCategoryId);
      if (selectedEventTypeId !== 'ALL') params.set('eventTypeId', selectedEventTypeId);
      if (selectedSubTeamId !== 'ALL') params.set('subTeamId', selectedSubTeamId);
      if (selectedMinisterId !== 'ALL') params.set('supervisingMinisterId', selectedMinisterId);
      if (selectedMemberId !== 'ALL') params.set('memberId', selectedMemberId);
      if (availabilityFilter !== 'ALL') params.set('availabilityStatus', availabilityFilter);
      if (attendanceFilter !== 'ALL') params.set('attendanceStatus', attendanceFilter);
      if (combinedStatusFilter !== 'ALL') params.set('combinedStatus', combinedStatusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      if (!forExport) {
        params.set('page', String(currentPage));
        params.set('limit', String(pageSize));
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }

      return params.toString();
    },
    [
      datePreset,
      fromDate,
      toDate,
      selectedMonth,
      selectedMeetingId,
      selectedCategoryId,
      selectedEventTypeId,
      selectedSubTeamId,
      selectedMinisterId,
      selectedMemberId,
      availabilityFilter,
      attendanceFilter,
      combinedStatusFilter,
      searchQuery,
      currentPage,
      pageSize,
      sortBy,
      sortOrder,
    ],
  );

  // Fetch Report Data
  const loadReport = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const q = buildQuery(false);
      const res = await fetchApi<ReportApiResponse>(`/reports/availability-attendance?${q}`);
      setReportData(res);
    } catch (err: any) {
      console.error('Failed to load report:', err);
      setErrorMsg(err.message || 'Failed to fetch reporting data');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Load Person Modal
  const openPersonModal = async (memberId: string) => {
    setSelectedPersonModalId(memberId);
    setLoadingPersonModal(true);
    try {
      const res = await fetchApi<PersonReportResponse>(`/reports/person-summary/${memberId}`);
      setPersonReportData(res);
    } catch (err) {
      console.error('Failed to load person summary:', err);
    } finally {
      setLoadingPersonModal(false);
    }
  };

  // Load Service Modal
  const openServiceModal = async (meetingId: string) => {
    setSelectedServiceModalId(meetingId);
    setLoadingServiceModal(true);
    try {
      const res = await fetchApi<ServiceReportResponse>(`/reports/service-summary/${meetingId}`);
      setServiceReportData(res);
    } catch (err) {
      console.error('Failed to load service summary:', err);
    } finally {
      setLoadingServiceModal(false);
    }
  };

  // Export Filtered Report
  const handleExport = async (format: 'csv' | 'excel') => {
    setExporting(true);
    try {
      const token = getAuthToken();
      const q = buildQuery(true);
      const endpoint = format === 'csv' ? `/reports/export/csv?${q}` : `/reports/export/excel?${q}`;
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(`Failed to export ${format.toUpperCase()} report`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TFHC_Availability_Attendance_Report_${new Date().toISOString().slice(0, 10)}.${
        format === 'csv' ? 'csv' : 'xlsx'
      }`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Reset Filters
  const resetFilters = () => {
    setDatePreset('30');
    setFromDate('');
    setToDate('');
    setSelectedMonth('');
    setSelectedMeetingId('ALL');
    setSelectedCategoryId('ALL');
    setSelectedEventTypeId('ALL');
    setSelectedSubTeamId('ALL');
    setSelectedMinisterId('ALL');
    setSelectedMemberId('ALL');
    setAvailabilityFilter('ALL');
    setAttendanceFilter('ALL');
    setCombinedStatusFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Helper Badge Color
  const getCombinedBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE_ATTENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            Available + Attended
          </span>
        );
      case 'AVAILABLE_ABSENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <UserX className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            Available + Did Not Attend
          </span>
        );
      case 'UNAVAILABLE_ATTENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <UserCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            Not Available + Attended
          </span>
        );
      case 'UNAVAILABLE_ABSENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            Not Available + Absent
          </span>
        );
      case 'NO_RESPONSE_ATTENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            No Response + Attended
          </span>
        );
      case 'NO_RESPONSE_ABSENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
            <HelpCircle className="w-3 h-3 text-slate-400" />
            No Response + Absent
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const summary = reportData?.summary;

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Operational Intelligence
              </span>
              <span className="text-[11px] font-bold text-slate-400">
                Africa/Lagos (WAT, UTC+1)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              Weekly Availability &amp; Attendance Reporting
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
              Audit member commitments against actual service attendance. Analyze commitment conversion rates, unexpected walk-ins, absenteeism, and physical vs app check-in variances.
            </p>
          </div>

          {/* Top Actions & Quick Export */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={loadReport}
              disabled={loading}
              title="Refresh Report"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-500' : 'text-slate-500'}`} />
              <span>Refresh</span>
            </button>

            <div className="flex items-center rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <button
                onClick={() => handleExport('excel')}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>CSV</span>
              </button>
            </div>

            <Link
              href="/admin/availability"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all active:scale-95"
            >
              <Calendar className="w-4 h-4 text-indigo-200" />
              <span>Poll Management</span>
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
          {[
            { id: 'COMBINED', label: 'Combined Matrix & Detail', icon: Layers },
            { id: 'SERVICES', label: 'Service Summaries & Headcounts', icon: Building2 },
            { id: 'MONTHLY', label: 'Monthly Reporting & Trends', icon: TrendingUp },
            { id: 'PERSON', label: 'Person Historical Records', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Filter Panel */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-500" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Dynamic Report Filter Engine
              </h2>
            </div>
            <button
              onClick={resetFilters}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline self-start sm:self-auto cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* 1. Date Range Preset */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Period Preset
              </label>
              <select
                aria-label="Reporting period preset"
                value={datePreset}
                onChange={(e) => {
                  setDatePreset(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="180">Last 6 Months</option>
                <option value="365">Last 365 Days</option>
                <option value="this_month">This Current Month</option>
                <option value="last_month">Previous Month</option>
                <option value="month_picker">Select Specific Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* If Month Picker */}
            {datePreset === 'month_picker' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Specific Month
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* If Custom Date Range */}
            {datePreset === 'custom' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    From (WAT)
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    To (WAT)
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </>
            )}

            {/* 2. Service / Meeting */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Specific Service
              </label>
              <select
                aria-label="Filter by service"
                value={selectedMeetingId}
                onChange={(e) => {
                  setSelectedMeetingId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Services</option>
                {filterOptions?.recentMeetings?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({new Date(m.startTime).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Sub-Team */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Sub-Team / Department
              </label>
              <select
                aria-label="Filter by sub-team"
                value={selectedSubTeamId}
                onChange={(e) => {
                  setSelectedSubTeamId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Departments</option>
                {filterOptions?.teams?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Category */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Service Category
              </label>
              <select
                aria-label="Filter by category"
                value={selectedCategoryId}
                onChange={(e) => {
                  setSelectedCategoryId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Categories</option>
                {filterOptions?.categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Supervising Minister */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Supervising Minister
              </label>
              <select
                aria-label="Filter by supervising minister"
                value={selectedMinisterId}
                onChange={(e) => {
                  setSelectedMinisterId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Ministers</option>
                {filterOptions?.supervisingMinisters?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName} ({m.roleInUnit})
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Availability Status Filter */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Poll Availability
              </label>
              <select
                aria-label="Filter by availability status"
                value={availabilityFilter}
                onChange={(e) => {
                  setAvailabilityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Poll Submissions</option>
                <option value="AVAILABLE">Available (Committed)</option>
                <option value="NOT_AVAILABLE">Not Available (Declined)</option>
                <option value="NO_RESPONSE">No Response (Missed Poll)</option>
              </select>
            </div>

            {/* 7. Attendance Status Filter */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Attendance Outcome
              </label>
              <select
                aria-label="Filter by attendance status"
                value={attendanceFilter}
                onChange={(e) => {
                  setAttendanceFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Attendance Outcomes</option>
                <option value="ATTENDED">Attended (Present)</option>
                <option value="ABSENT">Absent</option>
                <option value="EXCUSED">Excused</option>
              </select>
            </div>

            {/* 8. Combined Status Filter */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Combined 6-Way Status
              </label>
              <select
                aria-label="Filter by combined 6-way status"
                value={combinedStatusFilter}
                onChange={(e) => {
                  setCombinedStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-bold text-indigo-700 dark:text-indigo-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All 6 Combinations</option>
                <option value="AVAILABLE_ATTENDED">Available + Attended</option>
                <option value="AVAILABLE_ABSENT">Available + Did Not Attend</option>
                <option value="UNAVAILABLE_ATTENDED">Not Available + Attended</option>
                <option value="UNAVAILABLE_ABSENT">Not Available + Did Not Attend</option>
                <option value="NO_RESPONSE_ATTENDED">No Response + Attended</option>
                <option value="NO_RESPONSE_ABSENT">No Response + Did Not Attend</option>
              </select>
            </div>
          </div>

          {/* Search Bar */}
          <div className="pt-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search member by first name, last name, member code (TFHC-XXX), sub-team, or service title..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* 6-Way Status Interactive Buttons Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            {
              id: 'AVAILABLE_ATTENDED',
              label: 'Available + Attended',
              count: summary?.availableAndAttended || 0,
              desc: 'Committed & Present',
              color: 'text-emerald-600 dark:text-emerald-400',
              bgActive: 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-500',
            },
            {
              id: 'AVAILABLE_ABSENT',
              label: 'Available + Absent',
              count: summary?.availableAndAbsent || 0,
              desc: 'Committed & Missed',
              color: 'text-rose-600 dark:text-rose-400',
              bgActive: 'bg-rose-50 dark:bg-rose-950/70 border-rose-500',
            },
            {
              id: 'UNAVAILABLE_ATTENDED',
              label: 'Not Available + Attended',
              count: summary?.unavailableAndAttended || 0,
              desc: 'Declined & Came',
              color: 'text-amber-600 dark:text-amber-400',
              bgActive: 'bg-amber-50 dark:bg-amber-950/70 border-amber-500',
            },
            {
              id: 'UNAVAILABLE_ABSENT',
              label: 'Not Available + Absent',
              count: summary?.unavailableAndAbsent || 0,
              desc: 'Declined & Absent',
              color: 'text-slate-600 dark:text-slate-400',
              bgActive: 'bg-slate-100 dark:bg-slate-800 border-slate-500',
            },
            {
              id: 'NO_RESPONSE_ATTENDED',
              label: 'No Response + Attended',
              count: summary?.noResponseAndAttended || 0,
              desc: 'No Poll & Present',
              color: 'text-purple-600 dark:text-purple-400',
              bgActive: 'bg-purple-50 dark:bg-purple-950/70 border-purple-500',
            },
            {
              id: 'NO_RESPONSE_ABSENT',
              label: 'No Response + Absent',
              count: summary?.noResponseAndAbsent || 0,
              desc: 'No Poll & Absent',
              color: 'text-slate-400 dark:text-slate-500',
              bgActive: 'bg-slate-100/60 dark:bg-slate-900 border-slate-400',
            },
          ].map((item) => {
            const isSelected = combinedStatusFilter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCombinedStatusFilter(isSelected ? 'ALL' : item.id);
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer shadow-xs ${
                  isSelected
                    ? item.bgActive
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                  {item.label}
                </span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className={`text-xl sm:text-2xl font-black ${item.color}`}>
                    {item.count}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">{item.desc}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  CONVERSION RATE
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {summary?.conversionRate ?? 0}%
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  of committed
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>Attended: {summary?.availableAndAttended || 0}</span>
              <span>Committed: {summary?.totalAvailable || 0}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  POLL RESPONSE RATE
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {summary?.availabilityResponseRate ?? 0}%
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  participation
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>Submitted: {(summary?.totalAvailable || 0) + (summary?.totalUnavailable || 0)}</span>
              <span>Active Members: {summary?.totalActiveMembers || 0}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  TOTAL ATTENDANCE
                </span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {summary?.totalAttended ?? 0}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  present ({summary?.attendanceRate ?? 0}%)
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>Services Analyzed: {summary?.totalMeetingsHeld || 0}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  PHYSICAL HEADCOUNT
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Calculator className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {summary?.totalPhysicalHeadcount?.toLocaleString() || 0}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  counted
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>Avg / Service: {summary?.averagePhysicalHeadcount || 0}</span>
            </div>
          </div>
        </div>

        {/* Tab 1: Combined Matrix & Detailed Table */}
        {activeTab === 'COMBINED' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Combined Availability &amp; Attendance Records
                </h3>
                <p className="text-xs text-slate-500">
                  Showing {reportData?.records.length || 0} of {reportData?.total || 0} matching records
                </p>
              </div>

              {/* Page Size Selector */}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Page Size:</span>
                <select
                  aria-label="Records per page"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-indigo-600"
                      onClick={() => {
                        if (sortBy === 'memberName') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else {
                          setSortBy('memberName');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>Member</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Sub-Team</th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-indigo-600"
                      onClick={() => {
                        if (sortBy === 'serviceTitle') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else {
                          setSortBy('serviceTitle');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>Service &amp; Category</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-indigo-600"
                      onClick={() => {
                        if (sortBy === 'date') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else {
                          setSortBy('date');
                          setSortOrder('desc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>Date (WAT)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center">Indicated Availability</th>
                    <th className="py-3 px-4 text-center">Actual Attendance</th>
                    <th className="py-3 px-4 text-center">Combined Status</th>
                    <th className="py-3 px-4 text-center">Arrival Time</th>
                    <th className="py-3 px-4 text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                        Generating reporting matrix...
                      </td>
                    </tr>
                  ) : !reportData || reportData.records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                        No availability &amp; attendance records match the selected filter combination.
                      </td>
                    </tr>
                  ) : (
                    reportData.records.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        {/* Member */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => openPersonModal(r.memberId)}
                            className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left flex flex-col cursor-pointer"
                          >
                            <span>{r.memberName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {r.memberCode}
                            </span>
                          </button>
                        </td>

                        {/* SubTeam */}
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {r.subTeamName}
                          </span>
                        </td>

                        {/* Service */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => openServiceModal(r.meetingId)}
                            className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left flex flex-col cursor-pointer"
                          >
                            <span>{r.meetingTitle}</span>
                            <span className="text-[10px] text-slate-400">
                              {r.serviceCategory}
                            </span>
                          </button>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {new Date(r.meetingDate).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>

                        {/* Indicated Availability */}
                        <td className="py-3 px-4 text-center">
                          {r.availabilityStatus === 'AVAILABLE' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <Check className="w-3 h-3 text-emerald-500" />
                              Available
                            </span>
                          ) : r.availabilityStatus === 'NOT_AVAILABLE' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Not Available
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100/60 text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                              No Response
                            </span>
                          )}
                        </td>

                        {/* Actual Attendance */}
                        <td className="py-3 px-4 text-center">
                          {r.attendanceStatus === 'ATTENDED' ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                Attended ({r.actualAttendanceStatus || 'PRESENT'})
                              </span>
                              {(r.attendanceMethod === 'ONLINE_SESSION' || r.attendanceMethod === 'ONLINE_CODE') && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400">
                                  <span className="material-symbols-outlined text-[11px]">videocam</span>
                                  <span>{r.attendanceMethod === 'ONLINE_CODE' ? 'Online (Code)' : 'Online (Session)'}</span>
                                </span>
                              )}
                            </div>
                          ) : r.attendanceStatus === 'EXCUSED' ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              Excused
                            </span>
                          ) : (
                            <span className="text-slate-400">Absent</span>
                          )}
                        </td>

                        {/* Combined Status Badge */}
                        <td className="py-3 px-4 text-center">
                          {getCombinedBadge(r.combinedStatus)}
                        </td>

                        {/* Arrival Time */}
                        <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-500">
                          {r.arrivalTime
                            ? new Date(r.arrivalTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>

                        {/* Points */}
                        <td className="py-3 px-4 text-right font-bold text-slate-800 dark:text-slate-200">
                          {r.pointsEarned} pts
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {reportData && reportData.totalPages > 1 && (
              <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing Page {reportData.page} of {reportData.totalPages} ({reportData.total} total items)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(reportData.totalPages, p + 1))}
                    disabled={currentPage === reportData.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Service Summaries & Headcounts */}
        {activeTab === 'SERVICES' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden space-y-0">
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Service-by-Service Availability &amp; Headcount Reconciliation
                </h3>
                <p className="text-xs text-slate-500">
                  Analyze commitment conversion rates and compare official physical sanctuary counts against digital roster check-ins.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="py-3 px-4">Service &amp; Date</th>
                    <th className="py-3 px-4">Supervising Minister</th>
                    <th className="py-3 px-4 text-center">Physical Headcount</th>
                    <th className="py-3 px-4 text-center">App Present</th>
                    <th className="py-3 px-4 text-center">Variance</th>
                    <th className="py-3 px-4 text-center">Available + Attended</th>
                    <th className="py-3 px-4 text-center">Available + Absent</th>
                    <th className="py-3 px-4 text-center">Conversion %</th>
                    <th className="py-3 px-4 text-center">Response %</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {reportData?.serviceSummaries?.map((s) => (
                    <tr
                      key={s.meetingId}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{s.title}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(s.meetingDate).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {s.supervisingMinisterName || '—'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {s.officialHeadcount != null ? (
                          <span className="font-black text-amber-500 dark:text-amber-400 text-sm">
                            {s.officialHeadcount}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Unrecorded</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">
                        {s.totalAttended}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {s.variance != null ? (
                          <span
                            className={`font-bold ${
                              s.variance >= 0 ? 'text-emerald-500' : 'text-rose-500'
                            }`}
                          >
                            {s.variance >= 0 ? `+${s.variance}` : s.variance}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-bold text-emerald-600 dark:text-emerald-400">
                        {s.availableAndAttended}
                      </td>

                      <td className="py-3 px-4 text-center font-bold text-rose-600 dark:text-rose-400">
                        {s.availableAndAbsent}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {s.conversionRate}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center text-slate-500">
                        {s.availabilityResponseRate}%
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openServiceModal(s.meetingId)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-semibold cursor-pointer"
                        >
                          View Breakdown
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Monthly Reporting & Trends */}
        {activeTab === 'MONTHLY' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden space-y-0">
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Monthly Trend Analysis &amp; Conversion Trajectory
              </h3>
              <p className="text-xs text-slate-500">
                Month-by-month aggregated performance across weekly availability poll cycles and service attendance.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="py-3 px-4">Month</th>
                    <th className="py-3 px-4 text-center">Services Held</th>
                    <th className="py-3 px-4 text-center">Poll Submissions</th>
                    <th className="py-3 px-4 text-center">Available</th>
                    <th className="py-3 px-4 text-center">Not Available</th>
                    <th className="py-3 px-4 text-center">No Response</th>
                    <th className="py-3 px-4 text-center">Available + Attended</th>
                    <th className="py-3 px-4 text-center">Available + Absent</th>
                    <th className="py-3 px-4 text-center">Conversion %</th>
                    <th className="py-3 px-4 text-center">Attendance %</th>
                    <th className="py-3 px-4 text-right">Drill-Down</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {reportData?.monthlySummaries?.map((m) => (
                    <tr
                      key={m.monthKey}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {m.monthLabel}
                      </td>
                      <td className="py-3 px-4 text-center">{m.servicesHeld}</td>
                      <td className="py-3 px-4 text-center font-bold">{m.totalSubmissions}</td>
                      <td className="py-3 px-4 text-center text-emerald-600">{m.totalAvailable}</td>
                      <td className="py-3 px-4 text-center text-slate-500">{m.totalUnavailable}</td>
                      <td className="py-3 px-4 text-center text-slate-400">{m.totalNoResponse}</td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-600">
                        {m.availableAndAttended}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-rose-600">
                        {m.availableAndAbsent}
                      </td>
                      <td className="py-3 px-4 text-center font-black text-emerald-600">
                        {m.conversionRate}%
                      </td>
                      <td className="py-3 px-4 text-center font-bold">{m.attendanceRate}%</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setDatePreset('month_picker');
                            setSelectedMonth(m.monthKey);
                            setActiveTab('COMBINED');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-semibold cursor-pointer"
                        >
                          View Month Records
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Person Historical Records */}
        {activeTab === 'PERSON' && (
          <div className="space-y-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Select a Member to Inspect Individual Historical Record
              </label>
              <select
                aria-label="Select member for history"
                value={selectedMemberId}
                onChange={(e) => {
                  setSelectedMemberId(e.target.value);
                  if (e.target.value !== 'ALL') {
                    openPersonModal(e.target.value);
                  }
                }}
                className="w-full sm:w-96 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Select a member...</option>
                {filterOptions?.members?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName} ({m.memberCode})
                  </option>
                ))}
              </select>
            </div>

            {selectedMemberId !== 'ALL' && personReportData && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {personReportData.member.fullName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      {personReportData.member.memberCode} · {personReportData.member.subTeamName} · {personReportData.member.roleInUnit}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Conversion Rate: {personReportData.stats.conversionRate}%
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      Attendance Rate: {personReportData.stats.attendanceRate}%
                    </span>
                  </div>
                </div>

                {/* 6 Stats Mini Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Services Available</span>
                    <p className="text-xl font-black text-emerald-600 mt-1">{personReportData.stats.servicesAvailable}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Services Attended</span>
                    <p className="text-xl font-black text-emerald-600 mt-1">{personReportData.stats.servicesAttended}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available But Absent</span>
                    <p className="text-xl font-black text-rose-600 mt-1">{personReportData.stats.availableButAbsent}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Services Unavailable</span>
                    <p className="text-xl font-black text-slate-600 mt-1">{personReportData.stats.servicesUnavailable}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">No Response</span>
                    <p className="text-xl font-black text-slate-400 mt-1">{personReportData.stats.servicesNoResponse}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Analyzed</span>
                    <p className="text-xl font-black text-indigo-600 mt-1">{personReportData.stats.totalServices}</p>
                  </div>
                </div>

                {/* History Table */}
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Service</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-center">Poll Availability</th>
                        <th className="py-2.5 px-3 text-center">Attendance</th>
                        <th className="py-2.5 px-3 text-center">Combined Relationship</th>
                        <th className="py-2.5 px-3 text-right">Arrival Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {personReportData.history.map((h) => (
                        <tr key={h.id}>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                            {h.meetingTitle}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {new Date(h.meetingDate).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold">
                            {h.availabilityStatus}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold">
                            {h.attendanceStatus}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {getCombinedBadge(h.combinedStatus)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500">
                            {h.arrivalTime
                              ? new Date(h.arrivalTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* DRILL-DOWN MODAL 1: PERSON DETAIL MODAL                                   */}
        {/* ========================================================================= */}
        {selectedPersonModalId && (
          <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Member Availability &amp; Attendance Record
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chronological service participation history
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedPersonModalId(null);
                    setPersonReportData(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {loadingPersonModal ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    Loading member history...
                  </div>
                ) : personReportData ? (
                  <>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                      <div>
                        <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                          {personReportData.member.fullName}
                        </h4>
                        <p className="text-xs text-slate-500 font-mono">
                          {personReportData.member.memberCode} · {personReportData.member.subTeamName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 block">
                          Conversion Rate: {personReportData.stats.conversionRate}%
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {personReportData.stats.servicesAttended} attended of {personReportData.stats.servicesAvailable} committed
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">Service</th>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3 text-center">Poll</th>
                            <th className="py-2.5 px-3 text-center">Attendance</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {personReportData.history.map((h) => (
                            <tr key={h.id}>
                              <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                                {h.meetingTitle}
                              </td>
                              <td className="py-2 px-3 text-slate-500">
                                {new Date(h.meetingDate).toLocaleDateString()}
                              </td>
                              <td className="py-2 px-3 text-center font-semibold">
                                {h.availabilityStatus}
                              </td>
                              <td className="py-2 px-3 text-center font-semibold">
                                {h.attendanceStatus}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {getCombinedBadge(h.combinedStatus)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DRILL-DOWN MODAL 2: SERVICE DETAIL MODAL                                  */}
        {/* ========================================================================= */}
        {selectedServiceModalId && (
          <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Service Reconciliation &amp; Member Rosters
                  </h3>
                  <p className="text-xs text-slate-500">
                    Categorized breakdown of member commitments against service attendance
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedServiceModalId(null);
                    setServiceReportData(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {loadingServiceModal ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    Loading service rosters...
                  </div>
                ) : serviceReportData ? (
                  <>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                          {serviceReportData.meeting.title}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {new Date(serviceReportData.meeting.startTime).toLocaleDateString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}{' '}
                          · {serviceReportData.meeting.locationName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                          <span className="text-[10px] font-bold text-amber-500 uppercase block">Physical Headcount</span>
                          <span className="text-lg font-black text-amber-500">
                            {serviceReportData.meeting.headcount?.totalHeadcount ?? '—'}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase block">Conversion Rate</span>
                          <span className="text-lg font-black text-emerald-600">
                            {serviceReportData.summary.conversionRate}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Category Selector Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {[
                        { id: 'availableAndAttended', label: 'Available + Attended', count: serviceReportData.categorized.availableAndAttended.length, color: 'text-emerald-600' },
                        { id: 'availableAndAbsent', label: 'Available + Absent', count: serviceReportData.categorized.availableAndAbsent.length, color: 'text-rose-600' },
                        { id: 'unavailableAndAttended', label: 'Not Available + Attended', count: serviceReportData.categorized.unavailableAndAttended.length, color: 'text-amber-600' },
                        { id: 'unavailableAndAbsent', label: 'Not Available + Absent', count: serviceReportData.categorized.unavailableAndAbsent.length, color: 'text-slate-500' },
                        { id: 'noResponseAndAttended', label: 'No Response + Attended', count: serviceReportData.categorized.noResponseAndAttended.length, color: 'text-purple-600' },
                        { id: 'noResponseAndAbsent', label: 'No Response + Absent', count: serviceReportData.categorized.noResponseAndAbsent.length, color: 'text-slate-400' },
                      ].map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setServiceModalCategoryTab(c.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                            serviceModalCategoryTab === c.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          <span>{c.label}</span> ({c.count})
                        </button>
                      ))}
                    </div>

                    {/* Roster Table for Selected Category */}
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">Member</th>
                            <th className="py-2.5 px-3">Department</th>
                            <th className="py-2.5 px-3 text-center">Attendance Outcome</th>
                            <th className="py-2.5 px-3 text-right">Arrival Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {((serviceReportData.categorized as any)[serviceModalCategoryTab] || []).length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-400 italic">
                                No members in this category for this service.
                              </td>
                            </tr>
                          ) : (
                            ((serviceReportData.categorized as any)[serviceModalCategoryTab] || []).map((m: DetailedReportRecord) => (
                              <tr key={m.id}>
                                <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">
                                  {m.memberName} ({m.memberCode})
                                </td>
                                <td className="py-2 px-3 text-slate-500">
                                  {m.subTeamName}
                                </td>
                                <td className="py-2 px-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                                  {m.attendanceStatus === 'ATTENDED' ? (
                                    <span className="text-emerald-600 font-bold">Present</span>
                                  ) : (
                                    <span className="text-slate-400">Absent</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-500">
                                  {m.arrivalTime
                                    ? new Date(m.arrivalTime).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
