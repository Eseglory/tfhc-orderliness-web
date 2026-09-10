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
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';

export default function AdminLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [subTeams, setSubTeams] = useState<any[]>([]);
  const [selectedSubTeam, setSelectedSubTeam] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedSubTeam
        ? `/scoring/leaderboard?subTeamId=${selectedSubTeam}`
        : '/scoring/leaderboard';
      const [ldData, stData] = await Promise.all([
        fetchApi<any[]>(url),
        fetchApi<any[]>('/members/sub-teams'),
      ]);
      setLeaderboard(ldData || []);
      setSubTeams(stData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedSubTeam]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const filtered = useMemo(() => {
    if (!search.trim()) return leaderboard;
    const q = search.toLowerCase();
    return leaderboard.filter(
      (item) =>
        item.memberName?.toLowerCase().includes(q) ||
        item.subTeamName?.toLowerCase().includes(q),
    );
  }, [leaderboard, search]);

  const topThree = useMemo(() => {
    return leaderboard.slice(0, 3);
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
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">LEADERBOARD &amp; POINTS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Unit Participation &amp; Scoring Leaderboard
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Composite Ranking = (Attendance Rate × 60%) + (Punctuality Rate × 40%) + Streak Bonus Multipliers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadLeaderboard}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Recalculate Scores
            </button>
          </div>
        </div>

        {/* Top Podium 3 Spotlight Cards */}
        {topThree.length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Rank 2 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 relative overflow-hidden order-2 md:order-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400">RANK #2 • SILVER</span>
                <Medal className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{topThree[1].memberName}</h3>
                <p className="text-xs text-slate-500">{topThree[1].subTeamName || 'General Registry'}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span>Composite Score: <strong className="text-slate-900 dark:text-white">{topThree[1].compositeScore}%</strong></span>
                <span className="font-bold text-indigo-600">{topThree[1].points} Pts</span>
              </div>
            </div>

            {/* Rank 1 (Gold / Elevated) */}
            <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-900/40 rounded-2xl border border-amber-400/60 dark:border-amber-500/40 p-5 shadow-lg space-y-3 relative overflow-hidden order-1 md:order-2 md:-translate-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 uppercase">
                  RANK #1 • CHAMPION
                </span>
                <Trophy className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">{topThree[0].memberName}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{topThree[0].subTeamName || 'General Registry'}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-amber-200/40 text-xs">
                <span>Composite Score: <strong className="text-amber-600 dark:text-amber-400 font-black">{topThree[0].compositeScore}%</strong></span>
                <span className="font-black text-slate-900 dark:text-white">{topThree[0].points} Pts</span>
              </div>
            </div>

            {/* Rank 3 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 relative overflow-hidden order-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-700">RANK #3 • BRONZE</span>
                <Award className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{topThree[2].memberName}</h3>
                <p className="text-xs text-slate-500">{topThree[2].subTeamName || 'General Registry'}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span>Composite Score: <strong className="text-slate-900 dark:text-white">{topThree[2].compositeScore}%</strong></span>
                <span className="font-bold text-indigo-600">{topThree[2].points} Pts</span>
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leaderboard by member or sub-team... (⌘K)"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedSubTeam}
                onChange={(e) => setSelectedSubTeam(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="">All Sub-Teams &amp; Units</option>
                {subTeams.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-5">RANK</th>
                  <th className="py-3 px-4">CONGREGANT NAME</th>
                  <th className="py-3 px-4">MINISTRY / SUB-TEAM</th>
                  <th className="py-3 px-4">COMPOSITE SCORE</th>
                  <th className="py-3 px-4">ATTENDANCE %</th>
                  <th className="py-3 px-4">PUNCTUALITY %</th>
                  <th className="py-3 px-4">TOTAL POINTS</th>
                  <th className="py-3 px-5 text-right">STREAK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filtered.length > 0 ? (
                  filtered.map((item) => (
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
                          href={`/admin/members/${item.memberId || 'ORD-2041'}`}
                          className="hover:text-indigo-600 transition-colors"
                        >
                          {item.memberName}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                          {item.subTeamName || 'General Registry'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-black text-slate-900 dark:text-white">
                        <span className="text-indigo-600 dark:text-indigo-400">{item.compositeScore}%</span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        {item.attendanceRate}%
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        {item.punctualityRate}%
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        {item.points} pts
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        {item.streak > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Flame className="w-3 h-3 text-amber-500" />
                            {item.streak} Services
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">0</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-slate-400">
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
