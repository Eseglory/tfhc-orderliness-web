'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';
import { fetchApi, API_BASE_URL, getAuthToken } from '@/lib/api';

interface ServiceDataPoint {
  id: string;
  title: string;
  date: string;
  attended: number;
  punctual: number;
  absent: number;
  excused: number;
}

interface AnalyticsData {
  days: number;
  since: string;
  until: string;
  services: ServiceDataPoint[];
  statuses: Record<string, number>;
  categories: { name: string; attended: number; absent: number; excused: number }[];
  totals: { attended: number; punctual: number; absent: number; excused: number };
  attendanceRate: number | null;
  punctualityRate: number | null;
  responses: { attending: number; notAttending: number };
  excuses: Record<string, number>;
  members: Record<string, number>;
}

interface ServiceRecordItem {
  id: string;
  title: string;
  startTime: string;
  locationName: string;
  status: string;
  category?: { name: string };
  eventType?: { name: string; color?: string };
  _count?: { attendanceRecords: number };
  preacherName?: string;
  venueCapacity?: number;
  firstTimersCount?: number;
  volunteersCount?: number;
  verificationStatus?: 'Verified' | 'Pending' | 'Automated';
}

export default function AdminReportsPage() {
  const [days, setDays] = useState<number>(90);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedVenue, setSelectedVenue] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(8);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [meetings, setMeetings] = useState<ServiceRecordItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'excel' | 'csv'>('excel');

  // Load real backend analytics and meeting logs
  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsData, meetingsData] = await Promise.all([
        fetchApi<AnalyticsData>(`/reports/analytics?days=${days}`).catch(() => null),
        fetchApi<any[]>('/meetings?limit=50').catch(() => []),
      ]);

      setAnalytics(analyticsData);

      const formattedMeetings: ServiceRecordItem[] = (meetingsData || []).map((m) => {
        const attended =
          m._count?.attendanceRecords ||
          analyticsData?.services?.find((s) => s.id === m.id)?.attended ||
          0;
        const cap = m.locationName?.toLowerCase().includes('chapel')
          ? 300
          : m.locationName?.toLowerCase().includes('youth')
          ? 250
          : 500;
        return {
          id: m.id,
          title: m.title,
          startTime: m.startTime || m.meetingDate,
          locationName: m.locationName || 'The Father’s House Church, Akute Road',
          status: m.status,
          category: m.category,
          eventType: m.eventType,
          _count: { attendanceRecords: attended },
          preacherName: m.preacherName || 'Ministers Council',
          venueCapacity: cap,
          firstTimersCount: m.firstTimersCount || 0,
          volunteersCount: m.volunteersCount || 0,
          verificationStatus:
            m.status === 'CLOSED'
              ? 'Verified'
              : m.status === 'ACTIVE'
              ? 'Automated'
              : 'Pending',
        };
      });

      setMeetings(formattedMeetings);
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days]);

  // Export audit report handler
  const handleExport = async () => {
    setExporting(true);
    try {
      const token = getAuthToken();
      const endpoint = exportFormat === 'csv' ? '/reports/export/csv' : '/reports/export/excel';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to export attendance audit log');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TFHC_Attendance_Audit_Log_${new Date().toISOString().slice(0, 10)}.${exportFormat === 'csv' ? 'csv' : 'xlsx'}`;
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

  // KPI Calculations
  const avgAttendance = useMemo(() => {
    if (!analytics?.services || analytics.services.length === 0) return 0;
    const sum = analytics.services.reduce((acc, s) => acc + s.attended, 0);
    return Math.round(sum / analytics.services.length);
  }, [analytics]);

  const peakService = useMemo(() => {
    if (!analytics?.services || analytics.services.length === 0) return null;
    return analytics.services.reduce((max, s) => (s.attended > max.attended ? s : max), analytics.services[0]);
  }, [analytics]);

  const activeMembersCount = useMemo(() => {
    return analytics?.members?.ACTIVE || 0;
  }, [analytics]);

  const totalAttendees = useMemo(() => {
    return analytics?.totals?.attended || 0;
  }, [analytics]);

  // Filtered service logs
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchesSearch =
        !searchQuery ||
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.preacherName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.locationName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        selectedStatus === 'ALL' ||
        (selectedStatus === 'Verified' && m.verificationStatus === 'Verified') ||
        (selectedStatus === 'Pending' && m.verificationStatus === 'Pending') ||
        (selectedStatus === 'Automated' && m.verificationStatus === 'Automated');

      const matchesVenue =
        selectedVenue === 'ALL' ||
        m.locationName.toLowerCase().includes(selectedVenue.toLowerCase());

      const matchesCategory =
        selectedCategory === 'ALL' ||
        m.category?.name?.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        m.eventType?.name?.toLowerCase().includes(selectedCategory.toLowerCase());

      return matchesSearch && matchesStatus && matchesVenue && matchesCategory;
    });
  }, [meetings, searchQuery, selectedStatus, selectedVenue, selectedCategory]);

  const paginatedMeetings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMeetings.slice(start, start + pageSize);
  }, [filteredMeetings, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredMeetings.length / pageSize) || 1;

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Top Header & Page Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                ATTENDANCE INTELLIGENCE &amp; AUDIT • OPERATIONS BENCHMARKS
              </p>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Attendance Trends &amp; Records
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
              Monitor attendance patterns, session headcount benchmarks, check-in telemetry, and export verified attendance logs.
            </p>
          </div>

          {/* Quick Filters & Actions Bar */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Range Selector */}
            <div className="relative">
              <select
                aria-label="Reporting period"
                value={days}
                onChange={(e) => {
                  setDays(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
                <option value={365}>Last 365 Days</option>
              </select>
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Export Audit Button */}
            <div className="flex items-center rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>{exporting ? 'Exporting...' : 'Export Audit'}</span>
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
              <select
                aria-label="Export format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'excel' | 'csv')}
                className="bg-transparent text-[11px] font-bold text-slate-500 dark:text-slate-400 px-2 py-2 border-0 focus:outline-hidden cursor-pointer"
              >
                <option value="excel">XLSX</option>
                <option value="csv">CSV</option>
              </select>
            </div>

            {/* Primary Action Button */}
            <Link
              href="/admin/live-meeting"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-indigo-600/20 transition-all active:scale-95"
            >
              <Flame className="w-4 h-4 text-amber-300" />
              <span>Log Service Attendance</span>
            </Link>
          </div>
        </div>

        {/* 4 KPI Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. AVG SUNDAY ATTENDANCE */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  AVG. ATTENDANCE
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {avgAttendance}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  attendees / service
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Calculated from closed meetings
              </span>
            </div>
          </div>

          {/* 2. PEAK SERVICE HEADCOUNT */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  PEAK HEADCOUNT
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {peakService?.attended || 0}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  in-person
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                {peakService ? `${peakService.title} (${new Date(peakService.date).toLocaleDateString()})` : 'No closed services yet'}
              </span>
            </div>
          </div>

          {/* 3. REGULAR CONSISTENCY */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  CONSISTENCY RATE
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {analytics?.attendanceRate != null ? `${analytics.attendanceRate}%` : '0%'}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  roster attendance
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Punctuality: {analytics?.punctualityRate != null ? `${analytics.punctualityRate}%` : '0%'}
              </span>
            </div>
          </div>

          {/* 4. TOTAL CHECK-INS */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  TOTAL CHECK-INS
                </span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {totalAttendees}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  recorded
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Active Members: {activeMembersCount}
              </span>
            </div>
          </div>
        </div>

        {/* Audited Service Records Table Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden space-y-0">
          {/* Table Filters Bar */}
          <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full lg:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search service log by leader, date, venue, or notes..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* Category */}
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-hidden"
              >
                <option value="ALL">All Worship Gatherings</option>
                <option value="Sunday">Sunday Services</option>
                <option value="Midweek">Midweek Service</option>
                <option value="Youth">Youth / Special</option>
              </select>

              {/* Status */}
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-hidden"
              >
                <option value="ALL">All Verification Statuses</option>
                <option value="Verified">Verified Audits</option>
                <option value="Automated">Automated Live Logs</option>
                <option value="Pending">Pending Review</option>
              </select>

              <button
                onClick={loadData}
                title="Refresh logs"
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th className="py-3 px-4">Service &amp; Date</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-center">Headcount</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Loading service logs...
                    </td>
                  </tr>
                ) : paginatedMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                      No attendance audit logs found matching current criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedMeetings.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{m.title}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(m.startTime).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {m.locationName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.category?.name || m.eventType?.name || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">
                        {m._count?.attendanceRecords || 0}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            m.status === 'CLOSED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : m.status === 'ACTIVE'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayoutShell>
  );
}
