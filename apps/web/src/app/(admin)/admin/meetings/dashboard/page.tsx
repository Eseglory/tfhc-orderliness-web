'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  FileText,
  Download,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building2,
  Lock,
  ChevronRight,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';
import { useToast } from '../../../../../components/ui';

interface MeetingAgendaItem {
  id: string;
  orderNumber: number;
  title: string;
  durationMinutes: number;
  voteScheduled?: boolean;
  voteAmount?: string;
  presenterName?: string;
}

interface MeetingSessionItem {
  id: string;
  sessionCode: string;
  title: string;
  type: string;
  status: string;
  timeRange: string;
  dateLabel: string;
  venue: string;
  venueCapacity?: number;
  sessionChair: string;
  chairRole?: string;
  attendeesConfirmed: number;
  attendeesTotal: number;
  confidential?: boolean;
  agendaHighlights: { title: string; duration: string }[];
  attachments: { name: string; type: string }[];
  timedOrderOfBusiness?: MeetingAgendaItem[];
}

export default function MeetingsDashboardPage() {
  const { user } = useAuth();
  const { notify } = useToast();

  const [activeView, setActiveView] = useState<'agenda' | 'calendar' | 'minutes'>('agenda');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedVenue, setSelectedVenue] = useState('ALL');
  const [sessions, setSessions] = useState<MeetingSessionItem[]>([]);
  const [selectedFocusSession, setSelectedFocusSession] = useState<MeetingSessionItem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeetings = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<any[]>('/meetings');
      const mapped: MeetingSessionItem[] = (data || []).map((m) => {
        const startDate = new Date(m.date || m.startTime || Date.now());
        const endDate = new Date(m.endTime || Date.now() + 3600000);
        return {
          id: m.id,
          sessionCode: `Session #${m.id.slice(0, 8).toUpperCase()}`,
          title: m.title || 'Operations Session',
          type: m.category?.name || 'Executive Sync',
          status:
            m.status === 'ACTIVE'
              ? 'Active In-Progress'
              : m.status === 'CLOSED'
                ? 'Minutes Approved & Archived'
                : 'Agenda Finalized',
          timeRange: `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          dateLabel: startDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
          venue: m.locationName || m.venue || 'Corporate Headquarters / Main Auditorium',
          venueCapacity: m.venueCapacity || 200,
          sessionChair: m.organizerName || m.speaker || m.coordinator || 'Executive Leadership',
          chairRole: 'Chairperson / Lead',
          attendeesConfirmed: m._count?.attendanceRecords || m.attendanceCount || 0,
          attendeesTotal: m.targetAttendees || m._count?.attendanceRecords || 0,
          confidential: false,
          agendaHighlights: m.description
            ? [{ title: m.description, duration: '60m' }]
            : [
                { title: '1. Welcome & Executive Briefing', duration: '15m' },
                { title: '2. Operational Review & Key Metrics', duration: '30m' },
                { title: '3. Action Items & Next Steps', duration: '15m' },
              ],
          attachments: [],
          timedOrderOfBusiness: [
            { id: '1', orderNumber: 1, title: 'Welcome & Executive Briefing', durationMinutes: 15 },
            { id: '2', orderNumber: 2, title: 'Operational Review & Key Metrics', durationMinutes: 30 },
            { id: '3', orderNumber: 3, title: 'Action Items & Next Steps', durationMinutes: 15 },
          ],
        };
      });

      setSessions(mapped);
      if (mapped.length > 0) {
        setSelectedFocusSession(mapped[0]);
      } else {
        setSelectedFocusSession(null);
      }
    } catch (e) {
      console.error('Failed to load meetings', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, []);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchSearch =
        !searchQuery ||
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sessionChair.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.venue.toLowerCase().includes(searchQuery.toLowerCase());
      const matchType = selectedType === 'ALL' || s.type === selectedType;
      const matchStatus = selectedStatus === 'ALL' || s.status === selectedStatus;
      const matchVenue = selectedVenue === 'ALL' || s.venue.toLowerCase().includes(selectedVenue.toLowerCase());
      return matchSearch && matchType && matchStatus && matchVenue;
    });
  }, [sessions, searchQuery, selectedType, selectedStatus, selectedVenue]);

  const handleExportMinutes = () => {
    if (sessions.length === 0) {
      notify('No meeting minutes available to export.', 'info');
      return;
    }
    const headers = ['Code', 'Title', 'Chair', 'Venue', 'Time', 'Status'];
    const rows = sessions.map((s) => [
      `"${s.sessionCode}"`,
      `"${s.title}"`,
      `"${s.sessionChair}"`,
      `"${s.venue}"`,
      `"${s.timeRange}"`,
      `"${s.status}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const a = document.createElement('a');
    a.setAttribute('href', encoded);
    a.setAttribute('download', `Meetings_Agendas_Minutes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    notify('Executive meeting minutes and agendas exported.', 'success');
  };

  const handleCalendarSync = () => {
    loadMeetings();
    notify('Meeting schedule refreshed from database.', 'success');
  };

  return (
    <AdminLayoutShell activeHref="/admin/events">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              CHURCH OPERATIONS / THE FATHER&apos;S HOUSE CHURCH
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Meetings &amp; Agendas
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Coordinate service agendas, team councils, department meetings, room reservations, and attendance minutes.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportMinutes}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Minutes</span>
            </button>

            <button
              onClick={handleCalendarSync}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Sync</span>
            </button>

            <Link
              href="/admin/meetings"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Meeting</span>
            </Link>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  TOTAL MEETINGS
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <CalendarIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {sessions.length}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Sessions Recorded
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
              Live database records
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  ACTIVE SESSIONS
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {sessions.filter((s) => s.status.includes('Active')).length}
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  In Progress
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
              Real-time attendance check-in active
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  COMPLETED SESSIONS
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FileCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {sessions.filter((s) => s.status.includes('Archived')).length}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Archived
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
              Minutes &amp; attendance finalized
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  ATTENDANCE RECORDED
                </span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {sessions.reduce((acc, s) => acc + s.attendeesConfirmed, 0)}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Attendees
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
              Across all recorded sessions
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search meetings by title, leader, or venue…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active In-Progress">Active</option>
              <option value="Agenda Finalized">Finalized</option>
              <option value="Minutes Approved & Archived">Archived</option>
            </select>
          </div>
        </div>

        {/* Meeting list or Empty State */}
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading meetings from database…
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-12 text-center">
            <CalendarIcon className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">No meetings recorded</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Schedule your first worship service, prayer meeting, or leadership council to begin tracking agendas and attendance.
            </p>
            <div className="mt-5">
              <Link
                href="/admin/events?action=create"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                <span>Create New Meeting</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sessions List (5 cols) */}
            <div className="lg:col-span-5 space-y-3">
              {filteredSessions.map((session) => {
                const isSelected = selectedFocusSession?.id === session.id;
                return (
                  <button
                    key={session.id}
                    onClick={() => setSelectedFocusSession(session)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        {session.sessionCode}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {session.status}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                      {session.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{session.dateLabel} • {session.timeRange}</span>
                    </p>
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 truncate max-w-[200px]">
                        <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{session.venue}</span>
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {session.attendeesConfirmed} attendees
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Session Detail View (7 cols) */}
            <div className="lg:col-span-7">
              {selectedFocusSession ? (
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        {selectedFocusSession.type}
                      </span>
                      <h2 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                        {selectedFocusSession.title}
                      </h2>
                    </div>
                    <Link
                      href={`/admin/events`}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                    >
                      Open Event
                    </Link>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium">Date &amp; Time</span>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedFocusSession.dateLabel}</p>
                      <p className="text-slate-500 dark:text-slate-400">{selectedFocusSession.timeRange}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Venue</span>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedFocusSession.venue}</p>
                      <p className="text-slate-500 dark:text-slate-400">Capacity: {selectedFocusSession.venueCapacity}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Chair / Leader</span>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedFocusSession.sessionChair}</p>
                      <p className="text-slate-500 dark:text-slate-400">{selectedFocusSession.chairRole}</p>
                    </div>
                  </div>

                  {/* Agenda Outline */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Order of Business &amp; Agenda
                    </h3>
                    <div className="space-y-2">
                      {selectedFocusSession.timedOrderOfBusiness?.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-[10px]">
                              {item.orderNumber}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">{item.title}</span>
                          </div>
                          <span className="text-slate-400 font-medium">{item.durationMinutes} mins</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
