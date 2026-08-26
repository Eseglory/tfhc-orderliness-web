'use client';

import React from 'react';
import { Navbar } from '../../../../components/Navbar';
import { Bell, CheckCircle2, Clock, ShieldAlert, Award } from 'lucide-react';

export default function MemberNotificationsPage() {
  const notifications = [
    { id: '1', title: 'Check-In Confirmed', message: 'You checked in on time for Saturday Unit Meeting (+10 pts)', time: '2 hours ago', icon: CheckCircle2, color: 'text-emerald-400' },
    { id: '2', title: 'Upcoming Session Alert', message: 'Mid-Week Service starts in 45 minutes at the Main Hall', time: 'Yesterday', icon: Clock, color: 'text-amber-400' },
    { id: '3', title: 'Streak Badge Unlocked!', message: 'Congratulations! You achieved an 8-meeting attendance streak.', time: '3 days ago', icon: Award, color: 'text-amber-500' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <span>Activity Notifications</span>
          </h1>
          <p className="text-xs text-slate-400">Meeting alerts, streak updates &amp; check-in logs</p>
        </div>

        <div className="space-y-3">
          {notifications.map((n) => {
            const Icon = n.icon;
            return (
              <div key={n.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-start gap-3 shadow-lg">
                <div className={`p-2 rounded-xl bg-slate-800 ${n.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <h2 className="text-sm font-bold text-white">{n.title}</h2>
                    <span className="text-[10px] text-slate-500">{n.time}</span>
                  </div>
                  <p className="text-xs text-slate-300">{n.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
