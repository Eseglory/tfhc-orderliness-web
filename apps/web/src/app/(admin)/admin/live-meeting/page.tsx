'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Flame,
  Radio,
  Clock,
  Calendar,
  MapPin,
  Users,
  ArrowRight,
  Plus,
  RefreshCw,
  Layers,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { StatusBadge } from '../../../../components/StatusBadge';
import { fetchApi } from '../../../../lib/api';

export default function AdminLiveMeetingsIndexPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMeetings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi('/meetings');
      setMeetings(data || []);
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const activeMeetings = meetings.filter((m) => m.status === 'ACTIVE');
  const upcomingMeetings = meetings
    .filter((m) => m.status === 'SCHEDULED' && new Date(m.startTime).getTime() >= new Date().getTime() - 24 * 3600 * 1000)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastMeetings = meetings.filter((m) => ['CLOSED', 'COMPLETED', 'CANCELLED'].includes(m.status));

  return (
    <AdminLayoutShell activeHref="/admin/live-meeting">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              <Link href="/admin/meetings" className="hover:text-indigo-600 transition-colors">
                MEETINGS & GATHERINGS
              </Link>
              <span>/</span>
              <span className="text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 animate-pulse" /> LIVE ROSTER SESSIONS
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Live Gathering Monitor Hub
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Launch geofenced check-in monitoring, real-time headcounts, and roster oversight.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadMeetings}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
              title="Refresh Gatherings"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/admin/events"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Gathering</span>
            </Link>
          </div>
        </div>

        {/* Live Active Sessions Banner */}
        {activeMeetings.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Active Live Sessions ({activeMeetings.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeMeetings.map((mtg) => (
                <div
                  key={mtg.id}
                  className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-950 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-10">
                    <Flame className="w-32 h-32 text-orange-500" />
                  </div>
                  <div className="relative z-10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 animate-pulse" /> LIVE STREAM ACTIVE
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        {mtg.category?.name || 'Service'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight">{mtg.title}</h3>
                      <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-orange-400" />
                        {mtg.locationName || 'Main Sanctuary'}
                      </p>
                    </div>
                    <div className="pt-2 flex items-center gap-4 text-xs text-slate-300">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        {new Date(mtg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        Geofence Active
                      </span>
                    </div>
                  </div>
                  <div className="relative z-10 pt-5">
                    <Link
                      href={`/admin/live-meeting/${mtg.id}`}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm shadow-lg shadow-orange-600/30 transition-all active:scale-[0.98]"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Launch Live Monitor Screen</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Scheduled / Upcoming Sessions */}
        <div className="space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>Upcoming Gatherings Ready For Monitor</span>
          </h2>

          {loading ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500 font-medium">Loading gatherings…</p>
            </div>
          ) : upcomingMeetings.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <Layers className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                No upcoming gatherings scheduled today
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Schedule a service or meeting to enable live geofencing, QR scanners, and attendance verification.
              </p>
              <Link
                href="/admin/meetings?action=create"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-sm hover:bg-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Now</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingMeetings.map((mtg) => (
                <div
                  key={mtg.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={mtg.status} />
                      <span className="text-[11px] font-semibold text-slate-500">
                        {mtg.category?.name || 'Regular'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-1">
                      {mtg.title}
                    </h3>
                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{new Date(mtg.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-orange-500" />
                        <span>
                          {new Date(mtg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(mtg.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{mtg.locationName || 'Main Sanctuary'}</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/admin/live-meeting/${mtg.id}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
                  >
                    <span>Open Live Console</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Demo Sandbox Card */}
        <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">
                Live Console Sandbox & Demo Mode
              </h4>
              <p className="text-xs text-indigo-700/80 dark:text-indigo-400">
                Test geofencing and real-time check-in stream simulation without modifying production gatherings.
              </p>
            </div>
          </div>
          <Link
            href="/admin/live-meeting/demo"
            className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-200 dark:border-indigo-800 shadow-xs hover:bg-indigo-50 transition-colors"
          >
            Launch Demo Mode
          </Link>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
