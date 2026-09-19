'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  FileText,
  FileCheck,
  Award,
  Share2,
  Calculator,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import {
  EventForm,
  EventTypeOption,
  CategoryOption,
  emptyEvent,
  meetingToForm,
} from '../../../../components/EventForm';
import {
  buildAdvancedGoogleCalendarUrl,
  formatMeetingInviteMessage,
  extractVirtualUrl,
} from '../../../../lib/calendar-integration';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, ConfirmDialog, useToast } from '../../../../components/ui';
import { HeadcountModal } from '../../../../components/HeadcountModal';

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
  supervisingMinister?: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    roleInUnit?: string | null;
    subTeam?: { id: string; name: string } | null;
  } | null;
  headcount?: {
    id: string;
    totalHeadcount: number;
    male?: number | null;
    female?: number | null;
    children?: number | null;
    notes?: string | null;
    recordedAt: string;
    updatedAt: string;
    recordedBy?: { id: string; name: string; email: string } | null;
    lastUpdatedBy?: { id: string; name: string; email: string } | null;
  } | null;
}

type ViewMode = 'grid' | 'table' | 'compact' | 'timeline' | 'operations';
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

function EventsManagementContent() {
  const searchParams = useSearchParams();
  const initialViewParam = searchParams.get('view') as ViewMode | null;

  const { user, can, loading: authLoading } = useAuth();
  const { notify } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // View Mode
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialViewParam && ['grid', 'table', 'compact', 'timeline', 'operations'].includes(initialViewParam)
      ? initialViewParam
      : 'grid'
  );

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [formatFilter, setFormatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [venueFilter, setVenueFilter] = useState('All');

  // Selected session in Operations / Agenda mode
  const [selectedFocusSession, setSelectedFocusSession] = useState<Meeting | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals & Action Targets
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null);
  const [headcountMeeting, setHeadcountMeeting] = useState<Meeting | null>(null);
  const [busyId, setBusyId] = useState('');

  const canCreate = can('events.create');
  const canEdit = can('events.update');
  const canHeadcount = can('headcount.record') || can('headcount.read') || can('events.update');

  // Load view mode preference
  useEffect(() => {
    if (initialViewParam) return;
    try {
      const saved = localStorage.getItem('tfhc_events_view_mode') as ViewMode;
      if (saved && ['grid', 'table', 'compact', 'timeline', 'operations'].includes(saved)) {
        setViewMode(saved);
      }
    } catch {
      // Ignore
    }
  }, [initialViewParam]);

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
    const headers = ['ID', 'Title', 'Type', 'Category', 'Date', 'Time', 'Location', 'Status', 'Attendees', 'Official Physical Headcount'];
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
      m.headcount?.totalHeadcount ?? 'Not Recorded',
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

  // Auto-select focused session in operations view
  useEffect(() => {
    if (paginatedEvents.length > 0 && !selectedFocusSession) {
      setSelectedFocusSession(paginatedEvents[0]);
    }
  }, [paginatedEvents, selectedFocusSession]);

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
                Events, Services &amp; Agendas
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Consolidated management console for worship services, team syncs, rehearsals, order of business agendas, duty rosters, and special conferences.
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
                Schedule Gathering / Sync
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

              {/* 5 VIEW MODE TOGGLE BUTTONS (Including Operations & Agendas Board) */}
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
                  onClick={() => handleSetViewMode('operations')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    viewMode === 'operations'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Agendas & Operations Board"
                >
                  <Kanban className="w-4 h-4" />
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
                            <span className="text-slate-400 text-[11px]">Checked-in App:</span>
                            <strong className="text-slate-900 dark:text-white font-black">
                              {evt._count?.attendanceRecords || 0}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px] flex items-center gap-1">
                              <Calculator className="w-3 h-3 text-amber-500" />
                              Physical Headcount:
                            </span>
                            {evt.headcount ? (
                              <strong className="text-amber-400 font-black">
                                {evt.headcount.totalHeadcount}
                              </strong>
                            ) : (
                              <span className="text-slate-500 text-[11px] italic">Not recorded</span>
                            )}
                          </div>
                          {evt.supervisingMinister && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/40 dark:border-slate-800/60">
                              <span className="text-slate-400 text-[11px] flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                                Supervising Minister:
                              </span>
                              <span className="font-bold text-indigo-400 text-[11px]">
                                {evt.supervisingMinister.firstName} {evt.supervisingMinister.lastName}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/40 dark:border-slate-800/60">
                            <span className="text-slate-400 text-[11px]">Attendance Policy:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {evt.isCompulsory ? 'Compulsory (×' + (evt.pointWeight || 1) + ')' : 'Optional'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Google Calendar & Virtual Meeting actions bar */}
                      {(() => {
                        const virtualUrl = extractVirtualUrl(evt);
                        const googleCalUrl = buildAdvancedGoogleCalendarUrl({
                          id: evt.id,
                          title: evt.title,
                          description: evt.description,
                          notes: evt.notes,
                          startTime: evt.startTime,
                          endTime: evt.endTime,
                          locationName: evt.locationName,
                          address: evt.address,
                          virtualMeetingUrl: virtualUrl,
                        });

                        return (
                          <div className="flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <a
                                href={googleCalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-[11px] text-amber-500 hover:text-amber-400 hover:underline"
                                title="Open & Sync with Google Calendar"
                              >
                                <CalendarDays className="w-3.5 h-3.5" />
                                <span>Google Cal</span>
                              </a>
                              {virtualUrl && (
                                <>
                                  <span className="text-slate-600">•</span>
                                  <a
                                    href={virtualUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-bold text-[11px] text-blue-400 hover:text-blue-300 hover:underline truncate"
                                    title={`Join Online Room: ${virtualUrl}`}
                                  >
                                    <Video className="w-3.5 h-3.5" />
                                    <span>Meet Link</span>
                                  </a>
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const msg = formatMeetingInviteMessage({
                                  title: evt.title,
                                  description: evt.description,
                                  notes: evt.notes,
                                  startTime: evt.startTime,
                                  endTime: evt.endTime,
                                  locationName: evt.locationName,
                                  virtualMeetingUrl: virtualUrl,
                                });
                                navigator.clipboard.writeText(msg);
                                notify('Invite details & meeting link copied to clipboard!', 'success');
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Copy invitation message to clipboard"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })()}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/admin/live-meeting/${evt.id}`}
                            className="px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors shadow-xs flex items-center gap-1"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            Live Roster
                          </Link>
                          {canHeadcount && evt.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setHeadcountMeeting(evt)}
                              className={`p-1.5 rounded-xl transition-colors cursor-pointer border ${
                                evt.headcount
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-amber-400 border-transparent'
                              }`}
                              title={evt.headcount ? `Headcount: ${evt.headcount.totalHeadcount} (Click to Edit)` : 'Record Physical Headcount'}
                            >
                              <Calculator className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Link
                            href={`/admin/wardrobe/schedule`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Duty & Wardrobe Schedule"
                          >
                            <Shirt className="w-3.5 h-3.5" />
                          </Link>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedFocusSession(evt);
                              setViewMode('operations');
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="View Agenda & Operations"
                          >
                            <Kanban className="w-3.5 h-3.5" />
                          </button>
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

            {/* 2. OPERATIONS & AGENDAS SPLIT VIEW */}
            {viewMode === 'operations' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Interactive Sessions Directory (5 cols) */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Select Gathering / Session</span>
                    <span className="text-amber-400 font-bold">{paginatedEvents.length} Sessions</span>
                  </div>
                  {paginatedEvents.map((session) => {
                    const isSelected = selectedFocusSession?.id === session.id;
                    const badge = STATUS_BADGES[session.status] || STATUS_BADGES.CLOSED;
                    const dateStr = new Date(session.startTime).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    });
                    const timeStr = new Date(session.startTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedFocusSession(session)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/5'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono font-bold uppercase text-amber-500">
                            #{session.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white line-clamp-1">
                          {session.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>{dateStr} · {timeStr}</span>
                        </p>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="truncate max-w-[140px]">{session.locationName}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{session._count?.attendanceRecords || 0} app</span>
                            {session.headcount && (
                              <span className="font-black text-amber-400">· {session.headcount.totalHeadcount} physical</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Right: Focused Agenda & Session Detail (7 cols) */}
                <div className="lg:col-span-7">
                  {selectedFocusSession ? (
                    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                              {selectedFocusSession.eventType?.name || selectedFocusSession.category?.name || 'General Gathering'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${STATUS_BADGES[selectedFocusSession.status]?.color || ''}`}>
                              {STATUS_BADGES[selectedFocusSession.status]?.label}
                            </span>
                          </div>
                          <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                            {selectedFocusSession.title}
                          </h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/live-meeting/${selectedFocusSession.id}`}
                            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            Live Check-in
                          </Link>
                          {canHeadcount && selectedFocusSession.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setHeadcountMeeting(selectedFocusSession)}
                              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-500 dark:text-amber-400 text-xs font-black shadow-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
                              title="Record / Edit Official Physical Headcount"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                              {selectedFocusSession.headcount ? `Headcount: ${selectedFocusSession.headcount.totalHeadcount}` : 'Record Headcount'}
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditing(selectedFocusSession);
                                setFormOpen(true);
                              }}
                              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-300 hover:text-white"
                              title="Edit Gathering"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Information Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                          <span className="text-slate-400 font-medium">Date &amp; Schedule</span>
                          <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                            {new Date(selectedFocusSession.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <p className="text-slate-400">
                            {new Date(selectedFocusSession.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                          <span className="text-slate-400 font-medium">Venue / Location</span>
                          <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                            {selectedFocusSession.locationName}
                          </p>
                          <p className="text-slate-400">Radius: {selectedFocusSession.geofenceRadiusMeters}m</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                          <span className="text-slate-400 font-medium">App Verified</span>
                          <p className="font-black text-amber-400 text-base mt-0.5">
                            {selectedFocusSession._count?.attendanceRecords || 0}
                          </p>
                          <p className="text-slate-400">{selectedFocusSession.isCompulsory ? 'Compulsory' : 'Optional'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                          <span className="text-slate-400 font-medium">Official Headcount</span>
                          <p className="font-black text-emerald-400 text-base mt-0.5">
                            {selectedFocusSession.headcount ? selectedFocusSession.headcount.totalHeadcount : '—'}
                          </p>
                          <p className="text-slate-400 text-[11px] truncate">
                            {selectedFocusSession.headcount
                              ? [
                                  selectedFocusSession.headcount.male != null && `M:${selectedFocusSession.headcount.male}`,
                                  selectedFocusSession.headcount.female != null && `F:${selectedFocusSession.headcount.female}`,
                                  selectedFocusSession.headcount.children != null && `C:${selectedFocusSession.headcount.children}`,
                                ].filter(Boolean).join(' ') || 'Physical count'
                              : 'Not recorded'}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                          <span className="text-slate-400 font-medium flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                            Supervising Minister
                          </span>
                          <p className="font-bold text-indigo-400 text-xs mt-0.5 truncate">
                            {selectedFocusSession.supervisingMinister
                              ? `${selectedFocusSession.supervisingMinister.firstName} ${selectedFocusSession.supervisingMinister.lastName}`
                              : 'Unassigned'}
                          </p>
                          <p className="text-slate-400 text-[10px] truncate">
                            {selectedFocusSession.supervisingMinister?.subTeam?.name || selectedFocusSession.supervisingMinister?.roleInUnit || 'Executive Pool'}
                          </p>
                        </div>
                      </div>

                      {/* Description & Agenda Notes */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                          Agenda &amp; Order of Business
                        </h4>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 text-xs text-slate-300 leading-relaxed space-y-2">
                          {selectedFocusSession.description || selectedFocusSession.notes ? (
                            <>
                              {selectedFocusSession.description && <p>{selectedFocusSession.description}</p>}
                              {selectedFocusSession.notes && (
                                <div className="pt-2 border-t border-slate-800 text-slate-400 font-mono text-[11px]">
                                  {selectedFocusSession.notes}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-slate-500 italic py-2">
                              Standard order of worship and operations agenda. No custom notes recorded.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Audience Scopes if Restricted */}
                      {selectedFocusSession.visibility === 'RESTRICTED' && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            Designated Teams &amp; Rosters
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedFocusSession.audiences && selectedFocusSession.audiences.length > 0 ? (
                              selectedFocusSession.audiences.map((aud, i) => (
                                <span key={i} className="px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">
                                  {aud.subTeam?.name || aud.scope || 'Designated Role'}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">Restricted to church executives</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Google Calendar & Virtual Meeting Integration Card */}
                      {(() => {
                        const virtualUrl = extractVirtualUrl(selectedFocusSession);
                        const googleCalUrl = buildAdvancedGoogleCalendarUrl({
                          id: selectedFocusSession.id,
                          title: selectedFocusSession.title,
                          description: selectedFocusSession.description,
                          notes: selectedFocusSession.notes,
                          startTime: selectedFocusSession.startTime,
                          endTime: selectedFocusSession.endTime,
                          locationName: selectedFocusSession.locationName,
                          address: selectedFocusSession.address,
                          virtualMeetingUrl: virtualUrl,
                        });

                        return (
                          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-blue-500/10 border border-amber-500/30 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-amber-400" />
                                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                                  Google Calendar &amp; Virtual Sync
                                </span>
                              </div>
                              {virtualUrl ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                                  <Video className="w-3 h-3" />
                                  Online Room Active
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                                  In-Person
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <a
                                href={googleCalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 shadow-md"
                              >
                                <CalendarDays className="w-3.5 h-3.5" />
                                Add / Sync to Google Calendar
                              </a>

                              {virtualUrl && (
                                <a
                                  href={virtualUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                  Launch Online Room
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  const msg = formatMeetingInviteMessage({
                                    title: selectedFocusSession.title,
                                    description: selectedFocusSession.description,
                                    notes: selectedFocusSession.notes,
                                    startTime: selectedFocusSession.startTime,
                                    endTime: selectedFocusSession.endTime,
                                    locationName: selectedFocusSession.locationName,
                                    virtualMeetingUrl: virtualUrl,
                                  });
                                  navigator.clipboard.writeText(msg);
                                  notify('Formatted invitation copied to clipboard!', 'success');
                                }}
                                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700"
                              >
                                <Share2 className="w-3.5 h-3.5 text-amber-400" />
                                Copy Full Invite
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                      Select a session from the list to view order of business and agenda details.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. TABLE VIEW */}
            {viewMode === 'table' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">GATHERING TITLE &amp; TYPE</th>
                        <th className="py-3 px-4">SCHEDULE DATE / TIME</th>
                        <th className="py-3 px-4">VENUE / MODE</th>
                        <th className="py-3 px-4 text-center">POLICY</th>
                        <th className="py-3 px-4 text-center">CHECK-INS</th>
                        <th className="py-3 px-4 text-center">HEADCOUNT</th>
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
                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-amber-500 dark:text-amber-400 font-semibold">{evt.eventType?.name || evt.category?.name || 'General Gathering'}</span>
                                {evt.supervisingMinister && (
                                  <span className="text-indigo-400 font-bold">
                                    · Min: {evt.supervisingMinister.firstName} {evt.supervisingMinister.lastName}
                                  </span>
                                )}
                              </div>
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
                            <td className="py-3 px-4 text-center font-black">
                              {evt.headcount ? (
                                <span className="text-amber-400 font-black">{evt.headcount.totalHeadcount}</span>
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.color}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {(() => {
                                const virtualUrl = extractVirtualUrl(evt);
                                const googleCalUrl = buildAdvancedGoogleCalendarUrl({
                                  id: evt.id,
                                  title: evt.title,
                                  description: evt.description,
                                  notes: evt.notes,
                                  startTime: evt.startTime,
                                  endTime: evt.endTime,
                                  locationName: evt.locationName,
                                  address: evt.address,
                                  virtualMeetingUrl: virtualUrl,
                                });

                                return (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <a
                                      href={googleCalUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                      title="Sync with Google Calendar"
                                    >
                                      <CalendarDays className="w-3.5 h-3.5" />
                                    </a>
                                    {virtualUrl && (
                                      <a
                                        href={virtualUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        title="Join Google Meet / Online Room"
                                      >
                                        <Video className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                    {canHeadcount && evt.status !== 'CANCELLED' && (
                                      <button
                                        onClick={() => setHeadcountMeeting(evt)}
                                        className={`p-1 rounded-lg cursor-pointer ${
                                          evt.headcount
                                            ? 'text-amber-400 hover:text-amber-300'
                                            : 'text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                        title={evt.headcount ? `Headcount: ${evt.headcount.totalHeadcount}` : 'Record Headcount'}
                                      >
                                        <Calculator className="w-3.5 h-3.5" />
                                      </button>
                                    )}
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
                                );
                              })()}
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
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                {paginatedEvents.map((evt) => {
                  const badge = STATUS_BADGES[evt.status] || STATUS_BADGES.CLOSED;
                  const virtualUrl = extractVirtualUrl(evt);
                  const googleCalUrl = buildAdvancedGoogleCalendarUrl({
                    id: evt.id,
                    title: evt.title,
                    description: evt.description,
                    notes: evt.notes,
                    startTime: evt.startTime,
                    endTime: evt.endTime,
                    locationName: evt.locationName,
                    address: evt.address,
                    virtualMeetingUrl: virtualUrl,
                  });

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
                            <span>{evt._count?.attendanceRecords || 0} app check-ins</span>
                            {evt.headcount && (
                              <>
                                <span>•</span>
                                <span className="text-amber-400 font-bold">{evt.headcount.totalHeadcount} physical headcount</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <a
                          href={googleCalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded text-slate-400 hover:text-amber-400"
                          title="Sync to Google Calendar"
                        >
                          <CalendarDays className="w-3.5 h-3.5" />
                        </a>
                        {virtualUrl && (
                          <a
                            href={virtualUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded text-slate-400 hover:text-blue-400"
                            title="Join Virtual Meet"
                          >
                            <Video className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {canHeadcount && evt.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setHeadcountMeeting(evt)}
                            className="p-1 rounded text-slate-400 hover:text-amber-400 cursor-pointer"
                            title="Record / Edit Headcount"
                          >
                            <Calculator className="w-3.5 h-3.5" />
                          </button>
                        )}
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

            {/* 5. TIMELINE VIEW */}
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
                              {evt._count?.attendanceRecords || 0} App Check-ins
                            </span>
                            {evt.headcount && (
                              <span className="flex items-center gap-1 text-amber-400 font-bold">
                                <Calculator className="w-3.5 h-3.5" />
                                {evt.headcount.totalHeadcount} Physical Headcount
                              </span>
                            )}
                          </div>

                          <div className="pt-1 flex items-center gap-3">
                            <Link
                              href={`/admin/live-meeting/${evt.id}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 dark:text-amber-400 hover:underline"
                            >
                              <span>Open Live Operations Roster</span>
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                            {canHeadcount && evt.status !== 'CANCELLED' && (
                              <button
                                onClick={() => setHeadcountMeeting(evt)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-amber-400 cursor-pointer"
                              >
                                <Calculator className="w-3 h-3" />
                                <span>{evt.headcount ? 'Edit Headcount' : 'Record Headcount'}</span>
                              </button>
                            )}
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

        {/* Headcount Modal */}
        {headcountMeeting && (
          <HeadcountModal
            meetingId={headcountMeeting.id}
            meetingTitle={headcountMeeting.title}
            meetingDate={headcountMeeting.startTime}
            initialHeadcount={headcountMeeting.headcount || null}
            isOpen={Boolean(headcountMeeting)}
            onClose={() => setHeadcountMeeting(null)}
            onSuccess={async () => {
              await load();
              notify('Official general service headcount recorded successfully.', 'success');
            }}
          />
        )}
      </div>
    </AdminLayoutShell>
  );
}

export default function EventsManagementPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading Events &amp; Services Hub...</div>}>
      <EventsManagementContent />
    </Suspense>
  );
}
