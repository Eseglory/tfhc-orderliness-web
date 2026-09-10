'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Calendar,
  Flame,
  Download,
  Plus,
  BarChart3,
  CheckCircle,
  TrendingUp,
  Clock,
  Building2,
  RefreshCw,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../components/admin/AdminLayoutShell';
import { AdminKpiCard } from '../../../components/admin/AdminKpiCard';
import { AttendanceTrendsChart, ServiceDataPoint } from '../../../components/admin/AttendanceTrendsChart';
import { TodayOperationsPanel, UpcomingMeetingItem } from '../../../components/admin/TodayOperationsPanel';
import { MemberRetentionCard } from '../../../components/admin/MemberRetentionCard';
import { ActiveTrackersPanel } from '../../../components/admin/ActiveTrackersPanel';
import { ActivityFeedPanel, ActivityItem } from '../../../components/admin/ActivityFeedPanel';
import { PendingActionsPanel } from '../../../components/admin/PendingActionsPanel';
import { fetchApi, API_BASE_URL, getAuthToken } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

interface DashboardStats {
  totalActiveMembers: number;
  meetingsHeld: number;
  avgAttendance: number;
  avgPunctuality: number;
  activeFlagsCount: number;
  pendingExcusesCount: number;
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
  excuses: Record<string, number>;
  members: Record<string, number>;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<UpcomingMeetingItem | null>(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeetingItem[]>([]);
  const [excusesCount, setExcusesCount] = useState<number>(0);
  const [correctionsCount, setCorrectionsCount] = useState<number>(0);
  const [approvalsCount, setApprovalsCount] = useState<number>(0);
  const [flagsCount, setFlagsCount] = useState<number>(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  // Fetch all live dashboard data
  const loadDashboardData = async (selectedDays: number) => {
    setLoading(true);
    try {
      const [
        statsData,
        analyticsData,
        activeData,
        meetingsData,
        excusesData,
        correctionsData,
        approvalsData,
        flagsData,
        auditLogsData,
      ] = await Promise.all([
        fetchApi<DashboardStats>('/reports/dashboard').catch(() => null),
        fetchApi<AnalyticsData>(`/reports/analytics?days=${selectedDays}`).catch(() => null),
        fetchApi<UpcomingMeetingItem | null>('/meetings/active').catch(() => null),
        fetchApi<UpcomingMeetingItem[]>('/meetings?limit=10').catch(() => []),
        fetchApi<any[]>('/excuses/pending').catch(() => []),
        fetchApi<any[]>('/excuses/corrections/pending').catch(() => []),
        fetchApi<any[]>('/approvals/pending').catch(() => []),
        fetchApi<any[]>('/alerts').catch(() => []),
        fetchApi<{ items: any[] }>('/audit-logs?limit=8').catch(() => ({ items: [] })),
      ]);

      setStats(statsData);
      setAnalytics(analyticsData);
      setActiveMeeting(activeData);
      setUpcomingMeetings(meetingsData || []);
      setExcusesCount((excusesData || []).length);
      setCorrectionsCount((correctionsData || []).length);
      setApprovalsCount((approvalsData || []).length);
      setFlagsCount((flagsData || []).length);

      // Transform audit logs into structured activity items
      const mappedActivities: ActivityItem[] = (auditLogsData?.items || []).map((log: any) => {
        let cat: ActivityItem['category'] = 'system';
        if (log.entity?.toLowerCase().includes('member')) cat = 'member';
        else if (log.entity?.toLowerCase().includes('attendance')) cat = 'attendance';
        else if (log.entity?.toLowerCase().includes('approval') || log.entity?.toLowerCase().includes('excuse')) cat = 'approval';
        else if (log.entity?.toLowerCase().includes('payment') || log.entity?.toLowerCase().includes('due')) cat = 'finance';

        return {
          id: log.id,
          action: `${log.action} ${log.entity || ''}`.trim(),
          description: log.reason || `${log.actor?.name || 'Admin'} performed ${log.action?.toLowerCase()} on ${log.entity || 'records'}.`,
          timestamp: log.createdAt,
          actorName: log.actor?.name || 'Administrator',
          category: cat,
          badge: log.entity,
        };
      });

      setActivities(mappedActivities);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData(days);
  }, [days]);

  // Export excel report helper
  const handleExportReport = async () => {
    setExporting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/reports/export/excel`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Failed to download report');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TFHC_Attendance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // Trajectory sparkline data from analytics services
  const sparklineData = useMemo(() => {
    return analytics?.services?.map((x) => x.attended) || [];
  }, [analytics]);

  const lastService = useMemo(() => {
    const s = analytics?.services || [];
    return s.length > 0 ? s[s.length - 1] : null;
  }, [analytics]);

  const totalMembersCount = stats?.totalActiveMembers || 0;
  const lastAttendanceCount = lastService?.attended || stats?.avgAttendance || 0;
  const punctualityRateDisplay = analytics?.punctualityRate != null
    ? `${analytics.punctualityRate}%`
    : stats?.avgPunctuality != null
    ? `${stats.avgPunctuality}%`
    : '0%';

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Executive Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              CAMPUS EXECUTIVE OPERATIONS
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Dashboard Overview
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Real-time church metrics, operational pulse, and upcoming schedules across The Father&apos;s House Church.
            </p>
          </div>

          {/* Quick Controls: Range, Export, Record Attendance */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Range Selector Pill */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    days === d
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Export Report Button */}
            <button
              onClick={handleExportReport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm font-semibold shadow-xs transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>{exporting ? 'Exporting...' : 'Export Report'}</span>
            </button>

            {/* Live Roster Button */}
            <Link
              href="/admin/live-meeting"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 text-xs sm:text-sm font-semibold transition-all active:scale-95"
            >
              <Flame className="w-4 h-4 text-amber-300" />
              <span>Record Attendance</span>
            </Link>
          </div>
        </div>

        {/* 4 KPI Summary Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Total Members */}
          <AdminKpiCard
            label="Total Members"
            value={totalMembersCount.toLocaleString()}
            subValue="active"
            change={{
              value: totalMembersCount > 0 ? `${totalMembersCount} on roster` : 'No members yet',
              positive: totalMembersCount > 0,
              neutral: totalMembersCount === 0,
            }}
            context="Registered active roster"
            sparkline={sparklineData}
            tone="indigo"
            icon={Users}
            onClick={() => window.location.assign('/admin/members')}
          />

          {/* 2. Last Service Attendance */}
          <AdminKpiCard
            label="Last Service Attendance"
            value={lastAttendanceCount.toLocaleString()}
            subValue="attendees"
            change={{
              value: `${punctualityRateDisplay} punctual`,
              positive: Number.parseFloat(punctualityRateDisplay) >= 50,
              neutral: Number.parseFloat(punctualityRateDisplay) === 0,
            }}
            context={lastService?.title || (stats?.meetingsHeld ? `${stats.meetingsHeld} services held` : 'No closed services yet')}
            sparkline={sparklineData}
            tone="emerald"
            icon={BarChart3}
            onClick={() => window.location.assign('/admin/reports')}
          />

          {/* 3. Active Trackers */}
          <AdminKpiCard
            label="Active Trackers"
            value={flagsCount}
            subValue={flagsCount === 0 ? 'all clear' : `${flagsCount} flagged`}
            change={{
              value: flagsCount === 0 ? 'Queue Cleared' : `${flagsCount} Attention Items`,
              positive: flagsCount === 0,
              neutral: flagsCount === 0,
            }}
            context="Pastoral follow-up & alerts"
            tone="amber"
            icon={CheckCircle}
            onClick={() => window.location.assign('/admin/follow-up')}
          />

          {/* 4. Upcoming Operations */}
          <AdminKpiCard
            label="Upcoming Operations"
            value={upcomingMeetings.length}
            subValue={activeMeeting ? '1 Live' : 'Scheduled'}
            change={{
              value: activeMeeting ? 'Live Gathering Active' : `${upcomingMeetings.length} Scheduled`,
              neutral: true,
            }}
            context={upcomingMeetings[0]?.title ? `Next: ${upcomingMeetings[0].title}` : 'Church calendar & series'}
            tone="purple"
            icon={Calendar}
            onClick={() => window.location.assign('/admin/meetings')}
          />
        </div>

        {/* Middle Section: Attendance Trends Chart + Today & Upcoming Operations */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Attendance Trends by Service (7 cols) */}
          <div className="lg:col-span-7">
            <AttendanceTrendsChart
              services={analytics?.services || []}
              days={days}
              onDaysChange={setDays}
              loading={loading}
            />
          </div>

          {/* Right: Today & Upcoming Operations (5 cols) */}
          <div className="lg:col-span-5">
            <TodayOperationsPanel
              meetings={upcomingMeetings}
              activeMeeting={activeMeeting}
              loading={loading}
            />
          </div>
        </div>

        {/* Bottom Section: 4 Operations Panels in 2x2 Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Member Retention & Milestones */}
          <MemberRetentionCard
            totalMembers={totalMembersCount}
            memberStatuses={analytics?.members || { ACTIVE: totalMembersCount }}
            attendanceRate={analytics?.attendanceRate}
            loading={loading}
          />

          {/* Active Trackers & Goals */}
          <ActiveTrackersPanel
            activeFlagsCount={flagsCount}
            loading={loading}
          />

          {/* Recent Ministry Activity Feed */}
          <ActivityFeedPanel
            activities={activities}
            loading={loading}
          />

          {/* Pending Administrative Actions */}
          <PendingActionsPanel
            summary={{
              excusesCount,
              correctionsCount,
              approvalsCount,
              flagsCount,
            }}
            loading={loading}
          />
        </div>
      </div>
    </AdminLayoutShell>
  );
}
