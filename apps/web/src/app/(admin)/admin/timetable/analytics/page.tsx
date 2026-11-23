'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  Download,
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  Building2,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Info,
  UserCheck,
  UserX,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Sliders,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  X,
  ExternalLink,
  Layers,
  ChevronDown,
  Percent,
} from 'lucide-react';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';
import { fetchApi, API_BASE_URL, getAuthToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageLoader } from '@/components/ui';

type DatePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_QUARTER'
  | 'THIS_YEAR'
  | 'CUSTOM'
  | 'SPECIFIC_DATE';

type TabType = 'overview' | 'attendance' | 'fairness' | 'services' | 'ministers' | 'search';

type ReportType =
  | 'WEEKLY_TIMETABLE'
  | 'MONTHLY_TIMETABLE'
  | 'ATTENDANCE_PERFORMANCE'
  | 'MEMBER_ATTENDANCE'
  | 'SERVICE_PERFORMANCE'
  | 'ASSIGNMENT_FAIRNESS'
  | 'SUPERVISING_MINISTER'
  | 'COMPREHENSIVE_MANAGEMENT';

interface DatePresetOption {
  id: DatePreset;
  label: string;
}

const DATE_PRESETS: DatePresetOption[] = [
  { id: 'THIS_WEEK', label: 'This Week' },
  { id: 'LAST_WEEK', label: 'Last Week' },
  { id: 'THIS_MONTH', label: 'This Month' },
  { id: 'LAST_MONTH', label: 'Last Month' },
  { id: 'TODAY', label: 'Today' },
  { id: 'YESTERDAY', label: 'Yesterday' },
  { id: 'THIS_QUARTER', label: 'This Quarter' },
  { id: 'THIS_YEAR', label: 'This Year' },
  { id: 'CUSTOM', label: 'Custom Range' },
  { id: 'SPECIFIC_DATE', label: 'Specific Date' },
];

const SERVICE_SESSION_OPTIONS = [
  { key: 'SUNDAY_SECOND', label: 'Sunday 2nd Service' },
  { key: 'SUNDAY_THIRD', label: 'Sunday 3rd Service' },
  { key: 'TUESDAY_MIDWEEK', label: 'Tuesday Mid-Week' },
  { key: 'THURSDAY_DIVINE', label: 'Thursday Divine' },
  { key: 'SATURDAY_SEATS', label: 'Saturday Seats' },
];

const REPORT_TYPE_OPTIONS: { id: ReportType; label: string; desc: string }[] = [
  {
    id: 'COMPREHENSIVE_MANAGEMENT',
    label: 'Comprehensive Management Report',
    desc: 'Executive summary with complete KPIs, staffing, attendance, fairness & minister leadership.',
  },
  {
    id: 'WEEKLY_TIMETABLE',
    label: 'Weekly Timetable Roster',
    desc: 'Full service-by-service roster for the current active week with assigned ushers and positions.',
  },
  {
    id: 'MONTHLY_TIMETABLE',
    label: 'Monthly Timetable Matrix',
    desc: 'Consolidated service matrix across all services in the month with schedule coverage rates.',
  },
  {
    id: 'ATTENDANCE_PERFORMANCE',
    label: 'Attendance & Punctuality Audit',
    desc: 'Correlated verification of scheduled ushers vs actual meeting attendance and punctuality rates.',
  },
  {
    id: 'MEMBER_ATTENDANCE',
    label: 'Member Participation Summary',
    desc: 'Detailed usher-by-usher participation breakdown, scheduled sessions, attended sessions, and rates.',
  },
  {
    id: 'SERVICE_PERFORMANCE',
    label: 'Service Session Performance',
    desc: 'Staffing fulfillment and attendance rates broken down by distinct weekly service session.',
  },
  {
    id: 'ASSIGNMENT_FAIRNESS',
    label: 'Assignment Fairness & Distribution Audit',
    desc: 'Equity report showing distribution spread, workload balance, standard deviation and zero-assignment members.',
  },
  {
    id: 'SUPERVISING_MINISTER',
    label: 'Supervising Minister Leadership Report',
    desc: 'Performance metrics, scheduled ushers, and attendance coverage under each supervising minister.',
  },
];

export default function TimetableAnalyticsPage() {
  const { user, can } = useAuth();

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_WEEK');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [specificDate, setSpecificDate] = useState<string>('');

  // Tabs & Views
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Search Tab specific filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [clockInFilter, setClockInFilter] = useState<'ALL' | 'RECORDED' | 'MISSING'>('ALL');
  const [searchPage, setSearchPage] = useState<number>(1);
  const [searchLimit] = useState<number>(20);

  // Data states
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [searchData, setSearchData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drilldown Modal
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberData, setMemberData] = useState<any>(null);
  const [memberLoading, setMemberLoading] = useState<boolean>(false);

  // Export Modal
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('COMPREHENSIVE_MANAGEMENT');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [exporting, setExporting] = useState<boolean>(false);

  // Build query string helper
  const getFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('preset', datePreset);
    if (datePreset === 'CUSTOM') {
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
    } else if (datePreset === 'SPECIFIC_DATE' && specificDate) {
      params.set('specificDate', specificDate);
    }
    return params;
  }, [datePreset, startDate, endDate, specificDate]);

  // Load Dashboard Analytics
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = getFilterParams();
      const res = await fetchApi<any>(`/timetable/analytics/dashboard?${params.toString()}`);
      setDashboardData(res);
    } catch (err: any) {
      console.error('Failed to load timetable analytics', err);
      setErrorMsg(err.message || 'Failed to load timetable analytics data');
    } finally {
      setLoading(false);
    }
  }, [getFilterParams]);

  // Load Search Records
  const loadSearchData = useCallback(async () => {
    setSearchLoading(true);
    try {
      const params = getFilterParams();
      if (searchQuery.trim()) params.set('query', searchQuery.trim());
      if (selectedSessions.length > 0) params.set('sessionKeys', selectedSessions.join(','));
      if (selectedStatuses.length > 0) params.set('attendanceStatuses', selectedStatuses.join(','));
      if (clockInFilter !== 'ALL') params.set('clockInFilter', clockInFilter);
      params.set('page', String(searchPage));
      params.set('limit', String(searchLimit));

      const res = await fetchApi<any>(`/timetable/analytics/search?${params.toString()}`);
      setSearchData(res);
    } catch (err: any) {
      console.error('Failed to load search data', err);
    } finally {
      setSearchLoading(false);
    }
  }, [getFilterParams, searchQuery, selectedSessions, selectedStatuses, clockInFilter, searchPage, searchLimit]);

  // Load Member Drilldown
  const loadMemberDrilldown = useCallback(async (memberId: string) => {
    setSelectedMemberId(memberId);
    setMemberLoading(true);
    try {
      const params = getFilterParams();
      const res = await fetchApi<any>(`/timetable/analytics/member/${memberId}?${params.toString()}`);
      setMemberData(res);
    } catch (err: any) {
      console.error('Failed to load member drilldown', err);
    } finally {
      setMemberLoading(false);
    }
  }, [getFilterParams]);

  // Trigger export
  const handleExport = async (overrideType?: ReportType, overrideFormat?: 'pdf' | 'excel') => {
    const reportType = overrideType || selectedReportType;
    const format = overrideFormat || exportFormat;
    setExporting(true);

    try {
      const token = getAuthToken();
      const params = getFilterParams();
      params.set('reportType', reportType);

      const endpoint =
        format === 'pdf'
          ? `/timetable/analytics/export/pdf?${params.toString()}`
          : `/timetable/analytics/export/excel?${params.toString()}`;

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || `Failed to download ${format.toUpperCase()} report`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;

      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `TFHC_Timetable_${reportType}_${dateStr}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }, 1000);

      setExportModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (activeTab === 'search') {
      loadSearchData();
    }
  }, [activeTab, loadSearchData]);

  // Reset page when search filters change
  const handleSearchFilterChange = () => {
    setSearchPage(1);
    loadSearchData();
  };

  const overview = dashboardData?.overview;
  const attendance = dashboardData?.attendance;
  const fairness = dashboardData?.fairness;
  const services = dashboardData?.services || [];
  const ministers = dashboardData?.ministers || [];
  const trends = dashboardData?.trends;
  const period = dashboardData?.period;

  return (
    <AdminLayoutShell>
      <div className="flex flex-col gap-6 pb-20 max-w-7xl mx-auto w-full px-4 sm:px-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/admin" className="hover:text-slate-800 dark:hover:text-slate-200">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/admin/timetable" className="hover:text-slate-800 dark:hover:text-slate-200">
              Ushering Timetable
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-slate-900 dark:text-white font-bold">Analytics & Intelligence</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/timetable"
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span>Manage Timetable</span>
            </Link>
            <Link
              href="/admin/reports"
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <BarChart3 className="h-3.5 w-3.5 text-slate-500" />
              <span>Standard Reports</span>
            </Link>
          </div>
        </div>

        {/* Page Hero Header */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 border border-slate-800">
          <div className="relative z-10 flex flex-col gap-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-600/30 text-red-300 border border-red-500/40">
                Workforce Intelligence
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/10 text-slate-200">
                TFHC Orderliness
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Ushering Timetable & Attendance Analytics
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Real-time cross-correlation between published weekly rosters and live meeting attendance records. Monitor
              staffing coverage, punctuality rates, workload fairness, and generate executive reports.
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleExport('COMPREHENSIVE_MANAGEMENT', 'pdf')}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Download Executive Landscape PDF"
            >
              <FileText className="h-4 w-4 text-red-600" />
              <span>Quick PDF</span>
            </button>

            <button
              onClick={() => handleExport('COMPREHENSIVE_MANAGEMENT', 'excel')}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Download 7-Sheet Analytics Workbook"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Quick Excel</span>
            </button>

            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Custom Report...</span>
            </button>

            <button
              onClick={() => {
                loadDashboardData();
                if (activeTab === 'search') loadSearchData();
              }}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Presets Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {DATE_PRESETS.map((p) => {
                const isSelected = datePreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setDatePreset(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Date Span Indicator */}
            {period && (
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                <Calendar className="h-4 w-4 text-red-500" />
                <span>
                  {period.label}: {new Date(period.startDate).toLocaleDateString('en-GB')} –{' '}
                  {new Date(period.endDate).toLocaleDateString('en-GB')}
                </span>
              </div>
            )}
          </div>

          {/* Custom Date Pickers */}
          {datePreset === 'CUSTOM' && (
            <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                />
              </div>
              <button
                onClick={() => {
                  loadDashboardData();
                  if (activeTab === 'search') loadSearchData();
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold"
              >
                Apply Range
              </button>
            </div>
          )}

          {/* Specific Date Picker */}
          {datePreset === 'SPECIFIC_DATE' && (
            <div className="flex items-center gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Service Date:</label>
                <input
                  type="date"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                />
              </div>
              <button
                onClick={() => {
                  loadDashboardData();
                  if (activeTab === 'search') loadSearchData();
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold"
              >
                Apply Date
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 sm:gap-6 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Executive Overview', icon: Layers },
            { id: 'attendance', label: 'Attendance & Punctuality', icon: CheckCircle2 },
            { id: 'fairness', label: 'Assignment Fairness', icon: Award },
            { id: 'services', label: 'Service Sessions', icon: Building2 },
            { id: 'ministers', label: 'Supervising Ministers', icon: ShieldCheck },
            { id: 'search', label: 'Record Explorer & Search', icon: Search },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-red-600 text-red-600 dark:text-red-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Loader */}
        {loading ? (
          <div className="py-20">
            <PageLoader message="Analyzing timetable assignments, meetings, and attendance records..." />
          </div>
        ) : (
          <>
            {/* TAB 1: EXECUTIVE OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="flex flex-col gap-6">
                {/* 6 Key Executive Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {/* Metric 1: Coverage Rate */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Staffing Coverage
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">
                        {overview?.coverageRate ?? 0}%
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {overview?.totalAssignments ?? 0} / {overview?.totalRequiredSlots ?? 0}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-3">
                      <div
                        className="bg-indigo-600 h-full rounded-full"
                        style={{ width: `${Math.min(overview?.coverageRate ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Metric 2: Attendance Rate */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Usher Attendance
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                        {overview?.attendanceRate ?? 0}%
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {overview?.attendedAssignments ?? 0} / {overview?.completedServiceAssignments ?? 0}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-3">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${Math.min(overview?.attendanceRate ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Metric 3: Punctuality Rate */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Punctuality Rate
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                        {attendance?.punctualityRate ?? 0}%
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {attendance?.onTimePresent ?? 0} Early/On-Time
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-3">
                      <div
                        className="bg-blue-500 h-full rounded-full"
                        style={{ width: `${Math.min(attendance?.punctualityRate ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Metric 4: Total Timetables */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Timetables Published
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">
                        {overview?.publishedTimetables ?? 0}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        of {overview?.totalTimetables ?? 0} generated
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium mt-3">
                      {overview?.pendingTimetables ?? 0} pending review
                    </span>
                  </div>

                  {/* Metric 5: Turnaround Time */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Avg Approval Speed
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">
                        {overview?.avgApprovalTurnaroundHours ?? 0}h
                      </span>
                      <span className="text-xs font-semibold text-slate-500">Turnaround</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium mt-3">
                      From Saturday run to 3 approvals
                    </span>
                  </div>

                  {/* Metric 6: Fairness Index */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Avg Assignments / Usher
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">
                        {fairness?.averageAssignmentsPerMember ?? 0}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Spread: ±{fairness?.standardDeviation ?? 0}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium mt-3">
                      {fairness?.totalEligibleMembers ?? 0} eligible members
                    </span>
                  </div>
                </div>

                {/* Period Trends Comparison */}
                {trends && (
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-red-600" />
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          Performance Comparison vs Previous Period
                        </h3>
                      </div>
                      <span className="text-xs text-slate-400">
                        {trends.previousPeriodLabel || 'Previous equivalent span'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-500 font-semibold">Attendance Rate</span>
                          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                            {overview?.attendanceRate ?? 0}%
                          </div>
                        </div>
                        <div
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                            (trends.attendanceRateChange ?? 0) >= 0
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {(trends.attendanceRateChange ?? 0) >= 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {(trends.attendanceRateChange ?? 0) > 0 ? '+' : ''}
                            {trends.attendanceRateChange ?? 0}%
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-500 font-semibold">Punctuality Rate</span>
                          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                            {attendance?.punctualityRate ?? 0}%
                          </div>
                        </div>
                        <div
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                            (trends.punctualityRateChange ?? 0) >= 0
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {(trends.punctualityRateChange ?? 0) >= 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {(trends.punctualityRateChange ?? 0) > 0 ? '+' : ''}
                            {trends.punctualityRateChange ?? 0}%
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-500 font-semibold">Staffing Coverage</span>
                          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                            {overview?.coverageRate ?? 0}%
                          </div>
                        </div>
                        <div
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                            (trends.coverageRateChange ?? 0) >= 0
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {(trends.coverageRateChange ?? 0) >= 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {(trends.coverageRateChange ?? 0) > 0 ? '+' : ''}
                            {trends.coverageRateChange ?? 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Service Snapshot Preview */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Weekly Service Session Breakdown
                      </h3>
                      <p className="text-xs text-slate-500">
                        Attendance and staffing status for regular weekly services during this period.
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('services')}
                      className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
                    >
                      <span>View Detailed Breakdown</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {services.map((svc: any) => (
                      <div
                        key={svc.sessionKey}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {svc.serviceTitle}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              svc.attendanceRate >= 80
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : svc.attendanceRate >= 60
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {svc.attendanceRate}% Attended
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Staffing Coverage</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {svc.assignedUshers} / {svc.requiredUshers} ushers
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Completed Services</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {svc.completedMeetingsCount} meetings
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${Math.min(svc.attendanceRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ATTENDANCE & PUNCTUALITY */}
            {activeTab === 'attendance' && (
              <div className="flex flex-col gap-6">
                {/* Attendance Distribution Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Verified Present
                    </span>
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                      {attendance?.presentCount ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-2">
                      Attended scheduled service sessions
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Late Arrival
                    </span>
                    <div className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-2">
                      {attendance?.lateCount ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-2">Arrived after grace period</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Excused Absence
                    </span>
                    <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
                      {attendance?.excusedCount ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-2">Official approved excuse requests</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Unexcused Absent
                    </span>
                    <div className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">
                      {attendance?.absentCount ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-2">Missed completed scheduled service</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Upcoming / In Progress
                    </span>
                    <div className="text-3xl font-black text-slate-700 dark:text-slate-300 mt-2">
                      {attendance?.upcomingScheduledCount ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-2">Scheduled for future services</span>
                  </div>
                </div>

                {/* Punctuality Breakdown */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="h-5 w-5 text-blue-600" />
                      <span>Punctuality Breakdown of Attended Services</span>
                    </h3>
                    <span className="text-xs font-bold text-blue-600">
                      Overall Punctuality: {attendance?.punctualityRate ?? 0}%
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Early Arrival</span>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        {attendance?.earlyPresent ?? 0}
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">Arrived ahead of call time</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">On Time</span>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        {attendance?.onTimePresent ?? 0}
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">Arrived within official window</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Grace Period</span>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        {attendance?.gracePeriodPresent ?? 0}
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">Arrived within 15m grace</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Late</span>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        {attendance?.lateCount ?? 0}
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">Recorded late arrival</span>
                    </div>
                  </div>
                </div>

                {/* Clock-in Compliance & Discrepancies */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Clock-in Card */}
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Clock-in Compliance Audit
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Verification of whether scheduled ushers officially clocked in via the mobile app or manual scanner.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <div>
                        <span className="text-xs text-slate-400 block">Clock-in Rate</span>
                        <span className="text-2xl font-black text-emerald-600">
                          {attendance?.clockInComplianceRate ?? 0}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Missing Clock-ins</span>
                        <span className="text-2xl font-black text-rose-600">
                          {attendance?.missingClockInCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Discrepancy Card */}
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Attendance Discrepancy Detector
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Identifies ushers who were scheduled on the published timetable but marked absent or missing in
                        meeting records.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <div>
                        <span className="text-xs text-slate-400 block">Total Flagged Discrepancies</span>
                        <span className="text-2xl font-black text-amber-600">
                          {attendance?.discrepancyCount ?? 0}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedStatuses(['DISCREPANCY']);
                          setActiveTab('search');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                      >
                        Inspect in Search
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: ASSIGNMENT FAIRNESS */}
            {activeTab === 'fairness' && (
              <div className="flex flex-col gap-6">
                {/* Fairness Summary Header */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Average Assignments
                    </span>
                    <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">
                      {fairness?.averageAssignmentsPerMember ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-1 block">
                      Per active eligible member
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Workload Spread (Std Dev)
                    </span>
                    <div className="text-3xl font-black text-indigo-600 mt-2">
                      ±{fairness?.standardDeviation ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-1 block">
                      Lower indicates higher scheduling fairness
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Members with 0 Assignments
                    </span>
                    <div className="text-3xl font-black text-amber-600 mt-2">
                      {fairness?.membersWithZeroAssignmentsCount ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-1 block">
                      Active ushers never scheduled in period
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Total Active Eligible Members
                    </span>
                    <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">
                      {fairness?.totalEligibleMembers ?? 0}
                    </div>
                    <span className="text-xs text-slate-500 mt-1 block">
                      Verified login & profile completion
                    </span>
                  </div>
                </div>

                {/* Assignment Distribution Histogram */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Workload Distribution Histogram
                  </h3>
                  <p className="text-xs text-slate-500 -mt-2">
                    Frequency count of active members by total assignments received during this period.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-3">
                    {fairness?.distributionHistogram?.map((bin: any) => (
                      <div
                        key={bin.count}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center"
                      >
                        <span className="text-xs font-bold text-slate-500">{bin.count} Assignment{bin.count === 1 ? '' : 's'}</span>
                        <span className="text-3xl font-black text-slate-900 dark:text-white mt-1">
                          {bin.memberCount}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold mt-1">
                          {bin.percentage}% of members
                        </span>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-3">
                          <div
                            className="bg-indigo-600 h-full rounded-full"
                            style={{ width: `${Math.min(bin.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Ushers vs Unassigned Ushers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Ushers */}
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Award className="h-4 w-4 text-amber-500" />
                      <span>Most Frequently Assigned Ushers</span>
                    </h4>

                    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                      {fairness?.topAssignedMembers?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4">No assignments recorded in this period.</p>
                      ) : (
                        fairness?.topAssignedMembers?.map((mem: any, idx: number) => (
                          <div
                            key={mem.memberId}
                            className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-xl transition-colors cursor-pointer"
                            onClick={() => loadMemberDrilldown(mem.memberId)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center justify-center">
                                #{idx + 1}
                              </span>
                              <div>
                                <span className="font-bold text-xs text-slate-900 dark:text-white block">
                                  {mem.fullName}
                                </span>
                                <span className="text-[10px] text-slate-400">{mem.memberCode}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                                {mem.assignmentCount} assignments
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Unassigned Ushers */}
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <span>Eligible Members with 0 Assignments (Sample)</span>
                    </h4>

                    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                      {fairness?.zeroAssignmentMembers?.length === 0 ? (
                        <p className="text-xs text-emerald-600 font-semibold py-4">
                          Excellent! 100% of active eligible members have been scheduled at least once.
                        </p>
                      ) : (
                        fairness?.zeroAssignmentMembers?.slice(0, 8).map((mem: any) => (
                          <div
                            key={mem.memberId}
                            className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-xl transition-colors cursor-pointer"
                            onClick={() => loadMemberDrilldown(mem.memberId)}
                          >
                            <div>
                              <span className="font-bold text-xs text-slate-900 dark:text-white block">
                                {mem.fullName}
                              </span>
                              <span className="text-[10px] text-slate-400">{mem.memberCode}</span>
                            </div>
                            <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                              Never Scheduled
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: SERVICE SESSIONS */}
            {activeTab === 'services' && (
              <div className="flex flex-col gap-6">
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Service Session Performance Matrix
                    </h3>
                    <p className="text-xs text-slate-500">
                      Detailed coverage, completion, and attendance rates for each designated weekly service.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Service</th>
                          <th className="py-3 px-3">Scheduled Slots</th>
                          <th className="py-3 px-3">Assigned Ushers</th>
                          <th className="py-3 px-3">Staffing Coverage</th>
                          <th className="py-3 px-3">Completed Meetings</th>
                          <th className="py-3 px-3">Attended</th>
                          <th className="py-3 px-3">Absent</th>
                          <th className="py-3 px-3">Attendance Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {services.map((svc: any) => (
                          <tr key={svc.sessionKey} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white">
                              {svc.serviceTitle}
                            </td>
                            <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 font-semibold">
                              {svc.requiredUshers}
                            </td>
                            <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 font-semibold">
                              {svc.assignedUshers}
                            </td>
                            <td className="py-3.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  svc.coverageRate >= 100
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}
                              >
                                {svc.coverageRate}%
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 font-semibold">
                              {svc.completedMeetingsCount}
                            </td>
                            <td className="py-3.5 px-3 text-emerald-600 dark:text-emerald-400 font-bold">
                              {svc.presentCount}
                            </td>
                            <td className="py-3.5 px-3 text-rose-600 dark:text-rose-400 font-bold">
                              {svc.absentCount}
                            </td>
                            <td className="py-3.5 px-3">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-black ${
                                  svc.attendanceRate >= 80
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : svc.attendanceRate >= 60
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {svc.attendanceRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: SUPERVISING MINISTERS */}
            {activeTab === 'ministers' && (
              <div className="flex flex-col gap-6">
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Supervising Minister Leadership Breakdown
                    </h3>
                    <p className="text-xs text-slate-500">
                      Workforce attendance, scheduled ushers, and punctuality performance under each supervising minister.
                    </p>
                  </div>

                  {ministers.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No supervising minister data recorded for this time period.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                      {ministers.map((min: any) => (
                        <div
                          key={min.ministerId}
                          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bold text-sm text-slate-900 dark:text-white block">
                                {min.ministerName}
                              </span>
                              <span className="text-[10px] text-slate-400">{min.ministerEmail}</span>
                            </div>
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                              {min.servicesSupervised} Services
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                              <span className="text-slate-400 block text-[10px]">Ushers Scheduled</span>
                              <span className="text-lg font-black text-slate-800 dark:text-slate-100">
                                {min.ushersScheduled}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                              <span className="text-slate-400 block text-[10px]">Attendance Rate</span>
                              <span className="text-lg font-black text-emerald-600">
                                {min.attendanceRate}%
                              </span>
                            </div>
                          </div>

                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full"
                              style={{ width: `${Math.min(min.attendanceRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: SEARCH & RECORDS */}
            {activeTab === 'search' && (
              <div className="flex flex-col gap-6">
                {/* Search & Filter Toolbar */}
                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Search Input */}
                    <div className="relative flex-1 max-w-md">
                      <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchFilterChange()}
                        placeholder="Search member name or member code..."
                        className="w-full pl-10 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={clockInFilter}
                        onChange={(e) => {
                          setClockInFilter(e.target.value as any);
                          setSearchPage(1);
                        }}
                        className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      >
                        <option value="ALL">All Clock-In States</option>
                        <option value="RECORDED">Clock-in Recorded</option>
                        <option value="MISSING">Missing Clock-in</option>
                      </select>

                      <button
                        onClick={handleSearchFilterChange}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs"
                      >
                        Filter
                      </button>

                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedSessions([]);
                          setSelectedStatuses([]);
                          setClockInFilter('ALL');
                          setSearchPage(1);
                        }}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Multi-Status Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">
                      Status Filter:
                    </span>
                    {['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'SCHEDULED', 'DISCREPANCY'].map((status) => {
                      const isSelected = selectedStatuses.includes(status);
                      return (
                        <button
                          key={status}
                          onClick={() => {
                            setSelectedStatuses((prev) =>
                              prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
                            );
                            setSearchPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Results Table */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      Showing {searchData?.items?.length ?? 0} of {searchData?.totalCount ?? 0} assignments
                    </span>
                  </div>

                  {searchLoading ? (
                    <div className="py-16 text-center">
                      <PageLoader message="Searching records..." />
                    </div>
                  ) : searchData?.items?.length === 0 ? (
                    <div className="py-16 text-center text-xs text-slate-400">
                      No assignments match your search and filter criteria.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3">Member</th>
                            <th className="py-3 px-3">Service Date</th>
                            <th className="py-3 px-3">Service Session</th>
                            <th className="py-3 px-3">Position</th>
                            <th className="py-3 px-3">Attendance Status</th>
                            <th className="py-3 px-3">Clock-In Time</th>
                            <th className="py-3 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {searchData?.items?.map((item: any) => (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-3">
                                <span className="font-bold text-slate-900 dark:text-white block">
                                  {item.fullName}
                                </span>
                                <span className="text-[10px] text-slate-400">{item.memberCode}</span>
                              </td>
                              <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-semibold">
                                {new Date(item.serviceDate).toLocaleDateString('en-GB')}
                              </td>
                              <td className="py-3 px-3 text-slate-800 dark:text-slate-200 font-bold">
                                {item.serviceTitle}
                              </td>
                              <td className="py-3 px-3 text-slate-500 font-semibold">
                                {item.position || 'Usher'}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                    item.attendanceStatus === 'PRESENT'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : item.attendanceStatus === 'LATE'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                      : item.attendanceStatus === 'ABSENT'
                                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                      : item.attendanceStatus === 'EXCUSED'
                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                                  }`}
                                >
                                  {item.attendanceStatus}
                                </span>
                                {item.isDiscrepancy && (
                                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-500 text-white">
                                    Discrepancy
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-500 font-medium">
                                {item.clockInTime ? (
                                  new Date(item.clockInTime).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                ) : (
                                  <span className="text-slate-400 italic">None</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={() => loadMemberDrilldown(item.memberId)}
                                  className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
                                >
                                  History
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {searchData?.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-xs text-slate-400">
                        Page {searchData.page} of {searchData.totalPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={searchData.page <= 1}
                          onClick={() => setSearchPage((p) => Math.max(p - 1, 1))}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          disabled={searchData.page >= searchData.totalPages}
                          onClick={() => setSearchPage((p) => p + 1)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Member Drill-down Drawer / Modal */}
        {selectedMemberId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {memberData?.member?.fullName || 'Usher Participation Profile'}
                  </h3>
                  <span className="text-xs text-slate-400">{memberData?.member?.memberCode}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedMemberId(null);
                    setMemberData(null);
                  }}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {memberLoading ? (
                <div className="py-12 text-center">
                  <PageLoader message="Loading member participation stats..." />
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Assignments</span>
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        {memberData?.summary?.totalAssignments ?? 0}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Attendance</span>
                      <span className="text-xl font-black text-emerald-600">
                        {memberData?.summary?.attendanceRate ?? 0}%
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Punctuality</span>
                      <span className="text-xl font-black text-blue-600">
                        {memberData?.summary?.punctualityRate ?? 0}%
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Late / Absent</span>
                      <span className="text-xl font-black text-rose-600">
                        {memberData?.summary?.lateCount ?? 0} / {memberData?.summary?.absentCount ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* Assignment History List */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                      Assigned Service Sessions During Period
                    </h4>
                    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                      {memberData?.assignments?.map((item: any) => (
                        <div key={item.id} className="py-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-200 block">
                              {item.serviceTitle}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(item.serviceDate).toLocaleDateString('en-GB')} • Pos: {item.position || 'Usher'}
                            </span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              item.attendanceStatus === 'PRESENT'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : item.attendanceStatus === 'LATE'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : item.attendanceStatus === 'ABSENT'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {item.attendanceStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom Report Export Modal */}
        {exportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-red-600" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Generate Timetable & Attendance Report
                  </h3>
                </div>
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Select Report Type */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Select Report Specification
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                  {REPORT_TYPE_OPTIONS.map((opt) => {
                    const isSelected = selectedReportType === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setSelectedReportType(opt.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                          isSelected
                            ? 'border-red-600 bg-red-50/50 dark:bg-red-950/20'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {opt.label}
                          </span>
                          {isSelected && <Check className="h-4 w-4 text-red-600" />}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-normal">{opt.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Select Format */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Format
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setExportFormat('pdf')}
                    className={`p-3.5 rounded-2xl border flex items-center gap-3 font-bold text-xs transition-all ${
                      exportFormat === 'pdf'
                        ? 'border-red-600 bg-red-50/50 dark:bg-red-950/20 text-red-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <FileText className="h-5 w-5 text-red-600" />
                    <span>Executive Landscape PDF</span>
                  </button>

                  <button
                    onClick={() => setExportFormat('excel')}
                    className={`p-3.5 rounded-2xl border flex items-center gap-3 font-bold text-xs transition-all ${
                      exportFormat === 'excel'
                        ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    <span>7-Sheet Excel Workbook</span>
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleExport()}
                  disabled={exporting}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>{exporting ? 'Generating Report...' : 'Download Report'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
