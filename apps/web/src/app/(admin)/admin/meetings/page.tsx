'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  Flame,
  Radio,
  SlidersHorizontal,
  ChevronRight,
  Edit2,
  Copy,
  Archive,
  Ban,
  Eye,
  Layers,
  MapPin,
  Sparkles,
  Shield,
  Activity,
  Check,
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
  category?: { name: string };
  eventType?: { name: string; color: string | null } | null;
  _count?: { attendanceRecords: number; invitations: number };
}

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active Live', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  SCHEDULED: { label: 'Scheduled', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
  CLOSED: { label: 'Closed', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
  CANCELLED: { label: 'Cancelled', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
};

export default function AdminMeetingsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null);
  const [busyId, setBusyId] = useState('');

  const canCreate = can('events.create');
  const canEdit = can('events.update');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('eventTypeId', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      if (showArchived) params.set('includeArchived', 'true');
      const [m, t, c] = await Promise.all([
        fetchApi<Meeting[]>(`/meetings?${params}`),
        fetchApi<EventTypeOption[]>('/meetings/event-types'),
        fetchApi<CategoryOption[]>('/meetings/categories'),
      ]);
      setMeetings(m);
      setEventTypes(t);
      setCategories(c);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load meetings & services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    const h = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(h);
  }, [authLoading, statusFilter, typeFilter, search, showArchived]);

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
        await fetchApi(`/meetings/${editing.id}`, { method: 'PUT', body: JSON.stringify(formData) });
        notify('Event updated.', 'success');
      } else {
        await fetchApi('/meetings', { method: 'POST', body: JSON.stringify(formData) });
        notify('Event scheduled.', 'success');
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save event.', 'error');
    }
  };

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
        {/* Top Breadcrumbs & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>CHURCH OPERATIONS</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">GRACE CATHEDRAL CAMPUS</span>
              <span>/</span>
              <span>ALL MEETINGS &amp; SERVICES</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                All Meetings &amp; Worship Services
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Schedule, manage, live-monitor, and audit ecclesiastical gatherings, synods, and Sunday services.
            </p>
          </div>

          {/* Top Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Refresh
            </button>
            <Link
              href="/admin/live-meeting"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all shadow-sm font-black"
            >
              <Flame className="w-3.5 h-3.5 text-slate-950" />
              Live Monitor
            </Link>
            {canCreate && (
              <button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                Schedule Gathering
              </button>
            )}
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL GATHERINGS
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <CalendarIcon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
              <span className="text-xs font-bold text-slate-400">Total</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Includes past &amp; scheduled</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ACTIVE LIVE
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.active}</span>
              <span className="text-xs font-bold text-emerald-600">In-Session</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Attendance open now</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                SCHEDULED SESSIONS
              </span>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.scheduled}</span>
              <span className="text-xs font-bold text-blue-600">Upcoming</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Future calendar items</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL CHECKED IN
              </span>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalCheckedIn}</span>
              <span className="text-xs font-bold text-slate-400">Headcount</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Verified attendances logged</span>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, location, or code... (⌘K)"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active (Live)</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="CLOSED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="">All Event Types</option>
                {eventTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 px-2 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span>Include Archived</span>
              </label>

              {(search || statusFilter || typeFilter || showArchived) && (
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('');
                    setTypeFilter('');
                    setShowArchived(false);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors px-2 py-1"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Meetings List Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-5">GATHERING TITLE &amp; TYPE</th>
                  <th className="py-3 px-4">WHEN</th>
                  <th className="py-3 px-4">LOCATION &amp; GEOFENCE</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4">HEADCOUNT</th>
                  <th className="py-3 px-5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {meetings.length > 0 ? (
                  meetings.map((m) => {
                    const badge = STATUS_BADGES[m.status] || STATUS_BADGES.CLOSED;
                    return (
                      <tr
                        key={m.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                          m.archivedAt ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-2.5">
                            {m.eventType?.color ? (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ background: m.eventType.color }}
                              />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                                  {m.title}
                                </span>
                                {m.visibility === 'RESTRICTED' && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                    Restricted
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {m.eventType?.name ?? m.category?.name ?? 'General Service'}
                                {!m.isCompulsory && <span> • Optional</span>}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {new Date(m.startTime).toLocaleDateString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                              {m.locationName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {m.geofenceRadiusMeters}m geofence
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.color}`}>
                            {badge.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>{m._count?.attendanceRecords ?? 0}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/admin/live-meeting/${m.id}`}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                            >
                              Live Monitor
                            </Link>

                            {canEdit && (m.status === 'ACTIVE' || m.status === 'SCHEDULED') && (
                              <button
                                onClick={() =>
                                  act(
                                    m.id,
                                    () =>
                                      fetchApi(`/meetings/${m.id}/status`, {
                                        method: 'PUT',
                                        body: JSON.stringify({
                                          status: m.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE',
                                        }),
                                      }),
                                    m.status === 'ACTIVE' ? 'Attendance closed' : 'Attendance opened',
                                  )
                                }
                                disabled={busyId === m.id}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                              >
                                {m.status === 'ACTIVE' ? 'Close' : 'Open'}
                              </button>
                            )}

                            {canEdit && ['SCHEDULED', 'ACTIVE'].includes(m.status) && (
                              <button
                                onClick={() => {
                                  setEditing(m);
                                  setFormOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canCreate && (
                              <button
                                onClick={() =>
                                  act(
                                    m.id,
                                    () => fetchApi(`/meetings/${m.id}/duplicate`, { method: 'POST', body: '{}' }),
                                    'Event duplicated',
                                  )
                                }
                                disabled={busyId === m.id}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Duplicate"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {can('events.cancel') && m.status !== 'CLOSED' && m.status !== 'CANCELLED' && (
                              <button
                                onClick={() => setCancelTarget(m)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                                title="Cancel Event"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                      No meetings or worship services match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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
          body={`Are you sure you want to cancel "${cancelTarget?.title}"? All scheduled attendees and notifications will be paused.`}
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
              'Event cancelled',
            );
            setCancelTarget(null);
          }}
          onCancel={() => setCancelTarget(null)}
        />
      </div>
    </AdminLayoutShell>
  );
}
