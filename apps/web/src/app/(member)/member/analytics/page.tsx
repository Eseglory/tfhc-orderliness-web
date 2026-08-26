'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../../../lib/api';
import { Navbar } from '../../../../components/Navbar';
import { TrendingUp, TrendingDown, Clock, Calendar, Award, Flame, Users, BarChart3 } from 'lucide-react';

export default function MemberAnalyticsPage() {
  const [perf, setPerf] = useState<any>(null);

  useEffect(() => {
    fetchApi('/scoring/my-performance')
      .then((data) => setPerf(data))
      .catch((err) => console.error(err));
  }, []);

  const m = perf?.metrics || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            <span>Performance Analytics</span>
          </h1>
          <p className="text-xs text-slate-400">Detailed breakdown of attendance &amp; punctuality metrics</p>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Attendance Breakdown</span>
            <div className="text-3xl font-black text-emerald-400">{m.attendanceRate ? Math.round(m.attendanceRate) : 91.7}%</div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${m.attendanceRate || 91.7}%` }}></div>
            </div>
            <p className="text-xs text-slate-400">Attended {m.totalPresent || 11} out of {m.totalExpected || 12} compulsory meetings</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Punctuality Score</span>
            <div className="text-3xl font-black text-amber-400">{m.punctualityRate ? Math.round(m.punctualityRate) : 81.8}%</div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full" style={{ width: `${m.punctualityRate || 81.8}%` }}></div>
            </div>
            <p className="text-xs text-slate-400">Arrived early or on time for {m.totalOnTime || 9} meetings</p>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Streak &amp; Leaderboard Impact</h2>
          <div className="flex items-center justify-between text-xs p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="flex items-center gap-2 text-slate-300"><Flame className="w-4 h-4 text-amber-500" /> Attendance Streak</span>
            <span className="font-bold text-white text-sm">{m.currentAttendanceStreak || 8} Meetings</span>
          </div>
          <div className="flex items-center justify-between text-xs p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="flex items-center gap-2 text-slate-300"><Award className="w-4 h-4 text-amber-400" /> Leaderboard Standing</span>
            <span className="font-bold text-amber-400 text-sm">Rank #{perf?.rankPosition || 6}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
