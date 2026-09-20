'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  Shield,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  RefreshCw,
  Download,
  Phone,
  Video,
  ExternalLink,
  MapPin,
  Tag,
  LayoutGrid,
  Table as TableIcon,
  Columns,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit2,
  CalendarDays,
  CalendarCheck,
  XCircle,
  AlertTriangle,
  UserCheck,
  Building2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, ConfirmDialog, useToast } from '../../../../components/ui';

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'NO_SHOW';

export type AppointmentMode = 'IN_PERSON' | 'VIDEO_CONFERENCE' | 'PHONE_CALL';

export interface AppointmentRecord {
  id: string;
  referenceCode: string;
  title: string;
  serviceId: string | null;
  service?: { id: string; name: string; category: string; durationMinutes: number } | null;
  memberId: string | null;
  member?: { id: string; firstName: string; lastName: string; memberCode: string; phoneNumber: string } | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  providerId: string | null;
  providerName: string;
  providerEmail: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  mode: AppointmentMode;
  location: string | null;
  meetingUrl: string | null;
  status: AppointmentStatus;
  notes: string | null;
  intakeNotes: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

type ViewMode = 'grid' | 'table' | 'cards' | 'compact';

const STATUS_BADGES: Record<AppointmentStatus, { label: string; color: string }> = {
  SCHEDULED: {
    label: 'Scheduled',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  CONFIRMED: {
    label: 'Confirmed',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  COMPLETED: {
    label: 'Completed',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  RESCHEDULED: {
    label: 'Rescheduled',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  NO_SHOW: {
    label: 'No-Show',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
};

export default function AppointmentsPage() {
  const { user } = useAuth();
  const { notify } = useToast();

  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [servicesList, setServicesList] = useState<{ id: string; name: string; durationMinutes: number; defaultLocation: string | null }[]>([]);
  const [membersList, setMembersList] = useState<{ id: string; firstName: string; lastName: string; memberCode: string; phoneNumber: string; email?: string }[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRecord | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<AppointmentRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);

  // New Appointment Form State
  const [formServiceId, setFormServiceId] = useState('');
  const [formMemberId, setFormMemberId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formClientEmail, setFormClientEmail] = useState('');
  const [formClientPhone, setFormClientPhone] = useState('');
  const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Lead Coordinator';
  const [formProviderName, setFormProviderName] = useState(userName);
  const [formProviderId, setFormProviderId] = useState(user?.userId || 'lead-coord-01');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formTime, setFormTime] = useState('10:00');
  const [formDuration, setFormDuration] = useState(30);
  const [formMode, setFormMode] = useState<AppointmentMode>('IN_PERSON');
  const [formLocation, setFormLocation] = useState('Executive Suite 201');
  const [formMeetingUrl, setFormMeetingUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Reschedule Form State
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Load view mode preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tfhc_appointments_view_mode') as ViewMode;
      if (saved && ['grid', 'table', 'cards', 'compact'].includes(saved)) {
        setViewMode(saved);
      }
    } catch {}
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('tfhc_appointments_view_mode', mode);
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [appRes, srvRes, memRes] = await Promise.all([
        fetchApi<{ items: AppointmentRecord[]; total: number }>('/appointments').catch(() => ({ items: [], total: 0 })),
        fetchApi<{ items: any[] }>('/services?activeOnly=true').catch(() => ({ items: [] })),
        fetchApi<any[]>('/members').catch(() => []),
      ]);

      setAppointments(appRes.items || []);
      setTotalRecords(appRes.total || 0);
      setServicesList(srvRes.items || []);
      setMembersList(memRes || []);
    } catch (e: any) {
      notify(e.message || 'Could not load appointments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When Member is selected in create form, auto-fill client fields
  const handleMemberSelect = (memberId: string) => {
    setFormMemberId(memberId);
    if (!memberId) return;
    const m = membersList.find((mem) => mem.id === memberId);
    if (m) {
      setFormClientName(`${m.firstName} ${m.lastName}`);
      setFormClientPhone(m.phoneNumber || '');
      if (m.email) setFormClientEmail(m.email);
    }
  };

  // When Service is selected, auto-fill duration and default location
  const handleServiceSelect = (serviceId: string) => {
    setFormServiceId(serviceId);
    if (!serviceId) return;
    const s = servicesList.find((srv) => srv.id === serviceId);
    if (s) {
      setFormDuration(s.durationMinutes);
      if (s.defaultLocation) setFormLocation(s.defaultLocation);
    }
  };

  const openCreateModal = () => {
    setFormServiceId(servicesList[0]?.id || '');
    if (servicesList[0]) {
      setFormDuration(servicesList[0].durationMinutes);
      if (servicesList[0].defaultLocation) setFormLocation(servicesList[0].defaultLocation);
    }
    setFormMemberId('');
    setFormClientName('');
    setFormClientEmail('');
    setFormClientPhone('');
    setFormProviderName(userName);
    setFormProviderId(user?.userId || 'lead-coord-01');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime('10:00');
    setFormMode('IN_PERSON');
    setFormLocation('Executive Suite 201');
    setFormMeetingUrl('');
    setFormNotes('');
    setCreateModalOpen(true);
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClientName.trim()) {
      notify('Client name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const startDateTime = new Date(`${formDate}T${formTime}:00`);
      if (isNaN(startDateTime.getTime())) {
        notify('Invalid date or time selected', 'error');
        setSaving(false);
        return;
      }

      const endDateTime = new Date(startDateTime.getTime() + Number(formDuration) * 60000);

      const payload = {
        title: formServiceId
          ? `${servicesList.find((s) => s.id === formServiceId)?.name || 'Appointment'} with ${formClientName}`
          : `Consultation with ${formClientName}`,
        serviceId: formServiceId || undefined,
        memberId: formMemberId || undefined,
        clientName: formClientName.trim(),
        clientEmail: formClientEmail.trim() || undefined,
        clientPhone: formClientPhone.trim() || undefined,
        providerId: formProviderId,
        providerName: formProviderName.trim(),
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        durationMinutes: Number(formDuration),
        mode: formMode,
        location: formLocation.trim() || undefined,
        meetingUrl: formMode === 'VIDEO_CONFERENCE' ? formMeetingUrl.trim() || undefined : undefined,
        notes: formNotes.trim() || undefined,
      };

      await fetchApi('/appointments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      notify('Appointment confirmed and added to calendar', 'success');
      setCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      notify(err.message || 'Failed to schedule appointment. Possible provider conflict.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openRescheduleModal = (app: AppointmentRecord) => {
    setSelectedAppointment(app);
    const d = new Date(app.startTime);
    setRescheduleDate(d.toISOString().split('T')[0]);
    setRescheduleTime(
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    );
    setRescheduleReason('');
    setRescheduleModalOpen(true);
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    setSaving(true);
    try {
      const newStart = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      if (isNaN(newStart.getTime())) {
        notify('Invalid date or time selected', 'error');
        setSaving(false);
        return;
      }

      await fetchApi(`/appointments/${selectedAppointment.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({
          startTime: newStart.toISOString(),
          reason: rescheduleReason.trim() || undefined,
        }),
      });

      notify('Appointment rescheduled successfully', 'success');
      setRescheduleModalOpen(false);
      setSelectedAppointment(null);
      await loadData();
    } catch (err: any) {
      notify(err.message || 'Failed to reschedule appointment. Check provider availability.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (appId: string, status: AppointmentStatus) => {
    try {
      await fetchApi(`/appointments/${appId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(`Appointment marked as ${status.toLowerCase()}`, 'success');
      await loadData();
    } catch (err: any) {
      notify(err.message || 'Failed to update status', 'error');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingAppointment) return;
    try {
      await fetchApi(`/appointments/${cancellingAppointment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'CANCELLED',
          cancellationReason: cancelReason.trim() || 'Cancelled by coordinator',
        }),
      });
      notify('Appointment cancelled', 'success');
      setCancellingAppointment(null);
      setCancelReason('');
      await loadData();
    } catch (err: any) {
      notify(err.message || 'Failed to cancel appointment', 'error');
    }
  };

  // Filtered & Paginated records
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const matchesSearch =
        !search ||
        a.referenceCode.toLowerCase().includes(search.toLowerCase()) ||
        a.clientName.toLowerCase().includes(search.toLowerCase()) ||
        a.providerName.toLowerCase().includes(search.toLowerCase()) ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        (a.notes && a.notes.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
      const matchesMode = modeFilter === 'ALL' || a.mode === modeFilter;
      const matchesService = serviceFilter === 'ALL' || a.serviceId === serviceFilter;

      return matchesSearch && matchesStatus && matchesMode && matchesService;
    });
  }, [appointments, search, statusFilter, modeFilter, serviceFilter]);

  const totalPages = Math.ceil(filteredAppointments.length / pageSize) || 1;
  const paginatedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAppointments.slice(start, start + pageSize);
  }, [filteredAppointments, page, pageSize]);

  // KPIs
  const totalAppointmentsCount = appointments.length;
  const confirmedCount = appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'SCHEDULED').length;
  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;

  return (
    <AdminLayoutShell activeHref="/admin/appointments">
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-amber-600 dark:text-amber-400 uppercase">
              <span>SCHEDULE &amp; CONSULTATIONS</span>
              <span>•</span>
              <span>APPOINTMENTS DIRECTORY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
              Appointments &amp; Provider Bookings
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
              Manage one-on-one member appointments, executive consultations, advisory sessions, and provider calendars with conflict prevention.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
              title="Refresh appointments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <Link
              href="/admin/services"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-100 transition-colors shadow-sm"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Services Catalog</span>
            </Link>

            <Link
              href="/admin/calendar"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </Link>

            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 active:scale-95 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Appointment</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Bookings</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalAppointmentsCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Recorded appointment sessions</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Confirmed &amp; Upcoming</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{confirmedCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Active on provider schedules</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Completed Sessions</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{completedCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Successfully concluded sessions</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <UserCheck className="w-6 h-6" />
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
                placeholder="Search reference code, client name, provider, notes..."
                className="w-full pl-9 pr-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
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
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="RESCHEDULED">Rescheduled</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="NO_SHOW">No-Show</option>
              </select>

              <select
                value={modeFilter}
                onChange={(e) => {
                  setModeFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">All Modes</option>
                <option value="IN_PERSON">In-Person</option>
                <option value="VIDEO_CONFERENCE">Google Meet / Video</option>
                <option value="PHONE_CALL">Phone Call</option>
              </select>

              {/* 4 View Modes */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => handleViewModeChange('grid')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Schedule Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('table')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Booking Table View"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('cards')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Detailed Client Cards View"
                >
                  <Columns className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('compact')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact Ledger View"
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
            <RefreshCw className="w-7 h-7 text-amber-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Loading appointments schedule...</p>
          </div>
        ) : paginatedAppointments.length === 0 ? (
          <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
              <Clock className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No appointments found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              No appointments matched your search and filter criteria. Schedule a new appointment session.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule First Appointment</span>
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* 1. Schedule Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedAppointments.map((a) => {
              const statusBadge = STATUS_BADGES[a.status] || STATUS_BADGES.SCHEDULED;
              const start = new Date(a.startTime);
              const end = new Date(a.endTime);
              return (
                <div
                  key={a.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-amber-500/40 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-400">
                        {a.referenceCode}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">{a.title}</h3>
                      {a.service && (
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                          Offering: {a.service.name}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Client:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{a.clientName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Provider:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{a.providerName}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-800">
                        <span className="text-slate-400">Date &amp; Time:</span>
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} •{' '}
                          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({a.durationMinutes}m)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Location:</span>
                        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                          {a.mode === 'VIDEO_CONFERENCE' ? 'Google Meet' : a.location || 'Office Suite'}
                        </span>
                      </div>
                    </div>

                    {a.meetingUrl && (
                      <a
                        href={a.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 w-full justify-center text-xs font-bold rounded-xl bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-200 hover:bg-cyan-100 transition-colors"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join Google Meet</span>
                        <ExternalLink className="w-3 h-3 ml-1 opacity-70" />
                      </a>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => openRescheduleModal(a)}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Reschedule
                    </button>

                    <div className="flex items-center gap-1">
                      {a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleStatusChange(a.id, 'COMPLETED')}
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                          title="Mark as Completed"
                        >
                          Complete
                        </button>
                      )}
                      {a.status !== 'CANCELLED' && a.status !== 'COMPLETED' && (
                        <button
                          onClick={() => setCancellingAppointment(a)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Cancel"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'table' ? (
          /* 2. Booking Table View */
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Ref &amp; Appointment</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Date &amp; Time</th>
                    <th className="py-3 px-4">Mode / Venue</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedAppointments.map((a) => {
                    const statusBadge = STATUS_BADGES[a.status] || STATUS_BADGES.SCHEDULED;
                    const start = new Date(a.startTime);
                    return (
                      <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          <div className="text-[10px] font-mono text-slate-400">{a.referenceCode}</div>
                          <div>{a.title}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{a.clientName}</div>
                          {a.clientPhone && <div className="text-[11px] text-slate-400">{a.clientPhone}</div>}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {a.providerName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          <div className="font-bold text-amber-700 dark:text-amber-300">
                            {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({a.durationMinutes}m)
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            {a.mode === 'VIDEO_CONFERENCE' ? (
                              <Video className="w-3.5 h-3.5 text-cyan-500" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                            <span className="truncate max-w-[130px]">{a.location || 'In-Person'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => openRescheduleModal(a)}
                              className="px-2 py-1 text-[11px] font-semibold rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                            >
                              Reschedule
                            </button>
                            {a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleStatusChange(a.id, 'COMPLETED')}
                                className="px-2 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              >
                                Done
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
        ) : viewMode === 'cards' ? (
          /* 3. Detailed Client Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginatedAppointments.map((a) => {
              const statusBadge = STATUS_BADGES[a.status] || STATUS_BADGES.SCHEDULED;
              const start = new Date(a.startTime);
              return (
                <div
                  key={a.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-slate-400">{a.referenceCode}</span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{a.title}</h3>
                    </div>
                    <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
                      {statusBadge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Client / Member:</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{a.clientName}</p>
                      {a.clientPhone && <p className="text-[11px] text-slate-400">{a.clientPhone}</p>}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Assigned Provider:</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{a.providerName}</p>
                    </div>

                    <div className="col-span-2 pt-2 border-t border-slate-200/50 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Scheduled Date:</span>
                        <p className="font-semibold text-amber-700 dark:text-amber-300">
                          {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at{' '}
                          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({a.durationMinutes}m)
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Location:</span>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">{a.location || 'Office Suite'}</p>
                      </div>
                    </div>
                  </div>

                  {a.notes && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                      Notes: {a.notes}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => openRescheduleModal(a)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                    >
                      Reschedule
                    </button>

                    <div className="flex items-center gap-2">
                      {a.meetingUrl && (
                        <a
                          href={a.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-cyan-600 text-white hover:bg-cyan-700"
                        >
                          Join Meet
                        </a>
                      )}
                      {a.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleStatusChange(a.id, 'COMPLETED')}
                          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 4. Compact Ledger View */
          <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            {paginatedAppointments.map((a) => {
              const statusBadge = STATUS_BADGES[a.status] || STATUS_BADGES.SCHEDULED;
              const start = new Date(a.startTime);
              return (
                <div key={a.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-mono font-bold text-slate-400">{a.referenceCode}</span>
                    <div className="truncate">
                      <span className="text-xs font-bold text-slate-900 dark:text-white mr-2">{a.clientName}</span>
                      <span className="text-[11px] text-slate-400">
                        w/ {a.providerName} • {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${statusBadge.color}`}>
                      {statusBadge.label}
                    </span>
                    <button
                      onClick={() => openRescheduleModal(a)}
                      className="px-2 py-1 text-[10px] font-semibold rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {filteredAppointments.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm text-xs text-slate-500">
            <div>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
              <strong>{Math.min(page * pageSize, filteredAppointments.length)}</strong> of{' '}
              <strong>{filteredAppointments.length}</strong> appointments
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

        {/* Schedule New Appointment Modal (Dark Glassmorphism Theme) */}
        {createModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-[#090d16] text-white border border-slate-800/90 rounded-[2rem] max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-slate-900/50">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/25 shadow-xs">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                      Schedule New Appointment
                    </h3>
                    <p className="text-xs font-medium text-slate-400 mt-0.5">
                      Book 1-on-1 pastoral session, counseling, or executive consultation.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                  title="Close"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateAppointment} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-6 overflow-y-auto space-y-4 flex-1 min-h-0 text-xs">
                  {/* Service Offering & Member */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">
                        Service Offering
                      </label>
                      <select
                        value={formServiceId}
                        onChange={(e) => handleServiceSelect(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      >
                        <option value="">Custom Consultation</option>
                        {servicesList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.durationMinutes}m)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">
                        Existing Member (Optional)
                      </label>
                      <select
                        value={formMemberId}
                        onChange={(e) => handleMemberSelect(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      >
                        <option value="">-- Manual Client Info --</option>
                        {membersList.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.firstName} {m.lastName} ({m.memberCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Client Name */}
                  <div className="space-y-1.5">
                    <label className="font-black uppercase tracking-wider text-slate-400 block">
                      Client Name <span className="text-amber-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formClientName}
                      onChange={(e) => setFormClientName(e.target.value)}
                      placeholder="e.g. Sister Deborah Adeola"
                      required
                      className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                    />
                  </div>

                  {/* Email & Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">Client Email</label>
                      <input
                        type="email"
                        value={formClientEmail}
                        onChange={(e) => setFormClientEmail(e.target.value)}
                        placeholder="client@example.com"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">Client Phone</label>
                      <input
                        type="tel"
                        value={formClientPhone}
                        onChange={(e) => setFormClientPhone(e.target.value)}
                        placeholder="+234..."
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Assigned Provider */}
                  <div className="space-y-1.5">
                    <label className="font-black uppercase tracking-wider text-slate-400 block">
                      Assigned Provider / Staff <span className="text-amber-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formProviderName}
                      onChange={(e) => setFormProviderName(e.target.value)}
                      placeholder="e.g. Glory Eseosa / Pastor in Charge"
                      required
                      className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                    />
                  </div>

                  {/* Date, Time, Duration */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">
                        Date <span className="text-amber-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">
                        Start Time <span className="text-amber-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={formTime}
                        onChange={(e) => setFormTime(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">Duration</label>
                      <select
                        value={formDuration}
                        onChange={(e) => setFormDuration(Number(e.target.value))}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      >
                        <option value={15}>15 Mins</option>
                        <option value={30}>30 Mins</option>
                        <option value={45}>45 Mins</option>
                        <option value={60}>60 Mins (1 Hour)</option>
                        <option value={90}>90 Mins (1.5 Hr)</option>
                        <option value={120}>120 Mins (2 Hr)</option>
                      </select>
                    </div>
                  </div>

                  {/* Mode & Venue */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">Mode</label>
                      <select
                        value={formMode}
                        onChange={(e) => setFormMode(e.target.value as AppointmentMode)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      >
                        <option value="IN_PERSON">🏢 In-Person</option>
                        <option value="VIDEO_CONFERENCE">📹 Online (Google Meet)</option>
                        <option value="PHONE_CALL">📞 Phone Call</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">Venue / Room</label>
                      <input
                        type="text"
                        value={formLocation}
                        onChange={(e) => setFormLocation(e.target.value)}
                        placeholder="e.g. Executive Suite 201"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40 transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <label className="font-black uppercase tracking-wider text-slate-400 block">Session Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Add agenda, counseling background, or preparation notes..."
                      rows={2}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-medium text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40 transition-all resize-none shadow-2xs"
                    />
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? 'Scheduling...' : 'Confirm Appointment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reschedule Modal (Dark Glassmorphism Theme) */}
        {rescheduleModalOpen && selectedAppointment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-[#090d16] text-white border border-slate-800/90 rounded-[2rem] max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/25">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Reschedule: {selectedAppointment.referenceCode}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Client: {selectedAppointment.clientName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRescheduleModalOpen(false)}
                  className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleReschedule} className="p-6 space-y-4 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80">
                  <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block mb-1">
                    Current Scheduled Slot
                  </span>
                  <span className="text-white font-bold text-sm">
                    {new Date(selectedAppointment.startTime).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="font-black uppercase tracking-wider text-slate-400 block">New Date *</label>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-black uppercase tracking-wider text-slate-400 block">New Start Time *</label>
                    <input
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-semibold text-xs focus:ring-2 focus:ring-amber-500/40"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-black uppercase tracking-wider text-slate-400 block">Reason for Rescheduling</label>
                  <input
                    type="text"
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="e.g. Client requested postponement"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-medium text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setRescheduleModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save New Slot'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Cancel Appointment Dialog (Dark Glassmorphism Theme) */}
        {cancellingAppointment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#090d16] text-white border border-slate-800/90 rounded-[2rem] max-w-md w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center border border-rose-500/25">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Cancel Appointment</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{cancellingAppointment.referenceCode}</p>
                  </div>
                </div>
                <button
                  onClick={() => setCancellingAppointment(null)}
                  className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <p className="text-slate-300 leading-relaxed bg-rose-950/30 border border-rose-900/50 p-3.5 rounded-2xl">
                  Are you sure you want to cancel the session for <strong className="text-white">{cancellingAppointment.clientName}</strong>?
                </p>

                <div className="space-y-1.5">
                  <label className="font-black uppercase tracking-wider text-slate-400 block">Cancellation Reason</label>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Client unable to attend"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900 text-white font-medium text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-rose-500/40"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setCancellingAppointment(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-600/25 transition-all cursor-pointer"
                  >
                    Confirm Cancellation
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
