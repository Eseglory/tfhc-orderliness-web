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
  ChevronDown,
  Building2,
  Video,
  ExternalLink,
  Lock,
  Sparkles,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Phone,
  Bookmark,
  ChevronRight,
  Check,
  Radio,
  FileCheck,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

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
  type: 'Governing Board' | 'Pastoral Staff' | 'Finance Committee' | 'Ministry Leads' | string;
  status: 'Quorum Confirmed' | 'Agenda Finalized' | 'Requires Resolution Vote' | 'Minutes Approved & Archived' | string;
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

const SAMPLE_SESSIONS: MeetingSessionItem[] = [
  {
    id: 'gb-2026-11',
    sessionCode: 'Session #GB-2026-11',
    title: 'Deacons Council & Benevolence Review',
    type: 'Governing Board',
    status: 'Quorum Confirmed',
    timeRange: 'Today, 2:00 PM – 3:30 PM (Starts in 2h 14m)',
    dateLabel: 'Today, 2:00 PM',
    venue: 'Conference Room A (Hybrid • Zoom #849-201)',
    venueCapacity: 20,
    sessionChair: 'Rev. Marcus Sterling',
    chairRole: 'Governing Board Chairman',
    attendeesConfirmed: 12,
    attendeesTotal: 14,
    confidential: true,
    agendaHighlights: [
      { title: '1. Opening Prayer & Scripture Reflection', duration: '10m' },
      { title: '2. Q4 Emergency Benevolence Fund ($14.2k)', duration: '25m' },
      { title: '3. Winter Shelter Logistics & Volunteers', duration: '30m' },
      { title: '4. Pastoral Care Home Visits Roster review', duration: '15m' },
    ],
    attachments: [
      { name: 'Agenda_Packet_v2.pdf', type: 'pdf' },
      { name: 'Benevolence_Nov.xlsx', type: 'excel' },
      { name: 'Executive Minutes Draft', type: 'doc' },
    ],
    timedOrderOfBusiness: [
      { id: '1', orderNumber: 1, title: 'Call to Order & Devotion', durationMinutes: 10 },
      { id: '2', orderNumber: 2, title: 'Benevolence Approvals Vote Scheduled ($14.2k)', durationMinutes: 25, voteScheduled: true, voteAmount: '$14.2k' },
      { id: '3', orderNumber: 3, title: 'Winter Outreach Campaign', durationMinutes: 20 },
      { id: '4', orderNumber: 4, title: 'Pastoral Care Visitation Roster', durationMinutes: 15 },
      { id: '5', orderNumber: 5, title: 'Closing Benediction', durationMinutes: 10 },
    ],
  },
  {
    id: 'ps-44',
    sessionCode: 'Synod #PS-44',
    title: 'Pastoral Staff & Worship Synergy Synod',
    type: 'Pastoral Staff',
    status: 'Agenda Finalized',
    timeRange: 'Tomorrow, Nov 11 • 9:00 AM – 10:30 AM',
    dateLabel: 'Tomorrow, Nov 11',
    venue: 'Pastoral Suite & Upper Library',
    venueCapacity: 16,
    sessionChair: 'Pastor David Chen (Lead Admin)',
    chairRole: 'Senior Pastor',
    attendeesConfirmed: 8,
    attendeesTotal: 8,
    confidential: false,
    agendaHighlights: [
      { title: 'Advent 2026 Sermon Series Theme & Scripture Sync', duration: '20m' },
      { title: 'Sanctuary Live Sound & Broadcast Audio Upgrades', duration: '25m' },
      { title: 'Guest Preacher Protocol & Hospitality', duration: '15m' },
    ],
    attachments: [{ name: 'Run_of_Service_AdventDraft.pdf', type: 'pdf' }],
  },
  {
    id: 'fc-88',
    sessionCode: 'Session #FC-88',
    title: 'Stewardship & Building Campaign Taskforce',
    type: 'Finance Committee',
    status: 'Requires Resolution Vote',
    timeRange: 'Thu, Nov 12 • 6:00 PM – 7:30 PM',
    dateLabel: 'Thu, Nov 12',
    venue: 'Fellowship Hall Room 204',
    venueCapacity: 35,
    sessionChair: 'Elder Samuel Osei (SO)',
    chairRole: 'Finance Chair',
    attendeesConfirmed: 9,
    attendeesTotal: 10,
    confidential: true,
    agendaHighlights: [
      { title: 'Sanctuary Roof Repair Bids ($86,500)', duration: '30m' },
      { title: 'Endowment Portfolio Q3 Performance Review', duration: '20m' },
      { title: 'Capital Pledge Follow-up Strategy', duration: '20m' },
    ],
    attachments: [{ name: 'Roof_Bids_Comparison.pdf', type: 'pdf' }, { name: 'Q3_Pledge_Ledger.xlsx', type: 'excel' }],
  },
  {
    id: 'ym-12',
    sessionCode: 'Council #YM-12',
    title: 'Youth Ministry Council & Safety Compliance',
    type: 'Ministry Leads',
    status: 'Minutes Approved & Archived',
    timeRange: 'Mon, Nov 09 • Concluded',
    dateLabel: 'Mon, Nov 09',
    venue: 'Youth Hall Room 102',
    venueCapacity: 30,
    sessionChair: 'Pastor Sarah Jenkins',
    chairRole: 'Youth Director',
    attendeesConfirmed: 6,
    attendeesTotal: 6,
    confidential: false,
    agendaHighlights: [
      { title: 'Youth Winter Camp Registration Quotas', duration: '15m' },
      { title: 'Chaperone Background Verification Audit', duration: '20m' },
    ],
    attachments: [{ name: 'Youth_Camp_Budget.pdf', type: 'pdf' }],
  },
];

export default function MeetingsDashboardPage() {
  const { user } = useAuth();

  const [activeView, setActiveView] = useState<'agenda' | 'calendar' | 'minutes'>('agenda');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedVenue, setSelectedVenue] = useState('ALL');
  const [selectedFocusSession, setSelectedFocusSession] = useState<MeetingSessionItem>(SAMPLE_SESSIONS[0]);
  const [loading, setLoading] = useState(false);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return SAMPLE_SESSIONS.filter((s) => {
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
  }, [searchQuery, selectedType, selectedStatus, selectedVenue]);

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              CHURCH OPERATIONS / GRACE CATHEDRAL CAMPUS
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Meetings & Agendas Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Coordinate governing board sessions, pastoral staff synods, ministry council agendas, room reservations, and confidential executive minutes.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-colors">
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Minutes</span>
            </button>

            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Calendar Sync</span>
            </button>

            <Link
              href="/admin/meetings?action=create"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-indigo-600/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule New Meeting</span>
            </Link>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. UPCOMING THIS WEEK */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  UPCOMING THIS WEEK
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <CalendarIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  6
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Sessions
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Next: Deacon Board in 2h
              </span>
              <span>3 Pastoral • 2 Board</span>
            </div>
          </div>

          {/* 2. QUORUM READINESS */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  QUORUM READINESS
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  94.8%
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  +2.4%
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
              Avg. voting member attendance
            </div>
          </div>

          {/* 3. ACTION ITEMS & RESOLUTIONS */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  ACTION ITEMS & RESOLUTIONS
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FileCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  19
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Pending
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex items-center justify-between">
              <span className="text-rose-600 dark:text-rose-400 font-bold">5 High Priority</span>
              <span className="text-slate-400">7 resolved this sprint</span>
            </div>
          </div>

          {/* 4. VENUE UTILIZATION */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  VENUE UTILIZATION
                </span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  78.2%
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
              Chapel &amp; Conf. Room A near peak
            </div>
          </div>
        </div>

        {/* Filter Bar & View Mode Toggle */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          {/* Search Input */}
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search meetings by session, chair, agenda..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Filter Selects */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Types</option>
              <option value="Governing Board">Governing Board</option>
              <option value="Pastoral Staff">Pastoral Staff</option>
              <option value="Finance Committee">Finance Committee</option>
              <option value="Ministry Leads">Ministry Leads</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Statuses</option>
              <option value="Quorum Confirmed">Quorum Confirmed</option>
              <option value="Agenda Finalized">Agenda Finalized</option>
              <option value="Requires Resolution Vote">Requires Resolution Vote</option>
              <option value="Minutes Approved & Archived">Minutes Approved</option>
            </select>

            <select
              value={selectedVenue}
              onChange={(e) => setSelectedVenue(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Venues</option>
              <option value="Conference Room A">Conference Room A</option>
              <option value="Pastoral Suite">Pastoral Suite</option>
              <option value="Fellowship Hall">Fellowship Hall 204</option>
              <option value="Youth Hall">Youth Hall 102</option>
            </select>
          </div>

          {/* View Mode Pills */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-stretch sm:self-auto justify-center">
            <button
              onClick={() => setActiveView('agenda')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                activeView === 'agenda'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Agenda View</span>
            </button>
            <button
              onClick={() => setActiveView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                activeView === 'calendar'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setActiveView('minutes')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                activeView === 'minutes'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Minutes</span>
            </button>
          </div>
        </div>

        {/* Main 2-Column Dashboard Layout (2/3 Left List, 1/3 Right Sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2/3: Meeting Session Cards List */}
          <div className="lg:col-span-2 space-y-4">
            {filteredSessions.map((s) => {
              const isSelected = selectedFocusSession.id === s.id;
              const quorumPct = Math.round((s.attendeesConfirmed / s.attendeesTotal) * 100);

              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedFocusSession(s)}
                  className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                      : 'border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-xs'
                  }`}
                >
                  {/* Card Header Tags & Action */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {s.type}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                          s.status.includes('Confirmed') || s.status.includes('Approved')
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200/60'
                            : s.status.includes('Requires')
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200/60'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200/60'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {s.status}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{s.sessionCode}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {s.timeRange.includes('Starts in') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            alert('Connecting to Hybrid Board Session Zoom Room #849-201...');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Join Call</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title & Time/Venue */}
                  <div className="mt-3">
                    <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">
                      {s.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        {s.timeRange}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {s.venue}
                      </span>
                    </div>
                  </div>

                  {/* Chair & Attendance / Quorum Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        SESSION CHAIR
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-6 h-6 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">
                          {s.sessionChair.split(' ')[1]?.[0] || 'M'}
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">{s.sessionChair}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        ATTENDANCE &amp; QUORUM
                      </span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {s.attendeesConfirmed} / {s.attendeesTotal} Confirmed ({quorumPct}%)
                        </span>
                        <div className="flex -space-x-1.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                            EV
                          </span>
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                            TH
                          </span>
                          <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                            AL
                          </span>
                          <span className="w-5 h-5 rounded-full bg-slate-400 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                            +9
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Agenda Highlights */}
                  <div className="mt-4 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      AGENDA HIGHLIGHTS
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {s.agendaHighlights.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60"
                        >
                          <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                            {item.title}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                            {item.duration}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Attachments & Card Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.attachments.map((att, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          <FileText className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[140px]">{att.name}</span>
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFocusSession(s);
                        }}
                        className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors"
                      >
                        View Agenda &amp; Minutes
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Editing session ${s.sessionCode}`);
                        }}
                        className="px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 1/3: Focus Agenda, Action Items & Room Availability */}
          <div className="space-y-6">
            {/* 1. FOCUS AGENDA PANEL */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    FOCUS AGENDA
                  </span>
                </div>
                {selectedFocusSession.confidential && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                    Confidential Session
                  </span>
                )}
              </div>

              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  {selectedFocusSession.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Scheduled Runtime: 90 minutes
                </p>
              </div>

              {/* Quorum Progress Box */}
              <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-950 dark:text-indigo-200 mb-1">
                  <span>Voting Quorum: {selectedFocusSession.attendeesConfirmed} / {selectedFocusSession.attendeesTotal}</span>
                  <span>{Math.round((selectedFocusSession.attendeesConfirmed / selectedFocusSession.attendeesTotal) * 100)}%</span>
                </div>
                <p className="text-[10px] text-indigo-700/80 dark:text-indigo-400">Exceeds 60% requirement</p>
              </div>

              {/* Timed Order of Business */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  TIMED ORDER OF BUSINESS
                </p>
                <div className="space-y-1.5 text-xs">
                  {(selectedFocusSession.timedOrderOfBusiness || [
                    { id: '1', orderNumber: 1, title: 'Call to Order & Devotion', durationMinutes: 10 },
                    { id: '2', orderNumber: 2, title: 'Agenda Review & Adoption', durationMinutes: 15 },
                    { id: '3', orderNumber: 3, title: 'Pastoral & Operational Matters', durationMinutes: 30 },
                    { id: '4', orderNumber: 4, title: 'Resolutions & Closing Prayer', durationMinutes: 15 },
                  ]).map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {item.orderNumber}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                            {item.title}
                          </p>
                          {item.voteScheduled && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                              Vote Scheduled ({item.voteAmount})
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {item.durationMinutes}m
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => alert(`Launching in-meeting executive mode for ${selectedFocusSession.title}`)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-600/20 transition-all active:scale-95"
                >
                  Launch In-Meeting Mode
                </button>
                <button
                  onClick={() => alert('Downloading complete briefing packet (.PDF)...')}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors"
                >
                  Download Briefing Packet
                </button>
              </div>
            </div>

            {/* 2. ACTION ITEMS & RESOLUTIONS */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Action Items &amp; Resolutions
                </h3>
                <span className="text-[11px] text-slate-400">4 of 19 Shown</span>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  {
                    task: 'Finalize $14.2k benevolence check sign-offs',
                    due: 'Due Nov 12',
                    role: 'Governing Board',
                    assignee: 'Rev. Marcus Sterling',
                  },
                  {
                    task: 'Distribute updated child protection policies',
                    due: 'Due Nov 15',
                    role: 'Youth Council',
                    assignee: 'Pastor Sarah Jenkins',
                  },
                  {
                    task: 'Sign acoustic vendor contract for main sanctuary',
                    due: 'Due Nov 14',
                    role: 'Finance Taskforce',
                    assignee: 'Pastor David Chen',
                  },
                  {
                    task: 'Compile Advent Choir rehearsal availability',
                    due: 'Due Nov 18',
                    role: 'Pastoral Synod',
                    assignee: 'Worship Director',
                  },
                ].map((act, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        {act.task}
                      </p>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 shrink-0">
                        {act.due}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                      <span>Assigned: {act.assignee}</span>
                      <span className="font-medium text-slate-500">{act.role}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => alert('Opening full resolutions & signatures index...')}
                className="w-full text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
              >
                View All 19 Resolutions &amp; Signatures →
              </button>
            </div>

            {/* 3. CAMPUS ROOM AVAILABILITY */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Campus Room Availability
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Live Status
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  { name: 'Conference Room A', cap: 'Cap: 20 • Smart AV Hybrid', status: 'Booked 2:00–4:00 PM', booked: true },
                  { name: 'Historic Chapel', cap: 'Cap: 80 • Pipe Organ Suite', status: 'Available All Day', booked: false },
                  { name: 'Fellowship Hall 204', cap: 'Cap: 35 • Modular Tables', status: 'Booked 6:00–8:00 PM', booked: true },
                  { name: 'Pastoral Library', cap: 'Cap: 12 • Executive Board', status: 'Available Until 5 PM', booked: false },
                ].map((room, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{room.name}</p>
                      <p className="text-[10px] text-slate-400">{room.cap}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        room.booked
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                          : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400'
                      }`}
                    >
                      {room.status}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => alert('Opening Campus Facilities Reservation Booking Drawer...')}
                className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
              >
                Reserve Meeting Space
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
