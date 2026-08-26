'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { fetchApi } from '../../../lib/api';
import { Users, Calendar, Award, ShieldAlert, FileText, CheckCircle2, ArrowRight } from 'lucide-react';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, meetingData] = await Promise.all([
          fetchApi('/reports/dashboard').catch(() => null),
          fetchApi('/meetings/active').catch(() => null),
        ]);
        setStats(statsData);
        setActiveMeeting(meetingData);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <div>
            <h1 className="text-2xl font-bold text-white">Unit Leadership Overview</h1>
            <p className="text-xs text-slate-400 mt-1">
              TFHC Orderliness Attendance & Participation Control Center
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/meetings"
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white transition-all shadow-lg shadow-indigo-500/20"
            >
              + Create Meeting
            </Link>
            <Link
              href="/admin/reports"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-200 transition-all border border-slate-700"
            >
              Export Excel Report
            </Link>
          </div>
        </div>

        {/* Active Meeting Banner */}
        {activeMeeting && (
          <div className="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-500/30 p-6 rounded-2xl flex items-center justify-between">
            <div>
              <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                🟢 Live Active Meeting
              </span>
              <h2 className="text-xl font-bold text-white mt-2">{activeMeeting.title}</h2>
              <p className="text-xs text-slate-300 mt-1">
                Venue: {activeMeeting.locationName} | Geofence: {activeMeeting.geofenceRadiusMeters}m
              </p>
            </div>
            <Link
              href={`/admin/live-meeting/${activeMeeting.id}`}
              className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-xs uppercase tracking-wider flex items-center gap-2"
            >
              Open Live Monitor & QR Screen <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Members</span>
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{stats?.totalActiveMembers ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">Enrolled unit members</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Meetings Held</span>
              <Calendar className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{stats?.meetingsHeld ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">Completed meetings</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Avg Attendance</span>
              <Award className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{stats?.avgAttendance ?? 0}%</div>
            <div className="text-xs text-slate-500 mt-1">Unit participation benchmark</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Follow-Up Flags</span>
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            </div>
            <div className="text-3xl font-extrabold text-white text-rose-400">{stats?.activeFlagsCount ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">Members requiring attention</div>
          </div>
        </div>

        {/* Quick Action Navigation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          <Link
            href="/admin/meetings"
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:border-indigo-500/50 transition-all group"
          >
            <Calendar className="w-8 h-8 text-indigo-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-base font-bold text-white">Meeting Management</h3>
            <p className="text-xs text-slate-400 mt-1">
              Schedule single/recurring meetings, categories, start times, and geofence radii.
            </p>
          </Link>

          <Link
            href="/admin/follow-up"
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:border-rose-500/50 transition-all group"
          >
            <ShieldAlert className="w-8 h-8 text-rose-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-base font-bold text-white">Follow-Up Threshold Flags</h3>
            <p className="text-xs text-slate-400 mt-1">
              Review members flagged for 2+ consecutive absences or &lt;70% attendance.
            </p>
          </Link>

          <Link
            href="/admin/reports"
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:border-emerald-500/50 transition-all group"
          >
            <FileText className="w-8 h-8 text-emerald-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-base font-bold text-white">Reports & Excel Export</h3>
            <p className="text-xs text-slate-400 mt-1">
              Generate unit-wide attendance summaries and export data for further analysis.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
