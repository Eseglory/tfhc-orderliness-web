'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Flame,
  ArrowUpRight,
  RefreshCw,
  Search,
  Filter,
  Users,
  DollarSign,
  FileText,
  CheckSquare,
  BarChart3,
  Calendar,
  Sparkles,
  TrendingUp,
  ChevronRight,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useToast } from '../../../../components/ui';

interface TrackerStat {
  pendingApprovals: number;
  pendingExcuses: number;
  pendingCorrections: number;
  activeFlagsCount: number;
  criticalFlagsCount: number;
  totalMembers: number;
  activeMembers: number;
  recentAttendanceRate: number;
  duesCollectionRate: number;
}

export default function AdminTrackerPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'attendance' | 'approvals' | 'followup' | 'finance'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [flags, setFlags] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [pendingExcuses, setPendingExcuses] = useState<any[]>([]);
  const [pendingCorrections, setPendingCorrections] = useState<any[]>([]);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [financeData, setFinanceData] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fData, aData, eData, cData, rData, finData] = await Promise.all([
        can('excuses.review') ? fetchApi<any[]>('/alerts').catch(() => []) : Promise.resolve([]),
        can('approvals.act') || can('approvals.read') ? fetchApi<any[]>('/approvals/pending').catch(() => []) : Promise.resolve([]),
        can('excuses.review') ? fetchApi<any[]>('/excuses/pending').catch(() => []) : Promise.resolve([]),
        can('corrections.review') || can('excuses.review') ? fetchApi<any[]>('/excuses/corrections/pending').catch(() => []) : Promise.resolve([]),
        can('reports.view') ? fetchApi<any>('/reports/dashboard').catch(() => null) : Promise.resolve(null),
        can('finance.read') ? fetchApi<any>('/finance/dashboard').catch(() => null) : Promise.resolve(null),
      ]);

      setFlags(fData || []);
      setPendingApprovals(aData || []);
      setPendingExcuses(eData || []);
      setPendingCorrections(cData || []);
      setDashboardData(rData);
      setFinanceData(finData);
    } catch (err) {
      console.error('Tracker load failed', err);
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    try {
      await fetchApi('/alerts/evaluate', { method: 'POST' });
      notify('Threshold evaluation completed successfully', 'success');
      await loadData();
    } catch (err: any) {
      notify(err.message || 'Evaluation failed', 'error');
    } finally {
      setEvaluating(false);
    }
  };

  const stats: TrackerStat = useMemo(() => {
    const totalMembers = dashboardData?.totalMembers || 0;
    const activeMembers = dashboardData?.activeMembers || 0;
    const recentAttendanceRate = dashboardData?.overallAttendanceRate !== undefined && dashboardData?.overallAttendanceRate !== null
      ? Math.round(dashboardData.overallAttendanceRate)
      : (dashboardData?.avgAttendance ? Math.round(dashboardData.avgAttendance) : 0);
    const criticalFlags = flags.filter((f) => f.flagLevel === 3).length;

    let computedDuesRate = 0;
    if (financeData?.dues?.totalExpected && financeData.dues.totalExpected > 0) {
      computedDuesRate = Math.min(100, Math.round((financeData.dues.collectedAmount / financeData.dues.totalExpected) * 100));
    } else if (financeData?.dues?.collectedAmount && financeData.dues.collectedAmount > 0) {
      computedDuesRate = 100;
    }

    return {
      pendingApprovals: pendingApprovals.length,
      pendingExcuses: pendingExcuses.length,
      pendingCorrections: pendingCorrections.length,
      activeFlagsCount: flags.length,
      criticalFlagsCount: criticalFlags,
      totalMembers,
      activeMembers,
      recentAttendanceRate,
      duesCollectionRate: computedDuesRate,
    };
  }, [flags, pendingApprovals, pendingExcuses, pendingCorrections, dashboardData, financeData]);

  const trackerModules = [
    {
      id: 'tracker-followup',
      category: 'followup',
      title: 'Follow-Up & Absenteeism Flags',
      subtitle: stats.activeFlagsCount === 0
        ? 'All member follow-up queues and consecutive absence flags resolved'
        : `${stats.activeFlagsCount} members flagged for consecutive unexcused absences (${stats.criticalFlagsCount} Critical)`,
      progressPct: stats.activeFlagsCount === 0 ? 100 : Math.max(10, Math.round(100 - stats.activeFlagsCount * 12)),
      targetLabel: stats.activeFlagsCount === 0 ? '100% Resolved' : `${stats.activeFlagsCount} Active Flags`,
      tone: (stats.activeFlagsCount === 0 ? 'emerald' : stats.criticalFlagsCount > 0 ? 'rose' : 'amber') as 'emerald' | 'rose' | 'amber',
      badge: stats.activeFlagsCount === 0 ? 'All Clear' : `${stats.activeFlagsCount} Requiring Action`,
      href: '/admin/follow-up',
      ctaText: 'Open Follow-Up Board',
      icon: ShieldAlert,
    },
    {
      id: 'tracker-approvals',
      category: 'approvals',
      title: 'Governance & Operational Approvals',
      subtitle: stats.pendingApprovals === 0
        ? 'Zero pending approval bottlenecks'
        : `${stats.pendingApprovals} requests currently awaiting administrative decision`,
      progressPct: stats.pendingApprovals === 0 ? 100 : Math.max(15, Math.round(100 - stats.pendingApprovals * 15)),
      targetLabel: stats.pendingApprovals === 0 ? '0 in Queue' : `${stats.pendingApprovals} In Queue`,
      tone: (stats.pendingApprovals === 0 ? 'emerald' : 'indigo') as 'emerald' | 'indigo',
      badge: stats.pendingApprovals === 0 ? 'Queue Cleared' : `${stats.pendingApprovals} Pending SLA`,
      href: '/admin/approvals',
      ctaText: 'Review Approvals',
      icon: CheckSquare,
    },
    {
      id: 'tracker-excuses',
      category: 'approvals',
      title: 'Absence Excuses & Attendance Corrections',
      subtitle: stats.pendingExcuses + stats.pendingCorrections === 0
        ? 'All absence reasons and roster corrections reviewed'
        : `${stats.pendingExcuses} excuses and ${stats.pendingCorrections} corrections pending review`,
      progressPct: (stats.pendingExcuses + stats.pendingCorrections) === 0 ? 100 : Math.max(10, Math.round(100 - (stats.pendingExcuses + stats.pendingCorrections) * 10)),
      targetLabel: (stats.pendingExcuses + stats.pendingCorrections) === 0 ? 'All Reviewed' : `${stats.pendingExcuses + stats.pendingCorrections} Pending`,
      tone: ((stats.pendingExcuses + stats.pendingCorrections) === 0 ? 'emerald' : 'purple') as 'emerald' | 'purple',
      badge: (stats.pendingExcuses + stats.pendingCorrections) === 0 ? 'Up To Date' : `${stats.pendingExcuses + stats.pendingCorrections} Awaiting Review`,
      href: '/admin/absence-requests',
      ctaText: 'Review Absence Requests',
      icon: FileText,
    },
    {
      id: 'tracker-attendance',
      category: 'attendance',
      title: 'Overall Attendance & Punctuality Benchmark',
      subtitle: stats.recentAttendanceRate === 0
        ? 'Attendance benchmark tracking will activate automatically as gatherings conclude (Target: 80%)'
        : `Overall attendance consistency target (Target: 80%, Current: ${stats.recentAttendanceRate}%)`,
      progressPct: stats.recentAttendanceRate === 0 ? 0 : Math.min(100, stats.recentAttendanceRate),
      targetLabel: stats.recentAttendanceRate === 0 ? '0% (No Records Yet)' : `${stats.recentAttendanceRate}% Met`,
      tone: (stats.recentAttendanceRate === 0 ? 'indigo' : stats.recentAttendanceRate >= 80 ? 'emerald' : 'amber') as 'emerald' | 'amber' | 'indigo',
      badge: stats.recentAttendanceRate === 0 ? 'No Data Yet' : stats.recentAttendanceRate >= 80 ? 'Above Benchmark' : 'Below Target',
      href: '/admin/reports',
      ctaText: 'View Detailed Trends',
      icon: BarChart3,
    },
    {
      id: 'tracker-dues',
      category: 'finance',
      title: 'Monthly Stewardship & Dues Collection',
      subtitle: 'Monthly unit member commitments and benevolent fund contributions',
      progressPct: stats.duesCollectionRate,
      targetLabel: `${stats.duesCollectionRate}% Collected`,
      tone: 'indigo' as 'indigo',
      badge: stats.duesCollectionRate > 0 ? 'Active Ledger' : 'No Collections Yet',
      href: '/admin/finance/dues',
      ctaText: 'Open Dues Ledger',
      icon: DollarSign,
    },
  ];

  const filteredTrackers = useMemo(() => {
    return trackerModules.filter((item) => {
      if (activeTab !== 'all' && item.category !== activeTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q);
      }
      return true;
    });
  }, [trackerModules, activeTab, searchQuery]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TRACKING &amp; GOVERNANCE</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">OPERATIONAL TRACKER</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Attendance &amp; Goal Tracker
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Live Monitoring
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time administrative milestones, automated operational thresholds, attendance adherence, and approval queues.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunEvaluation}
              disabled={evaluating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
              <span>{evaluating ? 'Evaluating...' : 'Run Scanner'}</span>
            </button>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Refresh Metrics</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                MEMBER FOLLOW-UP
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.activeFlagsCount}</span>
              <span className={`text-xs font-bold ${stats.activeFlagsCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {stats.activeFlagsCount > 0 ? `${stats.criticalFlagsCount} Critical` : 'All Clear'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Member absenteeism flags</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                APPROVALS QUEUE
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.pendingApprovals}</span>
              <span className="text-xs font-bold text-slate-400">Decisions</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Operational &amp; assistance approvals</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                EXCUSES &amp; AUDITS
              </span>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {stats.pendingExcuses + stats.pendingCorrections}
              </span>
              <span className="text-xs font-bold text-purple-600">Pending</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>{stats.pendingExcuses} excuses • {stats.pendingCorrections} corrections</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ATTENDANCE BENCHMARK
              </span>
              <div className={`p-2 rounded-xl ${stats.recentAttendanceRate > 0 ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-black ${stats.recentAttendanceRate > 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                {stats.recentAttendanceRate}%
              </span>
              <span className="text-xs font-bold text-slate-400">
                {stats.recentAttendanceRate > 0 ? 'Avg Consistency' : 'No Records Yet'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>{stats.recentAttendanceRate > 0 ? 'Target: 80% attendance rate' : 'Awaiting first concluded gathering'}</span>
            </div>
          </div>
        </div>

        {/* Filter Strip & Search */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All Trackers ({trackerModules.length})
            </button>
            <button
              onClick={() => setActiveTab('followup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'followup'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Follow-Up
            </button>
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'approvals'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Approvals &amp; Excuses
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'attendance'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Attendance
            </button>
            <button
              onClick={() => setActiveTab('finance')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'finance'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Finance &amp; Dues
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tracker milestones..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Trackers Detailed Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTrackers.map((tracker) => {
            const barBg = {
              indigo: 'bg-indigo-600',
              emerald: 'bg-emerald-500',
              amber: 'bg-amber-500',
              rose: 'bg-rose-500',
              purple: 'bg-purple-600',
            }[tracker.tone];

            const badgeColor = {
              indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
              emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
              amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
              rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
              purple: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
            }[tracker.tone];

            const IconComponent = tracker.icon;

            return (
              <div
                key={tracker.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 flex flex-col justify-between hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeColor}`}>
                        {tracker.badge}
                      </span>
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {tracker.targetLabel}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      {tracker.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      {tracker.subtitle}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                      <span>Operational Progress</span>
                      <span className="text-slate-700 dark:text-slate-300">{tracker.progressPct}%</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, Math.max(5, tracker.progressPct))}%` }}
                        className={`h-full rounded-full ${barBg} transition-all duration-500`}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Continuous background sync</span>
                  <Link
                    href={tracker.href}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                  >
                    <span>{tracker.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Launchpad Action Center */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-6 text-white space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-300" />
                <h3 className="text-lg font-black tracking-tight">Active Tracking &amp; Governance Launchpad</h3>
              </div>
              <p className="text-xs text-indigo-200">
                Direct access to high-frequency administrative controls, live gathering roster sessions, and approval workflows.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/live-meeting"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors shadow-md font-extrabold"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Live Gathering Session</span>
              </Link>
              <Link
                href="/admin/approvals"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Approvals Center</span>
              </Link>
              <Link
                href="/admin/follow-up"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Follow-Up Board</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
