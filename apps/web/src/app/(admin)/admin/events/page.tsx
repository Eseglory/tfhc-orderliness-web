'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  Building2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  RefreshCw,
  Download,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  MapPin,
  QrCode,
  Radio,
  Edit2,
  Copy,
  Ban,
  LayoutGrid,
  Table as TableIcon,
  List,
  GitCommit,
  Tag,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import {
  EventForm,
  EventTypeOption,
  CategoryOption,
  emptyEvent,
  meetingToForm,
} from '../../../../components/EventForm';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, ConfirmDialog, useToast } from '../../../../components/ui';

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  status: string;
  locationName: string;
  geofenceRadiusMeters: number;
  isCompulsory: boolean;
  visibility: string;
  archivedAt: string | null;
  cancelReason: string | null;
  category?: { name: string; pointWeight?: number };
  eventType?: { name: string; color: string | null } | null;
  _count?: { attendanceRecords: number; invitations: number };
}

type ViewMode = 'grid' | 'table' | 'compact' | 'timeline';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  ACTIVE: {
    label: 'Live Now',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  SCHEDULED: {
    label: 'Scheduled',
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  CLOSED: {
    label: 'Concluded',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
};

export default function EventsManagementPage() {
  const { user, can, loading: authLoading } = useAuth();
  const { notify } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 4 View Modes
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'scheduled' | 'archived'>('all');
  const [formatFilter, setFormatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [venueFilter, setVenueFilter] = useState('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals & Action Targets
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null);
  const [busyId, setBusyId] = useState('');
  const [pairingModalOpen, setPairingModalOpen] = useState(false);

  const canCreate = can('events.create');
  const canEdit = can('events.update');

  // Load view mode preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tfhc_events_view_mode') as ViewMode;
      if (saved && ['grid', 'table', 'compact', 'timeline'].includes(saved)) {
        setViewMode(saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('tfhc_events_view_mode', mode);
    } catch {
      // Ignore
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [m, t, c] = await Promise.all([
        fetchApi<Meeting[]>('/meetings?includeArchived=true'),
        fetchApi<EventTypeOption[]>('/meetings/event-types').catch(() => []),
        fetchApi<CategoryOption[]>('/meetings/categories').catch(() => []),
      ]);
      setMeetings(m || []);
      setEventTypes(t || []);
      setCategories(c || []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      load();
    }
  }, [authLoading]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, formatFilter, statusFilter, venueFilter]);

  const act = async (id: string, fn: () => Promise<any>, successMsg: string) => {
    setBusyId(id);
    try {
      await fn();
      notify(successMsg, 'success');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const handleSave = async (formData: any) => {
    try {
      if (editing?.id) {
        await fetchApi(`/meetings/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
        notify('Event updated successfully.', 'success');
      } else {
        await fetchApi('/meetings', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        notify('New event scheduled successfully.', 'success');
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save event.', 'error');
    }
  };

  const handleExportRoster = () => {
    if (meetings.length === 0) {
      notify('No events available to export.', 'info');
      return;
    }
    const headers = ['ID', 'Title', 'Type', 'Category', 'Date', 'Time', 'Location', 'Status', 'Attendees'];
    const rows = meetings.map((m) => [
      m.id,
      `"${m.title.replace(/"/g, '""')}"`,
      `"${m.eventType?.name || 'General'}"`,
      `"${m.category?.name || 'General'}"`,
      new Date(m.startTime).toISOString().slice(0, 10),
      new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      `"${m.locationName.replace(/"/g, '""')}"`,
      m.status,
      m._count?.attendanceRecords || 0,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TFHC_Events_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Events and operations roster exported to CSV.', 'success');
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return meetings.filter((evt) => {
      if (activeTab === 'active' && evt.status !== 'ACTIVE') return false;
      if (activeTab === 'scheduled' && evt.status !== 'SCHEDULED') return false;
      if (activeTab === 'archived' && !evt.archivedAt) return false;
      if (activeTab !== 'archived' && evt.archivedAt) return false;

      if (formatFilter !== 'All' && evt.eventType?.name !== formatFilter) return false;
      if (statusFilter !== 'All' && evt.status !== statusFilter) return false;
      if (venueFilter !== 'All' && !evt.locationName.toLowerCase().includes(venueFilter.toLowerCase())) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          evt.title.toLowerCase().includes(q) ||
          (evt.eventType?.name || '').toLowerCase().includes(q) ||
          (evt.category?.name || '').toLowerCase().includes(q) ||
          evt.locationName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [meetings, activeTab, formatFilter, statusFilter, venueFilter, searchQuery]);

  // Paginated Events
  const totalRecords = filteredEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, currentPage, pageSize]);

  // Unique venues
  const uniqueVenues = useMemo(() => {
    const set = new Set<string>();
    meetings.forEach((m) => {
      if (m.locationName) set.add(m.locationName);
    });
    return Array.from(set);
  }, [meetings]);

  // KPIs
  const stats = useMemo(() => {
    const total = meetings.length;
    const active = meetings.filter((m) => m.status === 'ACTIVE').length;
    const scheduled = meetings.filter((m) => m.status === 'SCHEDULED').length;
    const totalCheckedIn = meetings.reduce((acc, m) => acc + (m._count?.attendanceRecords || 0), 0);
    return { total, active, scheduled, totalCheckedIn };
  }, [meetings]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>OPERATIONS</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">SERVICES &amp; GATHERINGS</span>
              <span>/</span>
              <span>EVENTS DIRECTORY</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Events &amp; Service Management
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Coordinate scheduled gatherings, corporate services, live check-in monitoring, and venue logistics.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportRoster}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              Export CSV
            </button>
            <button
              onClick={async () => {
                await load();
                notify('Events and operational metrics synchronized.', 'success');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Refresh
            </button>
            {canCreate && (
              <button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Schedule Event
              </button>
            )}
          </div>
        </div>

        {/* 4 KPI Scorecard Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL CHECK-INS
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                Live Roster
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {stats.totalCheckedIn}
              </span>
              <span className="text-xs font-bold text-slate-400">Verified</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>Across {stats.total} total recorded gatherings</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ACTIVE IN-SESSION
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                • Live Doors
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.active}</span>
              <span className="text-xs font-bold text-emerald-600">Active Now</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>Geofence verification windows active</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                UPCOMING SESSIONS
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Scheduled
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.scheduled}</span>
              <span className="text-xs font-bold text-slate-400">Future</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>{uniqueVenues.length} designated event venues</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL DIRECTORY
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Database
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
              <span className="text-xs font-bold text-slate-400">Events</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>{categories.length} categories · {eventTypes.length} types</span>
            </div>
          </div>
        </div>

        {/* Filter Bar & 4 View Mode Switcher */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events by title, venue, type, category..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Filter Dropdowns & View Mode Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="All">Type: All</option>
                {eventTypes.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="All">Status: All</option>
                <option value="ACTIVE">Active (Live)</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="CLOSED">Concluded</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="All">Venue: All</option>
                {uniqueVenues.map((v) => (
                  <option key={v} value={v}>
                    {v.length > 25 ? v.slice(0, 25) + '...' : v}
                  </option>
                ))}
              </select>

              {/* 4 VIEW MODE TOGGLE BUTTONS */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-950 rounded-xl p-0.5 border border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => handleSetViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Grid Cards View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSetViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Table List View"
                >
                  <TableIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSetViewMode('compact')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact Dense View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSetViewMode('timeline')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'timeline'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Chronological Timeline View"
                >
                  <GitCommit className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter Tabs Strip */}
          <div className="flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 overflow-x-auto">
            {[
              { key: 'all', label: `All Events (${meetings.filter((m) => !m.archivedAt).length})` },
              { key: 'active', label: `Live Active (${stats.active})` },
              { key: 'scheduled', label: `Upcoming Scheduled (${stats.scheduled})` },
              { key: 'archived', label: `Archived (${meetings.filter((m) => m.archivedAt).length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PRESENTATION MODES                                                        */}
        {/* ========================================================================= */}

        {loading ? (
          <div className="py-24 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Loading events directory…</p>
          </div>
        ) : paginatedEvents.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <CalendarIcon className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No events found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No records match your active search and filter criteria. Adjust your filters or schedule a new event.
            </p>
            {canCreate && (
              <button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Schedule New Event
              </button>
            )}
          </div>
        ) : (
          <>
            {/* 1. GRID VIEW */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedEvents.map((evt) => {
                  const badge = STATUS_BADGES[evt.status] || STATUS_BADGES.CLOSED;
                  const dateStr = new Date(evt.startTime).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const timeStr = new Date(evt.startTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={evt.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">
                            {evt.eventType?.name ?? evt.category?.name ?? 'General'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>

                        <h3 className="text-base font-black text-slate-900 dark:text-white leading-snug line-clamp-2">
                          {evt.title}
                        </h3>

                        <div className="text-xs text-slate-500 space-y-1">
                          <p className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                            <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>{dateStr} · {timeStr}</span>
                          </p>
                          <p className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{evt.locationName || 'Main Centre'}</span>
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px]">Checked-in Attendees:</span>
                            <strong className="text-slate-900 dark:text-white font-black">
                              {evt._count?.attendanceRecords || 0}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px]">Geofence Radius:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {evt.geofenceRadiusMeters}m
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <Link
                          href={`/admin/live-meeting/${evt.id}`}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs"
                        >
                          Live Roster
                        </Link>

                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditing(evt);
                                setFormOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="Edit Event"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canCreate && (
                            <button
                              onClick={() =>
                                act(
                                  evt.id,
                                  () =>
                                    fetchApi(`/meetings/${evt.id}/duplicate`, {
                                      method: 'POST',
                                      body: '{}',
                                    }),
                                  'Event duplicated.',
                                )
                              }
                              disabled={busyId === evt.id}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="Duplicate Event"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {can('events.cancel') && evt.status !== 'CLOSED' && evt.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setCancelTarget(evt)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                              title="Cancel Event"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. TABLE VIEW */}
            {viewMode === 'table' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">TITLE &amp; CATEGORY</th>
                        <th className="py-3 px-4">SCHEDULE DATE / TIME</th>
                        <th className="py-3 px-4">LOCATION</th>
                        <th className="py-3 px-4 text-center">GEOFENCE</th>
                        <th className="py-3 px-4 text-center">CHECK-INS</th>
                        <th className="py-3 px-4 text-center">STATUS</th>
                        <th className="py-3 px-4 text-right">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {paginatedEvents.map((evt) => {
                        const badge = STATUS_BADGES[evt.status] || STATUS_BADGES.CLOSED;
                        return (
                          <tr key={evt.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">{evt.title}</div>
                              <div className="text-[11px] text-slate-400">{evt.category?.name || 'General Event'}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              <div>{new Date(evt.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {new Date(evt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                              {evt.locationName}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-500">
                              {evt.geofenceRadiusMeters}m
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">
                              {evt._count?.attendanceRecords || 0}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.color}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Link
                                  href={`/admin/live-meeting/${evt.id}`}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-indigo-600 hover:text-white transition-colors"
                                >
                                  Monitor
                                </Link>
                                {canEdit && (
                                  <button
                                    onClick={() => {
                                      setEditing(evt);
                                      setFormOpen(true);
                                    }}
                                    className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. COMPACT VIEW */}
            {viewMode === 'compact' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                {paginatedEvents.map((evt) => {
                  const badge = STATUS_BADGES[evt.status] || STATUS_BADGES.CLOSED;
                  return (
                    <div
                      key={evt.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-indigo-500" />
                        <div className="min-w-0 space-y-0.5">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {evt.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span>{new Date(evt.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                            <span>•</span>
                            <span>{evt.locationName}</span>
                            <span>•</span>
                            <span>{evt._count?.attendanceRecords || 0} checked-in</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <Link
                          href={`/admin/live-meeting/${evt.id}`}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4. TIMELINE VIEW */}
            {viewMode === 'timeline' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
                <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 space-y-8">
                  {paginatedEvents.map((evt) => {
                    const badge = STATUS_BADGES[evt.status] || STATUS_BADGES.CLOSED;
                    const dateObj = new Date(evt.startTime);
                    return (
                      <div key={evt.id} className="relative pl-6">
                        {/* Timeline Node */}
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600" />

                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-md">
                              {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className={`px-2 py-0.2 rounded-full text-[9px] font-extrabold border ${badge.color}`}>
                              {badge.label}
                            </span>
                          </div>

                          <h4 className="text-sm font-black text-slate-900 dark:text-white">
                            {evt.title}
                          </h4>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {evt.locationName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              {evt._count?.attendanceRecords || 0} Attended
                            </span>
                          </div>

                          <div className="pt-1">
                            <Link
                              href={`/admin/live-meeting/${evt.id}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              <span>Open Live Operations Roster</span>
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pagination Controls Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-medium">
                Showing{' '}
                <span className="font-bold text-slate-900 dark:text-white">
                  {totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-slate-900 dark:text-white">
                  {Math.min(currentPage * pageSize, totalRecords)}
                </span>{' '}
                of <span className="font-bold text-slate-900 dark:text-white">{totalRecords}</span> events
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Per Page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="px-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modal Event Form */}
        <EventForm
          open={formOpen}
          initial={editing ? meetingToForm(editing) : emptyEvent}
          eventTypes={eventTypes}
          categories={categories}
          onSubmit={handleSave}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />

        {/* Cancel Confirmation Dialog */}
        <ConfirmDialog
          open={Boolean(cancelTarget)}
          title="Cancel Gathering?"
          body={`Are you sure you want to cancel "${cancelTarget?.title}"? All scheduled attendees and roster records will be updated.`}
          confirmLabel="Yes, Cancel Event"
          tone="danger"
          onConfirm={() => {
            if (!cancelTarget) return;
            act(
              cancelTarget.id,
              () =>
                fetchApi(`/meetings/${cancelTarget.id}/cancel`, {
                  method: 'POST',
                  body: JSON.stringify({ reason: 'Admin cancellation' }),
                }),
              'Event cancelled.',
            );
            setCancelTarget(null);
          }}
          onCancel={() => setCancelTarget(null)}
        />
      </div>
    </AdminLayoutShell>
  );
}
