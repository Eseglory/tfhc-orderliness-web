'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  LayoutGrid,
  List,
  Table as TableIcon,
  AlignJustify,
  Search,
  Filter,
  X,
  UserCheck,
  ChevronRight,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { StatusBadge } from '../../../../components/StatusBadge';
import { fetchApi } from '../../../../lib/api';

export type LiveMeetingViewMode = 'grid' | 'list' | 'table' | 'compact';
export type LiveMeetingStatusFilter = 'ALL' | 'ACTIVE' | 'SCHEDULED' | 'PAST';

export default function AdminLiveMeetingsIndexPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<LiveMeetingViewMode>('grid');

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LiveMeetingStatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Restore saved view mode preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tfhc_live_meeting_view_mode') as LiveMeetingViewMode | null;
        if (saved && ['grid', 'list', 'table', 'compact'].includes(saved)) {
          setViewMode(saved);
        }
      } catch (e) {
        // LocalStorage access fallback
      }
    }
  }, []);

  const handleSetViewMode = (mode: LiveMeetingViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tfhc_live_meeting_view_mode', mode);
      } catch (e) {
        // Ignored
      }
    }
  };

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

  const activeMeetings = useMemo(() => meetings.filter((m) => m.status === 'ACTIVE'), [meetings]);

  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter((m) => m.status === 'SCHEDULED' && new Date(m.startTime).getTime() >= new Date().getTime() - 24 * 3600 * 1000)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [meetings]
  );

  const pastMeetings = useMemo(
    () =>
      meetings
        .filter((m) => ['CLOSED', 'COMPLETED', 'CANCELLED'].includes(m.status))
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [meetings]
  );

  // Unique categories for filter dropdown
  const uniqueCategories = useMemo(() => {
    const map = new Map<string, string>();
    meetings.forEach((m) => {
      if (m.category?.name) {
        map.set(m.category.name, m.category.name);
      }
    });
    return Array.from(map.values()).sort();
  }, [meetings]);

  // Filtered dataset according to user selection
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && m.status !== 'ACTIVE') return false;
      if (statusFilter === 'SCHEDULED' && m.status !== 'SCHEDULED') return false;
      if (statusFilter === 'PAST' && !['CLOSED', 'COMPLETED', 'CANCELLED'].includes(m.status)) return false;

      // Category filter
      if (categoryFilter !== 'ALL' && m.category?.name !== categoryFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = m.title?.toLowerCase().includes(q);
        const locMatch = m.locationName?.toLowerCase().includes(q) || m.address?.toLowerCase().includes(q);
        const catMatch = m.category?.name?.toLowerCase().includes(q);
        const ministerMatch =
          m.supervisingMinister &&
          `${m.supervisingMinister.firstName} ${m.supervisingMinister.lastName}`.toLowerCase().includes(q);
        if (!titleMatch && !locMatch && !catMatch && !ministerMatch) return false;
      }

      return true;
    });
  }, [meetings, statusFilter, categoryFilter, searchQuery]);

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

        {/* Live Active Sessions Banner (if any active sessions exist) */}
        {activeMeetings.length > 0 && statusFilter !== 'PAST' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Active Live Sessions ({activeMeetings.length})
                </h2>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                In Progress Now
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeMeetings.map((mtg) => (
                <div
                  key={mtg.id}
                  className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Flame className="w-32 h-32 text-orange-500" />
                  </div>
                  <div className="relative z-10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-xs">
                        <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" /> LIVE STREAM ACTIVE
                      </span>
                      <span className="text-xs font-semibold text-slate-300 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-700">
                        {mtg.category?.name || 'Service'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight group-hover:text-orange-200 transition-colors">
                        {mtg.title}
                      </h3>
                      <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="truncate">{mtg.locationName || 'Main Sanctuary'}</span>
                      </p>
                    </div>
                    <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        {new Date(mtg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        Geofence Active ({mtg.geofenceRadiusMeters || 100}m)
                      </span>
                      {mtg.supervisingMinister && (
                        <span className="flex items-center gap-1 text-slate-300">
                          <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                          {mtg.supervisingMinister.firstName} {mtg.supervisingMinister.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="relative z-10 pt-5">
                    <Link
                      href={`/admin/live-meeting/${mtg.id}`}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold text-sm shadow-lg shadow-orange-600/30 transition-all active:scale-[0.98]"
                    >
                      <Radio className="w-4 h-4 animate-pulse" />
                      <span>Launch Live Monitor Screen</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar: Search, Filters & View Mode Selectors */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex items-center overflow-x-auto pb-1 lg:pb-0 gap-1.5 scrollbar-none">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All Gatherings ({meetings.length})
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeMeetings.length > 0 ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
                <span>Live Active ({activeMeetings.length})</span>
              </button>
              <button
                onClick={() => setStatusFilter('SCHEDULED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === 'SCHEDULED'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Upcoming ({upcomingMeetings.length})
              </button>
              <button
                onClick={() => setStatusFilter('PAST')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === 'PAST'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Past / Completed ({pastMeetings.length})
              </button>
            </div>

            {/* View Mode Toggle Controls */}
            <div className="flex items-center justify-between lg:justify-end gap-2 shrink-0">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
                View Layout:
              </span>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleSetViewMode('grid')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Card Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Grid</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetViewMode('list')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Horizontal Detailed List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">List</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetViewMode('table')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Tabular Data View"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Table</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetViewMode('compact')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact Dense View"
                >
                  <AlignJustify className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Compact</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search bar & Category filter */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="relative w-full sm:flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search gatherings by title, venue, or minister..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {uniqueCategories.length > 0 && (
              <div className="w-full sm:w-auto">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full sm:w-48 px-3 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="ALL">All Categories</option>
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Content Views: Loading / Empty / Render according to ViewMode */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>
                {statusFilter === 'ALL'
                  ? 'All Gatherings'
                  : statusFilter === 'ACTIVE'
                  ? 'Live Active Sessions'
                  : statusFilter === 'SCHEDULED'
                  ? 'Scheduled Gatherings'
                  : 'Past Concluded Gatherings'}{' '}
                ({filteredMeetings.length})
              </span>
            </h2>
          </div>

          {loading ? (
            <div className="p-16 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <RefreshCw className="w-7 h-7 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-bold">Loading gatherings roster…</p>
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
              <Layers className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                No gatherings match your criteria
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'Try clearing your search query or selecting a different status/category filter.'
                  : 'No gatherings have been scheduled yet. Create a gathering to launch geofencing, QR scanners, and attendance verification.'}
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                {(searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('ALL');
                      setStatusFilter('ALL');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Clear All Filters
                  </button>
                )}
                <Link
                  href="/admin/events"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schedule Gathering</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* 1. GRID VIEW */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMeetings.map((mtg) => {
                    const isActive = mtg.status === 'ACTIVE';
                    return (
                      <div
                        key={mtg.id}
                        className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between space-y-4 hover:shadow-lg ${
                          isActive
                            ? 'border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20'
                            : 'border-slate-200/80 dark:border-slate-800 shadow-xs'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <StatusBadge status={mtg.status} />
                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full truncate max-w-[140px]">
                              {mtg.category?.name || 'Gathering'}
                            </span>
                          </div>

                          <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-1">
                              {mtg.title}
                            </h3>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                Session Active Now
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>
                                {new Date(mtg.startTime).toLocaleDateString(undefined, {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                              <span>
                                {new Date(mtg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {mtg.endTime ? ` – ${new Date(mtg.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 truncate">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{mtg.locationName || 'Main Sanctuary'}</span>
                            </div>
                            {mtg.supervisingMinister && (
                              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-[11px] pt-0.5">
                                <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span className="truncate">
                                  Minister: {mtg.supervisingMinister.firstName} {mtg.supervisingMinister.lastName}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <Link
                          href={`/admin/live-meeting/${mtg.id}`}
                          className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs ${
                            isActive
                              ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20 active:scale-[0.98]'
                              : 'bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {isActive ? <Radio className="w-3.5 h-3.5 animate-pulse" /> : null}
                          <span>{isActive ? 'Launch Live Monitor Screen' : 'Open Live Console'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. LIST VIEW */}
              {viewMode === 'list' && (
                <div className="space-y-3">
                  {filteredMeetings.map((mtg) => {
                    const isActive = mtg.status === 'ACTIVE';
                    return (
                      <div
                        key={mtg.id}
                        className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:shadow-md ${
                          isActive
                            ? 'border-emerald-500/50 ring-1 ring-emerald-500/20 shadow-xs'
                            : 'border-slate-200/80 dark:border-slate-800 shadow-xs'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center font-black shrink-0 ${
                              isActive
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40'
                            }`}
                          >
                            {isActive ? <Radio className="w-5 h-5 animate-pulse" /> : <Calendar className="w-5 h-5" />}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                                {mtg.title}
                              </h3>
                              <StatusBadge status={mtg.status} />
                              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                {mtg.category?.name || 'Gathering'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                {new Date(mtg.startTime).toLocaleDateString(undefined, {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                {new Date(mtg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {mtg.endTime ? ` – ${new Date(mtg.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                              </span>
                              <span className="flex items-center gap-1.5 truncate max-w-xs">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{mtg.locationName || 'Main Sanctuary'}</span>
                              </span>
                              {mtg.supervisingMinister && (
                                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                                  <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>
                                    {mtg.supervisingMinister.firstName} {mtg.supervisingMinister.lastName}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end lg:self-center shrink-0 w-full sm:w-auto">
                          <Link
                            href={`/admin/live-meeting/${mtg.id}`}
                            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-xs ${
                              isActive
                                ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/30'
                                : 'bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {isActive && <Radio className="w-3.5 h-3.5 animate-pulse" />}
                            <span>{isActive ? 'Launch Live Monitor' : 'Open Console'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 3. TABLE VIEW */}
              {viewMode === 'table' && (
                <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3.5">Gathering & Service</th>
                          <th className="px-4 py-3.5">Status</th>
                          <th className="px-4 py-3.5">Category</th>
                          <th className="px-4 py-3.5">Date & Time</th>
                          <th className="px-4 py-3.5">Venue & Geofence</th>
                          <th className="px-4 py-3.5">Supervising Minister</th>
                          <th className="px-5 py-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-medium">
                        {filteredMeetings.map((mtg) => {
                          const isActive = mtg.status === 'ACTIVE';
                          return (
                            <tr
                              key={mtg.id}
                              className={`transition-colors ${
                                isActive
                                  ? 'bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40'
                                  : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="px-5 py-3.5">
                                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  {isActive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />}
                                  <span className="truncate max-w-xs">{mtg.title}</span>
                                </div>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <StatusBadge status={mtg.status} />
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[11px]">
                                  {mtg.category?.name || 'General'}
                                </span>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                <div>
                                  {new Date(mtg.startTime).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    weekday: 'short',
                                  })}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {new Date(mtg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {mtg.endTime ? ` – ${new Date(mtg.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                                <div className="truncate max-w-xs font-semibold">{mtg.locationName || 'Main Sanctuary'}</div>
                                <div className="text-[11px] text-slate-400">
                                  Radius: {mtg.geofenceRadiusMeters || 100}m
                                </div>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                {mtg.supervisingMinister ? (
                                  <span className="inline-flex items-center gap-1">
                                    <UserCheck className="w-3 h-3 text-amber-500" />
                                    <span>
                                      {mtg.supervisingMinister.firstName} {mtg.supervisingMinister.lastName}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Unassigned</span>
                                )}
                              </td>

                              <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                <Link
                                  href={`/admin/live-meeting/${mtg.id}`}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    isActive
                                      ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-xs'
                                      : 'bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200'
                                  }`}
                                >
                                  {isActive ? <Radio className="w-3 h-3 animate-pulse" /> : null}
                                  <span>{isActive ? 'Live Monitor' : 'Open'}</span>
                                  <ChevronRight className="w-3 h-3" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. COMPACT VIEW */}
              {viewMode === 'compact' && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                  {filteredMeetings.map((mtg) => {
                    const isActive = mtg.status === 'ACTIVE';
                    return (
                      <Link
                        key={mtg.id}
                        href={`/admin/live-meeting/${mtg.id}`}
                        className={`flex items-center justify-between px-4 py-2.5 transition-colors group ${
                          isActive
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isActive
                                ? 'bg-emerald-500 animate-ping'
                                : mtg.status === 'SCHEDULED'
                                ? 'bg-indigo-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          <div className="font-bold text-xs text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {mtg.title}
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full hidden sm:inline">
                            {mtg.category?.name || 'General'}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          <span className="hidden md:inline">
                            {new Date(mtg.startTime).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span>
                            {new Date(mtg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="truncate max-w-[120px] hidden lg:inline">
                            {mtg.locationName || 'Sanctuary'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isActive
                                ? 'bg-orange-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isActive ? 'LIVE' : 'OPEN'}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
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
