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
  Video,
  Globe,
  Layers,
  Flame,
  Kanban,
  Shirt,
  CalendarDays,
  ExternalLink,
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
  description?: string | null;
  startTime: string;
  endTime: string | null;
  status: string;
  locationName: string;
  address?: string | null;
  notes?: string | null;
  geofenceRadiusMeters: number;
  isCompulsory: boolean;
  pointWeight?: number;
  visibility: string;
  archivedAt: string | null;
  cancelReason: string | null;
  category?: { id?: string; name: string; pointWeight?: number };
  eventType?: { id?: string; name: string; color: string | null } | null;
  audiences?: Array<{ scope?: string; subTeamId?: string; memberId?: string; subTeam?: { name: string } }>;
  _count?: { attendanceRecords: number; invitations: number };
}

type ViewMode = 'grid' | 'table' | 'compact' | 'timeline';
type CategoryTab = 'all' | 'services' | 'meetings' | 'rehearsals' | 'specials' | 'archived';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  ACTIVE: {
    label: 'Live Now',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  SCHEDULED: {
    label: 'Scheduled',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  CLOSED: {
    label: 'Concluded',
    color: 'bg-slate-800/80 text-slate-400 border-slate-700/60',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
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

  // View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
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
  }, [searchQuery, categoryTab, formatFilter, statusFilter, venueFilter]);

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
        notify('Gathering updated successfully.', 'success');
      } else {
        await fetchApi('/meetings', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        notify('New gathering scheduled successfully.', 'success');
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
    notify('Events roster exported to CSV.', 'success');
  };

  // Classify helper
  const isService = (m: Meeting) => {
    const text = `${m.title} ${m.eventType?.name || ''} ${m.category?.name || ''}`.toLowerCase();
    return text.includes('service') || text.includes('sunday') || text.includes('midweek') || text.includes('worship');
  };

  const isMeeting = (m: Meeting) => {
    const text = `${m.title} ${m.eventType?.name || ''} ${m.category?.name || ''}`.toLowerCase();
    return text.includes('meeting') || text.includes('sync') || text.includes('briefing') || text.includes('unit') || text.includes('committee') || text.includes('leadership');
  };

  const isRehearsal = (m: Meeting) => {
    const text = `${m.title} ${m.eventType?.name || ''} ${m.category?.name || ''}`.toLowerCase();
    return text.includes('rehearsal') || text.includes('training') || text.includes('prep') || text.includes('band') || text.includes('choir');
  };

  const isSpecial = (m: Meeting) => {
    const text = `${m.title} ${m.eventType?.name || ''} ${m.category?.name || ''}`.toLowerCase();
    return text.includes('conference') || text.includes('convention') || text.includes('special') || text.includes('vigil') || text.includes('outreach') || text.includes('celebration');
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return meetings.filter((evt) => {
      // Category tabs filter
      if (categoryTab === 'archived') {
        if (!evt.archivedAt) return false;
      } else {
        if (evt.archivedAt) return false;
        if (categoryTab === 'services' && !isService(evt)) return false;
        if (categoryTab === 'meetings' && !isMeeting(evt)) return false;
        if (categoryTab === 'rehearsals' && !isRehearsal(evt)) return false;
        if (categoryTab === 'specials' && !isSpecial(evt)) return false;
      }

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
  }, [meetings, categoryTab, formatFilter, statusFilter, venueFilter, searchQuery]);

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
    const nonArchived = meetings.filter((m) => !m.archivedAt);
    const total = nonArchived.length;
    const servicesCount = nonArchived.filter(isService).length;
    const meetingsCount = nonArchived.filter(isMeeting).length;
    const active = nonArchived.filter((m) => m.status === 'ACTIVE').length;
    const scheduled = nonArchived.filter((m) => m.status === 'SCHEDULED').length;
    const totalCheckedIn = nonArchived.reduce((acc, m) => acc + (m._count?.attendanceRecords || 0), 0);
    return { total, servicesCount, meetingsCount, active, scheduled, totalCheckedIn };
  }, [meetings]);

  return (
    <AdminLayoutShell activeHref="/admin/events">
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>OPERATIONS</span>
              <span>/</span>
              <span className="text-amber-500 font-extrabold">EVENTS &amp; SERVICES HUB</span>
              <span>/</span>
              <span>ALL GATHERINGS</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Layers className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Events &amp; Service Management
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Unified console for church worship services, team syncs &amp; meetings, rehearsals, duty rosters, and special conferences.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/calendar"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-xs"
            >
              <CalendarDays className="w-3.5 h-3.5 text-amber-400" />
              Calendar View
            </Link>
            <Link
              href="/admin/meetings/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-xs"
            >
              <Kanban className="w-3.5 h-3.5 text-blue-400" />
              Operations Board
            </Link>
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
                notify('Events synchronized.', 'success');
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Schedule Event / Sync
              </button>
            )}
          </div>
        </div>

        {/* 4 KPI Scorecard Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL GATHERINGS
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Unified
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {stats.total}
              </span>
              <span className="text-xs font-bold text-slate-400">Scheduled</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>{stats.servicesCount} Services · {stats.meetingsCount} Team Syncs</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                LIVE IN-SESSION
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                • Active Now
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.active}</span>
              <span className="text-xs font-bold text-emerald-500">Live Doors</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>Geofence &amp; QR verification open</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL CHECK-INS
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Verified
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalCheckedIn}</span>
              <span className="text-xs font-bold text-slate-400">Attendees</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>Across all tracked rosters</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                FUTURE SESSIONS
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Upcoming
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.scheduled}</span>
              <span className="text-xs font-bold text-slate-400">On Calendar</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>{uniqueVenues.length} designated locations</span>
            </div>
          </div>
        </div>

        {/* Unified Category Tabs & Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          {/* Top Category Tabs Strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-100 dark:border-slate-800/80">
            {[
              { key: 'all', label: `All Gatherings (${meetings.filter((m) => !m.archivedAt).length})`, icon: Layers },
              { key: 'services', label: `⛪ Services (${meetings.filter((m) => !m.archivedAt && isService(m)).length})`, icon: Building2 },
              { key: 'meetings', label: `👥 Meetings & Syncs (${meetings.filter((m) => !m.archivedAt && isMeeting(m)).length})`, icon: Users },
              { key: 'rehearsals', label: `🎵 Rehearsals (${meetings.filter((m) => !m.archivedAt && isRehearsal(m)).length})`, icon: Clock },
              { key: 'specials', label: `🌟 Conferences & Specials (${meetings.filter((m) => !m.archivedAt && isSpecial(m)).length})`, icon: Sparkles },
              { key: 'archived', label: `📦 Archived (${meetings.filter((m) => m.archivedAt).length})`, icon: Tag },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCategoryTab(tab.key as CategoryTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  categoryTab === tab.key
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-100 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent dark:border-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, team, venue, or type..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
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
                <option value="ACTIVE">Live Now</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="CLOSED">Concluded</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="All">Location: All</option>
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
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
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
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
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
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
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
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Timeline View"
                >
                  <GitCommit className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PRESENTATION MODES                                                        */}
        {/* ========================================================================= */}

        {loading ? (
          <div className="py-24 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Loading events &amp; services directory…</p>
          </div>
        ) : paginatedEvents.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <CalendarIcon className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No gatherings found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No records match your active category and filter criteria. Adjust your filters or schedule a new gathering.
            </p>
            {canCreate && (
              <button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400"
              >
                <Plus className="w-3.5 h-3.5" />
                Schedule New Gathering
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

                  const isVirtual = evt.locationName?.toLowerCase().includes('virtual') || evt.locationName?.toLowerCase().includes('online');

                  return (
                    <div
                      key={evt.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 flex flex-col justify-between hover:border-amber-500/50 transition-all group"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-500 dark:text-amber-400 truncate">
                            {evt.eventType?.name ?? evt.category?.name ?? 'General Gathering'}
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
                            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>{dateStr} · {timeStr}</span>
                          </p>
                          <p className="flex items-center gap-1.5 truncate">
                            {isVirtual ? (
                              <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate">{evt.locationName || 'Main Centre'}</span>
                          </p>
                        </div>

                        {/* Audience scope tags if restricted */}
                        {evt.visibility === 'RESTRICTED' && evt.audiences && evt.audiences.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {evt.audiences.map((aud, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              >
                                {aud.subTeam?.name || aud.scope || 'Custom Scope'}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px]">Checked-in Attendees:</span>
                            <strong className="text-slate-900 dark:text-white font-black">
                              {evt._count?.attendanceRecords || 0}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px]">Attendance Policy:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {evt.isCompulsory ? 'Compulsory (×' + (evt.pointWeight || 1) + ')' : 'Optional'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/admin/live-meeting/${evt.id}`}
                            className="px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors shadow-xs flex items-center gap-1"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            Live Roster
                          </Link>
                          <Link
                            href={`/admin/wardrobe/schedule`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Duty & Wardrobe Schedule"
                          >
                            <Shirt className="w-3.5 h-3.5" />
                          </Link>
                        </div>

                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditing(evt);
                                setFormOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="Edit Gathering"
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
                                  'Gathering duplicated.',
                                )
                              }
                              disabled={busyId === evt.id}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="Duplicate / Clone"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {can('events.cancel') && evt.status !== 'CLOSED' && evt.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setCancelTarget(evt)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                              title="Cancel Gathering"
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
                        <th className="py-3 px-4">GATHERING TITLE &amp; TYPE</th>
                        <th className="py-3 px-4">SCHEDULE DATE / TIME</th>
                        <th className="py-3 px-4">VENUE / MODE</th>
                        <th className="py-3 px-4 text-center">ATTENDANCE</th>
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
                              <div className="text-[11px] text-amber-500 dark:text-amber-400 font-semibold">{evt.eventType?.name || evt.category?.name || 'General Gathering'}</div>
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
                            <td className="py-3 px-4 text-center font-semibold text-slate-500">
                              {evt.isCompulsory ? 'Compulsory' : 'Optional'}
                            </td>
                            <td className="py-3 px-4 text-center font-black text-slate-900 dark:text-white">
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
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
                                >
                                  Monitor
                                </Link>
                                {canEdit && (
                                  <button
                                    onClick={() => {
                                      setEditing(evt);
                                      setFormOpen(true);
                                    }}
                                    className="p-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
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
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400"
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
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 border-amber-500" />

                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-amber-500 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
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
                              className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 dark:text-amber-400 hover:underline"
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
                of <span className="font-bold text-slate-900 dark:text-white">{totalRecords}</span> gatherings
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
          confirmLabel="Yes, Cancel Gathering"
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
              'Gathering cancelled.',
            );
            setCancelTarget(null);
          }}
          onCancel={() => setCancelTarget(null)}
        />
      </div>
    </AdminLayoutShell>
  );
}
