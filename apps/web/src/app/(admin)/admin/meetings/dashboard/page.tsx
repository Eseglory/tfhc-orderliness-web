'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Kanban,
  List,
  Calendar as CalendarIcon,
  Plus,
  Filter,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  MapPin,
  Flame,
  ArrowUpRight,
  Layers,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

interface DashboardStats {
  kpis: {
    total: number;
    upcoming: number;
    thisWeek: number;
    thisMonth: number;
    cancelled: number;
    recurringSeries: number;
    restricted: number;
  };
  eventsByType: { type: string; color: string | null; count: number }[];
  eventsByMonth: { month: string; count: number; avgAttendanceRate: number | null }[];
}

interface MeetingItem {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  locationName?: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED' | string;
  category?: { name: string };
  eventType?: { name: string; color?: string | null };
  isCompulsory?: boolean;
  meetingSummary?: {
    attendanceRate: number;
    totalExpected: number;
    totalAttended: number;
  };
}

export default function EventsDashboardPage() {
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [dashboardData, setDashboardData] = useState<DashboardStats | null>(null);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [dash, list] = await Promise.all([
        fetchApi<DashboardStats>('/meetings/dashboard').catch(() => null),
        fetchApi<MeetingItem[]>('/meetings?limit=50').catch(() => []),
      ]);
      setDashboardData(dash);
      setMeetings(list || []);
      setError('');
    } catch (err) {
      setError('Could not load events operations data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered meetings
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchCat = !selectedCategory || m.category?.name === selectedCategory || m.eventType?.name === selectedCategory;
      const matchStat = !selectedStatus || m.status === selectedStatus;
      return matchCat && matchStat;
    });
  }, [meetings, selectedCategory, selectedStatus]);

  const columns = [
    { key: 'SCHEDULED', label: 'Scheduled / Upcoming', tone: 'indigo' },
    { key: 'ACTIVE', label: 'Live In Progress', tone: 'amber' },
    { key: 'CLOSED', label: 'Completed / Closed', tone: 'emerald' },
    { key: 'CANCELLED', label: 'Cancelled / Archived', tone: 'slate' },
  ];

  const categories = useMemo(() => {
    const cats = new Set<string>();
    meetings.forEach((m) => {
      if (m.category?.name) cats.add(m.category.name);
      if (m.eventType?.name) cats.add(m.eventType.name);
    });
    return Array.from(cats);
  }, [meetings]);

  const kpis = dashboardData?.kpis || {
    total: meetings.length,
    upcoming: meetings.filter((m) => m.status === 'SCHEDULED').length,
    thisWeek: 0,
    thisMonth: 0,
    cancelled: meetings.filter((m) => m.status === 'CANCELLED').length,
    recurringSeries: 0,
    restricted: 0,
  };

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              OPERATIONS &amp; SERVICE MANAGEMENT
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Operations &amp; Feature Board
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Track real-time church gatherings, service schedules, operational readiness, and attendance rosters across campus.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 text-xs font-bold">
              {kpis.total} Total Gatherings
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 text-xs font-bold">
              {kpis.upcoming} Upcoming
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 text-xs font-bold">
              {kpis.recurringSeries} Series Configured
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Filter Controls & View Switcher */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1 text-slate-400 font-semibold mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="">All Categories &amp; Types</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ACTIVE">Active / Live</option>
              <option value="CLOSED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            {(selectedCategory || selectedStatus) && (
              <button
                onClick={() => {
                  setSelectedCategory('');
                  setSelectedStatus('');
                }}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-2"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'kanban'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>

            <Link
              href="/admin/meetings?action=create"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm shadow-indigo-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Event</span>
            </Link>
          </div>
        </div>

        {/* Kanban Board View */}
        {viewMode === 'kanban' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            {columns.map((col) => {
              const colMeetings = filteredMeetings.filter((m) => m.status === col.key);

              return (
                <div
                  key={col.key}
                  className="rounded-2xl bg-slate-100/60 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 p-3 flex flex-col min-h-[420px]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200/80 dark:border-slate-800">
                    <span className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-current" />
                      {col.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-[11px] font-extrabold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
                      {colMeetings.length}
                    </span>
                  </div>

                  {/* Meetings List */}
                  <div className="space-y-3 flex-1">
                    {loading ? (
                      <div className="p-6 text-center text-xs text-slate-400">Loading operational board...</div>
                    ) : colMeetings.length === 0 ? (
                      <div className="py-10 text-center text-slate-400">
                        <Clock className="w-6 h-6 mx-auto mb-1 text-slate-300 dark:text-slate-700" />
                        <p className="text-xs font-medium">No gatherings in this stage</p>
                      </div>
                    ) : (
                      colMeetings.map((m) => {
                        const dateObj = new Date(m.startTime);
                        const isLive = m.status === 'ACTIVE';

                        return (
                          <div
                            key={m.id}
                            className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
                                  {m.category?.name || m.eventType?.name || 'General Service'}
                                </span>

                                {isLive && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500 text-white animate-pulse">
                                    <Flame className="w-3 h-3" />
                                    Live
                                  </span>
                                )}
                              </div>

                              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {m.title}
                              </h3>

                              {m.description && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                  {m.description}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1 font-medium truncate">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                {dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                                {dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                              </span>

                              <Link
                                href={isLive ? '/admin/live-meeting' : `/admin/meetings/${m.id}`}
                                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 ml-2"
                              >
                                {isLive ? 'Roster' : 'Manage'}
                              </Link>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <thead className="text-[11px] font-bold text-slate-400 uppercase bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">GATHERING TITLE</th>
                  <th className="px-5 py-3.5">CATEGORY</th>
                  <th className="px-5 py-3.5">STATUS</th>
                  <th className="px-5 py-3.5">DATE &amp; TIME</th>
                  <th className="px-5 py-3.5">VENUE</th>
                  <th className="px-5 py-3.5 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMeetings.length > 0 ? (
                  filteredMeetings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                        {m.title}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          {m.category?.name || 'General'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-xs text-slate-700 dark:text-slate-300">
                        {m.status}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(m.startTime).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {m.locationName || 'Main Auditorium'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/admin/meetings/${m.id}`}
                          className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      {loading ? 'Loading records...' : 'No gathering records match the selected filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
