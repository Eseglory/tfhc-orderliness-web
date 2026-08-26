'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi, removeAuthToken } from '../../../../lib/api';
import { Navbar } from '../../../../components/Navbar';
import { User, Award, Flame, Calendar, Clock, ShieldCheck, LogOut, CheckCircle2, FileText, AlertCircle } from 'lucide-react';

export default function MemberProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await fetchApi('/scoring/my-performance');
      setProfile(data);
    } catch (err: any) {
      console.error('Failed to load member profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    router.push('/login');
  };

  const m = profile?.metrics || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        {/* Profile Avatar Card */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center relative shadow-xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600"></div>

          <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-amber-500 p-1 mx-auto mb-3 shadow-lg shadow-amber-500/20">
            <img src="/logo-icon.svg" alt="Avatar" className="w-full h-full object-contain p-1" />
          </div>

          <h1 className="text-xl font-bold text-white mb-0.5">
            {profile?.member ? `${profile.member.firstName} ${profile.member.lastName}` : 'Bro. Michael'}
          </h1>
          <p className="text-xs text-amber-400 font-medium mb-3">
            {profile?.member?.roleInUnit || 'Protocol Unit Member'} • {profile?.member?.subTeam?.name || 'Protocol Sub-Team'}
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>ID: {profile?.member?.memberCode || 'TFHC-MEM-001'}</span>
          </div>
        </section>

        {/* Formula & Performance Analytics Metrics */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Performance Analytics</h2>

          <div className="grid grid-cols-2 gap-3">
            {/* Attendance Rate Card */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center">
              <div className="text-2xl font-black text-emerald-400 mb-1">
                {m.attendanceRate ? Math.round(m.attendanceRate) : 91.7}%
              </div>
              <div className="text-xs font-semibold text-slate-300">Attendance Rate</div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                ({m.totalPresent || 11}/{m.totalExpected || 12} Attended)
              </div>
            </div>

            {/* Punctuality Rate Card */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center">
              <div className="text-2xl font-black text-amber-400 mb-1">
                {m.punctualityRate ? Math.round(m.punctualityRate) : 81.8}%
              </div>
              <div className="text-xs font-semibold text-slate-300">Punctuality Rate</div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                ({m.totalOnTime || 9}/{m.totalPresent || 11} On Time)
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span className="flex items-center gap-1.5"><Flame className="w-4 h-4 text-amber-500" /> Current Attendance Streak:</span>
              <span className="font-bold text-white">{m.currentAttendanceStreak || 8} Meetings</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="flex items-center gap-1.5"><Award className="w-4 h-4 text-amber-400" /> Leaderboard Rank:</span>
              <span className="font-bold text-amber-400">#{profile?.rankPosition || 6} in Unit</span>
            </div>
          </div>
        </section>

        {/* Account Actions */}
        <section className="space-y-3">
          <button
            onClick={() => router.push('/member/my-attendance')}
            className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-white">Attendance History &amp; Excuses</div>
                <div className="text-xs text-slate-400">View past records or submit absence excuses</div>
              </div>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="w-full bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 rounded-2xl p-4 flex items-center justify-center gap-2 text-rose-400 font-bold text-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </section>
      </main>
    </div>
  );
}
