'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../../../../components/Navbar';
import { fetchApi } from '../../../../lib/api';
import { Trophy, Medal, Award } from 'lucide-react';

export default function AdminLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [subTeams, setSubTeams] = useState<any[]>([]);
  const [selectedSubTeam, setSelectedSubTeam] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedSubTeam
        ? `/scoring/leaderboard?subTeamId=${selectedSubTeam}`
        : '/scoring/leaderboard';
      const [ldData, stData] = await Promise.all([
        fetchApi(url),
        fetchApi('/members/sub-teams'),
      ]);
      setLeaderboard(ldData);
      setSubTeams(stData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedSubTeam]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Unit Participation Leaderboard</h1>
            <p className="text-xs text-slate-400 mt-1">
              Composite Ranking = (Attendance Rate × 60%) + (Punctuality Rate × 40%)
            </p>
          </div>

          <select
            value={selectedSubTeam}
            onChange={(e) => setSelectedSubTeam(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Sub-Teams</option>
            {subTeams.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/70 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4">Member Name</th>
                  <th className="px-6 py-4">Sub-Team</th>
                  <th className="px-6 py-4">Composite Score</th>
                  <th className="px-6 py-4">Attendance %</th>
                  <th className="px-6 py-4">Punctuality %</th>
                  <th className="px-6 py-4">Total Points</th>
                  <th className="px-6 py-4">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {leaderboard.length > 0 ? (
                  leaderboard.map((item) => (
                    <tr
                      key={item.memberId}
                      className={`hover:bg-slate-800/40 ${
                        item.rank === 1
                          ? 'bg-amber-500/5'
                          : item.rank === 2
                          ? 'bg-slate-300/5'
                          : item.rank === 3
                          ? 'bg-amber-700/5'
                          : ''
                      }`}
                    >
                      <td className="px-6 py-4 font-bold">
                        {item.rank === 1 ? (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-extrabold">
                            <Trophy className="w-5 h-5" /> #1
                          </span>
                        ) : item.rank === 2 ? (
                          <span className="inline-flex items-center gap-1 text-slate-300 font-bold">
                            <Medal className="w-4 h-4" /> #2
                          </span>
                        ) : item.rank === 3 ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                            <Medal className="w-4 h-4" /> #3
                          </span>
                        ) : (
                          <span className="text-slate-400">#{item.rank}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-white">
                        {item.firstName} {item.lastName}
                        <span className="block text-xs font-normal text-slate-400">{item.memberCode}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{item.subTeamName}</td>
                      <td className="px-6 py-4 font-extrabold text-indigo-400 text-base">
                        {item.compositeScore}%
                      </td>
                      <td className="px-6 py-4 font-semibold text-emerald-400">{item.attendanceRate}%</td>
                      <td className="px-6 py-4 font-semibold text-sky-400">{item.punctualityRate}%</td>
                      <td className="px-6 py-4 font-bold text-amber-400">+{item.totalPoints}</td>
                      <td className="px-6 py-4 font-bold text-orange-400">
                        {item.currentAttendanceStreak > 0 ? `${item.currentAttendanceStreak} 🔥` : '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      {loading ? 'Calculating unit performance ratings...' : 'No leaderboard data available.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
