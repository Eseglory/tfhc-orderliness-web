'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
import { Navbar } from '../../../../components/Navbar';
import { Calendar, Clock, MapPin, QrCode, ArrowRight, ShieldCheck } from 'lucide-react';

export default function MemberMeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMeetings();
  }, []);

  const loadMeetings = async () => {
    try {
      const data = await fetchApi('/meetings');
      setMeetings(data);
    } catch (err: any) {
      console.error('Failed to load meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white">Unit Meetings Schedule</h1>
            <p className="text-xs text-slate-400">Upcoming, active, and past meeting sessions</p>
          </div>
          <Link
            href="/member/check-in"
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span>Check-In</span>
          </Link>
        </div>

        <div className="space-y-3">
          {meetings.length > 0 ? (
            meetings.map((m) => (
              <Link
                key={m.id}
                href={`/member/meetings/${m.id}`}
                className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-all shadow-lg group"
              >
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                    {m.title}
                  </h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                    {m.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>{new Date(m.meetingDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>{m.locationName} ({m.geofenceRadiusMeters}m geofence)</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                  <span className="text-amber-400 font-bold">+{m.pointWeight * 10} Points</span>
                  <span className="text-slate-400 font-medium flex items-center gap-1 group-hover:text-white transition-colors">
                    View Details <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">
              <Calendar className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-medium">No meetings scheduled</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
