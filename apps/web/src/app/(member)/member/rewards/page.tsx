'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../../../lib/api';
import { Navbar } from '../../../../components/Navbar';
import { Award, Flame, Star, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function MemberRewardsPage() {
  const [perf, setPerf] = useState<any>(null);

  useEffect(() => {
    fetchApi('/scoring/my-performance')
      .then((data) => setPerf(data))
      .catch((err) => console.error(err));
  }, []);

  const totalPoints = perf?.metrics?.totalPoints || 210;

  const badges = [
    { id: '1', title: 'Punctuality Champion', desc: 'Arrived on time for 5 consecutive meetings', points: '50 pts', unlocked: true },
    { id: '2', title: 'Fire Streak', desc: 'Achieved an 8-meeting attendance streak', points: '100 pts', unlocked: true },
    { id: '3', title: 'Orderliness Excellence', desc: 'Maintained >90% Attendance Rate for 1 Month', points: '200 pts', unlocked: true },
    { id: '4', title: 'Unit Vanguard', desc: 'Top 3 rank in Protocol Sub-Team', points: '300 pts', unlocked: false },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <span>Rewards &amp; Badges</span>
          </h1>
          <p className="text-xs text-slate-400">Orderliness participation recognition &amp; achievements</p>
        </div>

        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-xl space-y-2">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
            <Star className="w-8 h-8 fill-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400">{totalPoints}</div>
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Accumulated Points</div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Earned Achievement Badges</h2>

          {badges.map((b) => (
            <div key={b.id} className={`bg-slate-900 border rounded-2xl p-4 flex items-center justify-between shadow-lg ${b.unlocked ? 'border-amber-500/30' : 'border-slate-800 opacity-60'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${b.unlocked ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    {b.title}
                    {b.unlocked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </h3>
                  <p className="text-xs text-slate-400">{b.desc}</p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                {b.points}
              </span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
