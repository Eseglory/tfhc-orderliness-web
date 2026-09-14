'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Users,
  Building2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  RefreshCw,
  Download,
  Flame,
  ChevronRight,
  Edit2,
  Archive,
  Ban,
  Eye,
  MapPin,
  Sparkles,
  Shield,
  Activity,
  CalendarDays,
  ExternalLink,
  Tag,
  LayoutGrid,
  Table as TableIcon,
  Columns,
  List,
  Video,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  UserCheck,
  Calendar,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, ConfirmDialog, useToast } from '../../../../components/ui';

export interface MeetingItem {
  id: string;
  title: string;
  description?: string | null;
  meetingDate: string;
  startTime: string;
  endTime: string | null;
  status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  locationName: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  isCompulsory: boolean;
  visibility: string;
  organizerName?: string | null;
  notes?: string | null;
  category?: { id: string; name: string };
  eventType?: { id: string; name: string; color: string | null };
  _count?: { attendanceRecords: number; invitations: number };
}

type ViewMode = 'grid' | 'table' | 'timeline' | 'compact';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  ACTIVE: {
    label: 'Live Active',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  SCHEDULED: {
    label: 'Scheduled',
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  CLOSED: {
    label: 'Concluded & Archived',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
};

export default function AdminMeetingsPage() {
  const { can, user } = useAuth();
  const { notify } = useToast();

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & View State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<MeetingItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingItem | null>(null);
  const [cancelModalMeeting, setCancelModalMeeting] = useState<MeetingItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Schedule Form State
  const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unit Administrator';
  const [formTitle, setFormTitle] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:30');
  const [formLocationType, setFormLocationType] = useState<'PHYSICAL' | 'ONLINE'>('PHYSICAL');
  const [formLocationName, setFormLocationName] = useState('Conference Room A');
  const [formOrganizer, setFormOrganizer] = useState(userName);
  const [formNotes, setFormNotes] = useState('');
  const [formCompulsory, setFormCompulsory] = useState(true);

  // Load view mode preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tfhc_meetings_view_mode') as ViewMode;
      if (saved && ['grid', 'table', 'timeline', 'compact'].includes(saved)) {
        setViewMode(saved);
      }
    } catch {}
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('tfhc_meetings_view_mode', mode);
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [meets, cats] = await Promise.all([
        fetchApi<MeetingItem[]>('/meetings').catch(() => []),
        fetchApi<{ id: string; name: string }[]>('/meetings/categories').catch(() => []),
      ]);
      setMeetings(meets || []);
      setCategories(cats || []);
    } catch (e: any) {
      notify(e.message || 'Could not load meetings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingMeeting(null);
    setFormTitle('');
    setFormCategoryId(categories[0]?.id || '');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormStartTime('09:00');
    setFormEndTime('10:30');
    setFormLocationType('PHYSICAL');
    setFormLocationName('Conference Room A');
    setFormOrganizer(userName);
    setFormNotes('');
    setFormCompulsory(true);
    setCreateModalOpen(true);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      notify('Meeting title is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const startIso = new Date(`${formDate}T${formStartTime}:00`).toISOString();
      const endIso = formEndTime ? new Date(`${formDate}T${formEndTime}:00`).toISOString() : undefined;

      const location = formLocationType === 'ONLINE' ? 'Google Meet Online Room' : formLocationName.trim();

      const payload = {
        title: formTitle.trim(),
        categoryId: formCategoryId || categories[0]?.id,
        meetingDate: startIso,
        startTime: startIso,
        expectedArrivalTime: startIso,
        attendanceOpenTime: startIso,
        attendanceCloseTime: endIso || startIso,
        endTime: endIso,
        locationName: location,
        latitude: 6.6697906,
        longitude: 3.3581822,
        geofenceRadiusMeters: 100,
        organizerName: formOrganizer.trim() || undefined,
        notes: formNotes.trim() || undefined,
        isCompulsory: formCompulsory,
        visibility: 'PUBLIC',
      };

      if (editingMeeting) {
        await fetchApi(`/meetings/${editingMeeting.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('Meeting updated successfully', 'success');
      } else {
        await fetchApi('/meetings', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('Meeting scheduled and published to calendar', 'success');
      }

      setCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      notify(err.message || 'Failed to schedule meeting', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelMeeting = async () => {
    if (!cancelModalMeeting) return;
    try {
      await fetchApi(`/meetings/${cancelModalMeeting.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'CANCELLED',
          cancelReason: cancelReason.trim() || 'Cancelled by lead coordinator',
        }),
      });
      notify('Meeting cancelled', 'success');
      setCancelModalMeeting(null);
      setCancelReason('');
      await loadData();
    } catch (e: any) {
      notify(e.message || 'Failed to cancel meeting', 'error');
    }
  };

  // Filtered & Paginated records
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchesSearch =
        !search ||
        m.title.toLowerCase().includes(search.toLowerCase()) ||
        m.locationName.toLowerCase().includes(search.toLowerCase()) ||
        (m.organizerName && m.organizerName.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter;
      const matchesCat = categoryFilter === 'ALL' || m.category?.id === categoryFilter;

      return matchesSearch && matchesStatus && matchesCat;
    });
  }, [meetings, search, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(filteredMeetings.length / pageSize) || 1;
  const paginatedMeetings = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMeetings.slice(start, start + pageSize);
  }, [filteredMeetings, page, pageSize]);

  // KPIs
  const totalMeetingsCount = meetings.length;
  const activeCount = meetings.filter((m) => m.status === 'ACTIVE').length;
  const scheduledCount = meetings.filter((m) => m.status === 'SCHEDULED').length;

  return (
    <AdminLayoutShell activeHref="/admin/meetings">
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
              <span>COLLABORATION &amp; GOVERNANCE</span>
              <span>•</span>
              <span>MEETINGS SUITE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
              Scheduled Meetings &amp; Syncs
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
              Schedule, track, and administer staff meetings, executive reviews, committee assemblies, and operational team syncs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <Link
              href="/admin/meetings/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-200 hover:bg-violet-100 transition-colors shadow-sm"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Operations Dashboard</span>
            </Link>

            <Link
              href="/admin/live-meeting"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm"
            >
              <Flame className="w-3.5 h-3.5 text-emerald-600" />
              <span>Live Attendance</span>
            </Link>

            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Schedule Meeting</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Meetings</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalMeetingsCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Recorded collaborative syncs</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Live Active</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{activeCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">In-progress meetings right now</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Flame className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Upcoming Scheduled</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{scheduledCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Ready on team calendars</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <CalendarDays className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filters & View Switcher */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search meeting title, room venue, organizer..."
                className="w-full pl-9 pr-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ACTIVE">Live Active</option>
                <option value="CLOSED">Concluded</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              {/* 4 View Modes */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => handleViewModeChange('grid')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Grid Cards View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('table')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Data Table View"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('timeline')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'timeline'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Chronological Timeline"
                >
                  <Columns className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('compact')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Views */}
        {loading ? (
          <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Loading meetings schedule...</p>
          </div>
        ) : paginatedMeetings.length === 0 ? (
          <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
              <Clock className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No meetings found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              No meetings matched your search and filter criteria. Schedule a new staff or committee meeting.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule First Meeting</span>
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* 1. Grid Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedMeetings.map((m) => {
              const statusBadge = STATUS_BADGES[m.status] || STATUS_BADGES.SCHEDULED;
              const start = new Date(m.startTime);
              const end = m.endTime ? new Date(m.endTime) : null;
              return (
                <div
                  key={m.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/40 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {m.category?.name || 'General Sync'}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">{m.title}</h3>
                      {m.organizerName && (
                        <p className="text-xs text-slate-400 mt-0.5">Chair: {m.organizerName}</p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Date:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Time Window:</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {end ? ` – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Venue:</span>
                        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{m.locationName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{m._count?.attendanceRecords || 0}</span> attendees
                    </div>

                    <div className="flex items-center gap-1.5">
                      {m.status === 'ACTIVE' && (
                        <Link
                          href={`/admin/live-meeting/${m.id}`}
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                        >
                          Live Clock-In
                        </Link>
                      )}
                      <Link
                        href={`/admin/live-meeting/${m.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 transition-colors"
                        title="View Live Session"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                      {m.status === 'SCHEDULED' && (
                        <button
                          onClick={() => setCancelModalMeeting(m)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Cancel Meeting"
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
        ) : viewMode === 'table' ? (
          /* 2. Data Table View */
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Meeting Title</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Date &amp; Time</th>
                    <th className="py-3 px-4">Venue</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Attendees</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedMeetings.map((m) => {
                    const statusBadge = STATUS_BADGES[m.status] || STATUS_BADGES.SCHEDULED;
                    const start = new Date(m.startTime);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          <div>{m.title}</div>
                          {m.organizerName && <div className="text-[11px] font-normal text-slate-400">Lead: {m.organizerName}</div>}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          {m.category?.name || 'General Sync'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">
                            {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                          {m.locationName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-300">
                          {m._count?.attendanceRecords || 0}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/admin/live-meeting/${m.id}`}
                              className="px-2 py-1 text-[11px] font-bold rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100"
                            >
                              Live View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'timeline' ? (
          /* 3. Chronological Timeline View */
          <div className="space-y-4">
            {paginatedMeetings.map((m) => {
              const statusBadge = STATUS_BADGES[m.status] || STATUS_BADGES.SCHEDULED;
              const start = new Date(m.startTime);
              return (
                <div
                  key={m.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-16 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 text-center shrink-0">
                      <span className="block text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400">
                        {start.toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                      <span className="block text-xl font-black text-slate-900 dark:text-white">
                        {start.getDate()}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {m.locationName}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">{m.title}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Link
                      href={`/admin/live-meeting/${m.id}`}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                    >
                      Open Session
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 4. Compact List View */
          <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            {paginatedMeetings.map((m) => {
              const statusBadge = STATUS_BADGES[m.status] || STATUS_BADGES.SCHEDULED;
              const start = new Date(m.startTime);
              return (
                <div key={m.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="truncate">
                      <span className="text-xs font-bold text-slate-900 dark:text-white mr-2">{m.title}</span>
                      <span className="text-[11px] text-slate-400">
                        {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {m.locationName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${statusBadge.color}`}>
                      {statusBadge.label}
                    </span>
                    <Link
                      href={`/admin/live-meeting/${m.id}`}
                      className="px-2 py-1 text-[10px] font-bold rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400"
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {filteredMeetings.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm text-xs text-slate-500">
            <div>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
              <strong>{Math.min(page * pageSize, filteredMeetings.length)}</strong> of{' '}
              <strong>{filteredMeetings.length}</strong> meetings
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 font-bold text-slate-900 dark:text-white">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Schedule Meeting Modal */}
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Schedule Collaborative Meeting"
        >
          <form onSubmit={handleSaveMeeting} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Meeting Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Staff Coordination & Operations Review"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Meeting Category</label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Organizer / Chair</label>
                <input
                  type="text"
                  value={formOrganizer}
                  onChange={(e) => setFormOrganizer(e.target.value)}
                  placeholder="Chairperson Name"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Date and Times */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Meeting Date *</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Start Time *</label>
                <input
                  type="time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">End Time</label>
                <input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Platform / Location */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Location Type</label>
                <select
                  value={formLocationType}
                  onChange={(e) => setFormLocationType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PHYSICAL">Physical Conference Room</option>
                  <option value="ONLINE">Google Meet / Online</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Room / Venue Name</label>
                <input
                  type="text"
                  value={formLocationName}
                  onChange={(e) => setFormLocationName(e.target.value)}
                  disabled={formLocationType === 'ONLINE'}
                  placeholder="e.g. Conference Room A"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Agenda &amp; Notes</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Key agenda topics, briefing notes, and preparation instructions..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
              >
                {saving ? 'Scheduling...' : 'Schedule & Publish'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Cancel Meeting Modal */}
        <Modal
          isOpen={!!cancelModalMeeting}
          onClose={() => setCancelModalMeeting(null)}
          title="Cancel Meeting"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300">
              Are you sure you want to cancel the meeting <strong>&quot;{cancelModalMeeting?.title}&quot;</strong>?
            </p>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cancellation Reason</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Schedule conflict or quorum unavailable"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancelModalMeeting(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCancelMeeting}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 shadow-sm"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayoutShell>
  );
}
