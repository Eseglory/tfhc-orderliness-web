'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { StatusBadge } from '../../../components/StatusBadge';
import { fetchApi } from '../../../lib/api';
import { Award, Calendar, CheckSquare, Flame, Clock } from 'lucide-react';

export default function MemberDashboardPage() {
  const [perf, setPerf] = useState<any>(null);
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [perfData, activeData] = await Promise.all([
          fetchApi('/scoring/my-performance').catch(() => null),
          fetchApi('/meetings/active').catch(() => null),
        ]);
        setPerf(perfData);
        setActiveMeeting(activeData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {perf?.member?.firstName || 'Member'} 👋
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Member ID: <span className="text-indigo-400 font-medium">{perf?.member?.memberCode || 'TFHC-MEM'}</span> | Sub-Team: <span className="text-slate-300">{perf?.member?.subTeam?.name || 'Protocol'}</span>
            </p>
          </div>
          <Link
            href="/member/check-in"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-white transition-all shadow-lg shadow-indigo-500/25"
          >
            <CheckSquare className="w-5 h-5" /> Open Check-In
          </Link>
        </div>

        {/* Active Meeting Banner */}
        {activeMeeting ? (
          <div className="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-500/30 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                🟢 Attendance Currently Active
              </span>
              <h2 className="text-xl font-bold text-white mt-2">{activeMeeting.title}</h2>
              <p className="text-xs text-slate-300 mt-1">
                Venue: {activeMeeting.locationName} | Closes at: {new Date(activeMeeting.attendanceCloseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <Link
              href="/member/check-in"
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-sm uppercase tracking-wider"
            >
              Verify & Check In Now
            </Link>
          </div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center text-sm text-slate-400">
            No active meeting check-in currently in progress.
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Attendance Rate</span>
              <Calendar className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{perf?.attendanceRate ?? 0}%</div>
            <div className="text-xs text-slate-500 mt-1">{perf?.attendedCount ?? 0} / {perf?.expectedCount ?? 0} meetings attended</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Punctuality Rate</span>
              <Clock className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{perf?.punctualityRate ?? 0}%</div>
            <div className="text-xs text-slate-500 mt-1">{perf?.onTimeCount ?? 0} on-time attendances</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Points</span>
              <Award className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{perf?.totalPoints ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">Weighted performance score</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Current Streak</span>
              <Flame className="w-5 h-5 text-orange-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{perf?.currentAttendanceStreak ?? 0} 🔥</div>
            <div className="text-xs text-slate-500 mt-1">Consecutive meetings attended</div>
          </div>
        </div>

        {/* Recent Attendance History */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Recent Attendance History</h2>
            <Link href="/member/my-attendance" className="text-xs text-indigo-400 hover:underline">
              View All
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Meeting Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Arrival Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {perf?.recentRecords && perf.recentRecords.length > 0 ? (
                  perf.recentRecords.map((r: any) => (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3.5 font-medium text-white">{r.meeting?.title}</td>
                      <td className="px-4 py-3.5 text-slate-400">{r.meeting?.category?.name}</td>
                      <td className="px-4 py-3.5 text-slate-400">
                        {r.actualArrivalTime
                          ? new Date(r.actualArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'N/A'}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-amber-400">+{r.pointsEarned}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No attendance records found yet.
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
