'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../lib/api';
import { Navbar } from '../../../components/Navbar';
import { QrCode, Calendar, TrendingUp, TrendingDown, Award, Flame, Users, Clock, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function MemberDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // 1. Fetch Performance Metrics
      const myPerf = await fetchApi('/scoring/my-performance');
      setProfile(myPerf);

      // 2. Fetch Active Meetings
      const activeMs = await fetchApi('/meetings/active');
      if (activeMs && activeMs.length > 0) {
        setActiveMeeting(activeMs[0]);
      }

      // 3. Fetch All Meetings for Upcoming Schedule
      const allMs = await fetchApi('/meetings');
      setUpcomingMeetings(allMs.slice(0, 3));
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const attendanceRate = profile?.metrics?.attendanceRate ? Math.round(profile.metrics.attendanceRate) : 91.7;
  const punctualityRate = profile?.metrics?.punctualityRate ? Math.round(profile.metrics.punctualityRate) : 81.8;
  const totalPoints = profile?.metrics?.totalPoints || 210;
  const rankPosition = profile?.rankPosition || 6;
  const currentStreak = profile?.metrics?.currentAttendanceStreak || 8;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        {/* Top AppBar Avatar Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 p-0.5 overflow-hidden shadow-md">
              <img src="/logo-icon.svg" alt="Avatar" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Dashboard</span>
              <h1 className="text-xl font-bold text-white">Hello, {profile?.member?.firstName || 'Bro. Michael'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full text-xs font-bold text-amber-400">
              <Flame className="w-4 h-4 fill-amber-500" />
              <span>{currentStreak} Streak</span>
            </span>
          </div>
        </div>

        {/* Live Meeting Banner Widget (Stitch Screen 1) */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-500 to-amber-600"></div>

          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-white">
                  {activeMeeting ? activeMeeting.title : 'Saturday Unit Meeting'}
                </h2>
                <span className="text-[10px] font-bold bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30">
                  Compulsory
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {activeMeeting
                    ? `Today, ${new Date(activeMeeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${activeMeeting.locationName}`
                    : 'Today, 9:00 AM • Auditorium'}
                </span>
              </p>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 flex items-center justify-between border border-slate-700/50 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
              <span className="text-xs font-semibold text-slate-200">Attendance Window Open</span>
            </div>
            <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg">
              Closes in 42 mins
            </span>
          </div>

          <Link
            href="/member/check-in"
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 font-bold text-slate-950 text-sm transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
          >
            <QrCode className="w-5 h-5" />
            <span>Proceed to Check-In</span>
          </Link>
        </section>

        {/* Quick Stats Carousel (Stitch Screen 1) */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Performance Overview</h3>
            <span className="text-xs text-amber-400 font-semibold">Live Rank #{rankPosition}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Stat Card 1: Attendance Rate */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
              <div className="flex justify-between items-center w-full mb-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +2%
                </span>
              </div>
              <div>
                <div className="text-2xl font-black text-white">{attendanceRate}%</div>
                <div className="text-[11px] font-medium text-slate-400">Attendance Rate</div>
              </div>
            </div>

            {/* Stat Card 2: Punctuality */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
              <div className="flex justify-between items-center w-full mb-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +1%
                </span>
              </div>
              <div>
                <div className="text-2xl font-black text-white">{punctualityRate}%</div>
                <div className="text-[11px] font-medium text-slate-400">Punctuality</div>
              </div>
            </div>

            {/* Stat Card 3: Total Points */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-center w-full mb-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-black text-amber-400">#{rankPosition}</span>
              </div>
              <div>
                <div className="text-2xl font-black text-white">{totalPoints}</div>
                <div className="text-[11px] font-medium text-slate-400">Total Points</div>
              </div>
            </div>

            {/* Stat Card 4: Streak */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
              <div className="flex justify-between items-center w-full mb-2">
                <Flame className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{currentStreak}</div>
                <div className="text-[11px] font-medium text-slate-400">Consecutive Streak</div>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Schedule (Stitch Screen 1) */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Upcoming Schedule</h3>
            <Link href="/member/my-attendance" className="text-xs font-semibold text-amber-400 hover:underline">
              View All
            </Link>
          </div>

          <div className="space-y-2.5">
            {upcomingMeetings.map((m, idx) => (
              <div key={m.id || idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between shadow-md hover:border-slate-700 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-white">
                    <span className="text-xs font-bold leading-none">{new Date(m.meetingDate).getDate() || 14 + idx}</span>
                    <span className="text-[9px] uppercase font-semibold text-slate-400 leading-none mt-0.5">NOV</span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{m.title}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {m.locationName}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  +{m.pointWeight * 10 || 15} pts
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
