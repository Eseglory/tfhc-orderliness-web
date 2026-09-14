'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Medal,
  Award,
  Flame,
  Users,
  Building2,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Filter,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';

export default function AdminLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [subTeams, setSubTeams] = useState<any[]>([]);
  const [selectedSubTeam, setSelectedSubTeam] = useState('');
  const [activityType, setActivityType] = useState<'ALL' | 'SERVICE' | 'EVENT' | 'MEETING'>('ALL');
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PERFECT' | 'MISSED'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Compute date range based on time filter
  const dateRange = useMemo(() => {
    const now = new Date();
    if (timeFilter === 'WEEK') {
      const start = new Date(now.getTime() - 7 * 86400000);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (timeFilter === 'MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (timeFilter === 'YEAR') {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (timeFilter === 'CUSTOM' && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    return {};
  }, [timeFilter, customStartDate, customEndDate]);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSubTeam) params.set('subTeamId', selectedSubTeam);
      if (activityType !== 'ALL') params.set('activityType', activityType);
      if (statusFilter !== 'ALL') params.set('statusFilter', statusFilter);
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');

      const [ldData, stData] = await Promise.all([
        fetchApi<any[]>(`/scoring/leaderboard?${params.toString()}`).catch(() => []),
        fetchApi<any[]>('/scoring/sub-teams').catch(() => []),
      ]);
      setLeaderboard(ldData || []);
      setSubTeams(stData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedSubTeam, activityType, statusFilter, dateRange, search]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const topThree = useMemo(() => {
    return leaderboard.slice(0, 3);
  }, [leaderboard]);

  // Aggregate KPI summary for the current filtered slice
  const kpis = useMemo(() => {
    const totalRanked = leaderboard.length;
    const perfectCount = leaderboard.filter((m) => m.isPerfectAttendance).length;
    const avgRate =
      totalRanked > 0
        ? Math.round(
            (leaderboard.reduce((sum, m) => sum + (m.attendanceRate || 0), 0) / totalRanked) * 10
          ) / 10
        : 0;
    const maxStreak =
      leaderboard.length > 0 ? Math.max(...leaderboard.map((m) => m.currentAttendanceStreak || 0)) : 0;

    return { totalRanked, perfectCount, avgRate, maxStreak };
  }, [leaderboard]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumbs & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>PEOPLE &amp; COMMUNITY</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">LEADERBOARD &amp; RANKINGS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Attendance &amp; Participation Leaderboard
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Authoritative ranking reconciled from attendance records across Services, Events, and Meetings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadLeaderboard}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
              Recalculate Rankings
            </button>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Top Champion</span>
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <p className="mt-2 text-lg font-black text-slate-900 dark:text-white truncate">
              {topThree[0]?.firstName ? `${topThree[0].firstName} ${topThree[0].lastName}` : '—'}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              {topThree[0]?.compositeScore ? `${topThree[0].compositeScore}% Score` : 'No records'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Perfect Attendance</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-600">{kpis.perfectCount}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">100% attendance rate</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Average Rate</span>
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-indigo-600">{kpis.avgRate}%</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Filtered member cohort</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Longest Streak</span>
              <Flame className="w-4 h-4 text-rose-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-rose-600">{kpis.maxStreak}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Consecutive sessions</p>
          </div>
        </div>

        {/* Top Podium 3 Spotlight Cards */}
        {topThree.length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Rank 2 (Silver) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 relative overflow-hidden order-2 md:order-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400">RANK #2 • SILVER</span>
                <Medal className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {topThree[1].firstName} {topThree[1].lastName}
                </h3>
                <p className="text-xs text-slate-500">{topThree[1].subTeamName || 'General Registry'}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span>
                  Attended:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {topThree[1].attendedCount}/{topThree[1].expectedCount}
                  </strong>
                </span>
                <span className="font-bold text-indigo-600">{topThree[1].compositeScore}% Score</span>
              </div>
            </div>

            {/* Rank 1 (Gold / Elevated) */}
            <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-900/40 rounded-2xl border border-amber-400/60 dark:border-amber-500/40 p-5 shadow-lg space-y-3 relative overflow-hidden order-1 md:order-2 md:-translate-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 uppercase flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> RANK #1 • CHAMPION
                </span>
                <Trophy className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {topThree[0].firstName} {topThree[0].lastName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {topThree[0].subTeamName || 'General Registry'}
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-amber-200/40 text-xs">
                <span>
                  Attended:{' '}
                  <strong className="text-amber-600 dark:text-amber-400 font-black">
                    {topThree[0].attendedCount}/{topThree[0].expectedCount}
                  </strong>
                </span>
                <span className="font-black text-slate-900 dark:text-white">{topThree[0].compositeScore}% Score</span>
              </div>
            </div>

            {/* Rank 3 (Bronze) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 relative overflow-hidden order-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-700">RANK #3 • BRONZE</span>
                <Award className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {topThree[2].firstName} {topThree[2].lastName}
                </h3>
                <p className="text-xs text-slate-500">{topThree[2].subTeamName || 'General Registry'}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span>
                  Attended:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {topThree[2].attendedCount}/{topThree[2].expectedCount}
                  </strong>
                </span>
                <span className="font-bold text-indigo-600">{topThree[2].compositeScore}% Score</span>
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          {/* Row 1: Activity Filter Tabs & Time Range Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            {/* Activity Type Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              {(['ALL', 'SERVICE', 'EVENT', 'MEETING'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setActivityType(type)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activityType === type
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {type === 'ALL' ? 'All Activities' : type === 'SERVICE' ? 'Services' : type === 'EVENT' ? 'Events' : 'Meetings'}
                </button>
              ))}
            </div>

            {/* Time Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              {(
                [
                  { key: 'ALL', label: 'All Time' },
                  { key: 'WEEK', label: 'This Week' },
                  { key: 'MONTH', label: 'This Month' },
                  { key: 'YEAR', label: 'This Year' },
                  { key: 'CUSTOM', label: 'Custom' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTimeFilter(t.key)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    timeFilter === t.key
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Search, Sub-Team, Status Filter & Custom Date Inputs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, code, or unit..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="ALL">All Attendance Statuses</option>
                <option value="PERFECT">⭐ Perfect Attendance (100%)</option>
                <option value="MISSED">⚠️ Missed One or More</option>
              </select>

              {/* Sub-Team Dropdown */}
              <select
                value={selectedSubTeam}
                onChange={(e) => setSelectedSubTeam(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="">All Sub-Teams &amp; Units</option>
                {subTeams.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>

              {/* Custom Date Pickers */}
              {timeFilter === 'CUSTOM' && (
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-5">RANK</th>
                  <th className="py-3.5 px-4">MEMBER NAME</th>
                  <th className="py-3.5 px-4">TEAM / UNIT</th>
                  <th className="py-3.5 px-4">SESSIONS (ATT/EXP)</th>
                  <th className="py-3.5 px-4">COMPOSITE SCORE</th>
                  <th className="py-3.5 px-4">ATTENDANCE %</th>
                  <th className="py-3.5 px-4">PUNCTUALITY %</th>
                  <th className="py-3.5 px-4">TOTAL POINTS</th>
                  <th className="py-3.5 px-5 text-right">STREAK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {leaderboard.length > 0 ? (
                  leaderboard.map((item) => (
                    <tr
                      key={item.memberId}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        item.rank === 1
                          ? 'bg-amber-50/40 dark:bg-amber-950/20'
                          : item.rank === 2
                          ? 'bg-slate-50/50 dark:bg-slate-800/20'
                          : item.rank === 3
                          ? 'bg-orange-50/30 dark:bg-orange-950/10'
                          : ''
                      }`}
                    >
                      <td className="py-3.5 px-5 font-black">
                        {item.rank === 1 ? (
                          <span className="inline-flex items-center gap-1 text-amber-500 font-black">
                            <Trophy className="w-4 h-4" /> #1
                          </span>
                        ) : item.rank === 2 ? (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-bold">
                            <Medal className="w-4 h-4" /> #2
                          </span>
                        ) : item.rank === 3 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                            <Award className="w-4 h-4" /> #3
                          </span>
                        ) : (
                          <span className="text-slate-500 font-bold">#{item.rank}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        <Link
                          href={`/admin/members/${item.memberId}`}
                          className="hover:text-indigo-600 transition-colors flex items-center gap-1.5"
                        >
                          <span>
                            {item.firstName} {item.lastName}
                          </span>
                          {item.isPerfectAttendance && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              title="100% Perfect Attendance"
                            >
                              PERFECT
                            </span>
                          )}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                          {item.subTeamName || 'General Registry'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-300">
                        {item.attendedCount} / {item.expectedCount}
                      </td>

                      <td className="py-3.5 px-4 font-black text-slate-900 dark:text-white">
                        <span className="text-indigo-600 dark:text-indigo-400">{item.compositeScore}%</span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full"
                              style={{ width: `${Math.min(100, item.attendanceRate || 0)}%` }}
                            />
                          </div>
                          <span>{item.attendanceRate}%</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">{item.punctualityRate}%</td>

                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{item.totalPoints} pts</td>

                      <td className="py-3.5 px-5 text-right">
                        {item.currentAttendanceStreak > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Flame className="w-3 h-3 text-amber-500" />
                            {item.currentAttendanceStreak} Sessions
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">0</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-xs text-slate-400">
                      No leaderboard scores available for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
