'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Download,
  FileText,
  Lock,
  ChevronRight,
  Sparkles,
  MapPin,
  HeartHandshake,
  Phone,
  Video,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  UserCheck,
  Send,
  SlidersHorizontal,
  FileCheck,
  Check,
  Edit,
  ArrowUpRight,
  Activity,
  Heart,
  BookOpen,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { useAuth } from '../../../../lib/auth';

interface AppointmentSession {
  id: string;
  timeRange: string;
  durationLabel: string;
  status: 'Completed' | 'In-Session Now' | 'Priority Care' | 'Virtual Tele-Care' | 'Pending Intake';
  categoryHeader: string;
  title: string;
  badgeLabel: string;
  badgeColor: string;
  congregantName: string;
  congregantId: string;
  congregantDetail?: string;
  pastorName: string;
  pastorRole: string;
  pastorLocation: string;
  notes: string;
  tags: { label: string; action?: boolean }[];
  actions: { label: string; primary?: boolean; link?: string; onClick?: () => void }[];
  remainingTimeBanner?: string;
  virtualLink?: string;
  urgentNote?: string;
}

const APPOINTMENT_SESSIONS: AppointmentSession[] = [
  {
    id: 'apt-1',
    timeRange: '09:00 – 10:00 AM',
    durationLabel: '60 Minutes',
    status: 'Completed',
    categoryHeader: 'PREMARITAL MENTORSHIP • MODULE 4 OF 6',
    title: 'Covenant Foundations & Communication Styles',
    badgeLabel: 'Clergy Restricted',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    congregantName: 'David & Hannah Miller',
    congregantId: '#ORD-3174',
    pastorName: 'Pastor David Chen',
    pastorRole: 'Lead Pastor',
    pastorLocation: 'Suite 101',
    notes:
      'Review completed on Myers-Briggs conflict triggers. Prescribed couple covenant homework in Pastoral Study Workbook Chapter 5. Session 5 confirmed for next Thursday.',
    tags: [{ label: 'Encrypted Session Notes Vaulted' }],
    actions: [
      { label: 'View Notes' },
      { label: 'Summary Sheet' },
    ],
  },
  {
    id: 'apt-2',
    timeRange: '11:00 AM – 12:00 PM',
    durationLabel: 'Active 42 min elapsed',
    status: 'In-Session Now',
    categoryHeader: 'SPIRITUAL FORMATION • DISCERNMENT',
    title: 'Vocational Calling & Sabbatical Discernment',
    badgeLabel: 'Historic Chapel Prayer Room',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    congregantName: 'Sister Grace Lawson',
    congregantId: '#ORD-1682',
    congregantDetail: 'Deaconess',
    pastorName: 'Pastor Sarah Jenkins',
    pastorRole: 'Associate Pastor, Spiritual Life',
    pastorLocation: 'Historic Chapel Nave',
    notes:
      'Focus on ministry transition, emotional health, and contemplative prayer rhythm.',
    remainingTimeBanner: '18 minutes remaining in booked block',
    tags: [],
    actions: [
      { label: 'Extend +15m' },
      { label: 'Add Care Record', primary: true },
    ],
  },
  {
    id: 'apt-3',
    timeRange: '02:00 – 03:00 PM',
    durationLabel: 'Up Next (2h 45m)',
    status: 'Priority Care',
    categoryHeader: 'FAMILY CRISIS • BEREAVEMENT CARE',
    title: 'Grief Support & Benevolence After-Care',
    badgeLabel: 'Urgent Pastoral Attention',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    congregantName: 'Robert & Clara Vance',
    congregantId: '#ORD-0925',
    pastorName: 'Pastor David & Elder Samuel Osei',
    pastorRole: 'Co-Shepherding',
    pastorLocation: 'Suite 3',
    notes:
      'Pastoral Directive: Follow-up following ICU release of child. Deacons Benevolence Committee approved $500 emergency grocery support stipend.',
    tags: [{ label: 'Consultation Room B (Soundproofed)' }],
    actions: [
      { label: 'Review Intake History' },
      { label: 'Check-in Family', primary: true },
    ],
  },
  {
    id: 'apt-4',
    timeRange: '03:30 – 04:30 PM',
    durationLabel: 'Virtual Tele-Care',
    status: 'Virtual Tele-Care',
    categoryHeader: 'LEADERSHIP SHEPHERDING',
    title: 'Elder Mentorship & Ministry Stewardship',
    badgeLabel: 'Encrypted Stream L4',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    congregantName: 'Elder Marcus Sterling',
    congregantId: '#ORD-2041',
    congregantDetail: 'Finance Chair',
    pastorName: 'Pastor David Chen',
    pastorRole: 'Executive Lead Room',
    pastorLocation: 'Executive Suite',
    notes:
      'Annual leadership development milestone. Reviewing committee burnout indicators and stewardship cadence for upcoming capital campaign.',
    virtualLink: 'telecare.ordaliness.org/room/ch-8821',
    tags: [],
    actions: [
      { label: 'Edit Slot' },
      { label: 'Launch Tele-Care Link', primary: true },
    ],
  },
  {
    id: 'apt-5',
    timeRange: '05:00 – 06:00 PM',
    durationLabel: 'Evening Slot',
    status: 'Pending Intake',
    categoryHeader: 'BAPTISM • YOUTH & FAMILY INQUIRY',
    title: 'Baptism & Youth Profession of Faith Orientation',
    badgeLabel: 'Family Ministry Office',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    congregantName: 'Lucas Vance & Parents',
    congregantId: '#ORD-4318',
    pastorName: 'Pastor Sarah Jenkins',
    pastorRole: 'Family Discipleship Suite',
    pastorLocation: 'Youth Wing',
    notes:
      'Orientation for fireside immersion baptism. Pending parent consent document upload on mobile portal.',
    urgentNote: 'SMS Reminder queued for 3:30 PM',
    tags: [],
    actions: [
      { label: 'Resend Link' },
      { label: 'Confirm Booking', primary: true },
    ],
  },
];

export default function AppointmentsPastoralCarePage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPastor, setSelectedPastor] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedRoom, setSelectedRoom] = useState('All');
  const [viewType, setViewType] = useState<'day' | 'week' | 'registry' | 'availability'>('day');

  const filteredSessions = useMemo(() => {
    return APPOINTMENT_SESSIONS.filter((session) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          session.title.toLowerCase().includes(q) ||
          session.congregantName.toLowerCase().includes(q) ||
          session.pastorName.toLowerCase().includes(q) ||
          session.congregantId.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedPastor !== 'All' && !session.pastorName.includes(selectedPastor)) {
        return false;
      }
      if (selectedStatus !== 'All' && session.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [searchQuery, selectedPastor, selectedStatus]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>CHURCH OPERATIONS</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">GRACE CATHEDRAL CAMPUS</span>
              <span>/</span>
              <span>PASTORAL APPOINTMENTS &amp; COUNSELING</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Appointments &amp; Pastoral Care Scheduling
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                STRICTLY CONFIDENTIAL
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              <span>Encrypted Clergy Vault: Active (HIPAA / RCCP Level 4)</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm">
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Sync Calendar
            </button>
            <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm">
              <Download className="w-3.5 h-3.5 text-slate-400" />
              Export Day PDF
            </button>
            <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all">
              <Plus className="w-4 h-4" />
              Book New Appointment
            </button>
          </div>
        </div>

        {/* 4 KPI Scorecard Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TODAY&apos;S SESSIONS
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                On Schedule
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">7 Confirmed</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>3 Completed • 4 Upcoming</span>
              <span className="font-bold text-emerald-600">100% In-Person</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                PASTORAL AVAILABILITY
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                High Utilization
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">84.5%</span>
              <span className="text-xs font-bold text-slate-400">Slotted</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>4 Clergy Active Today</span>
              <span className="font-bold text-indigo-600">2 Open Slots</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                WEEKLY MODALITIES
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                Privileged 14
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">18 Sessions</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>10 Pastoral • 5 Premarital • 3 Crisis</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                FOLLOW-UP ADHERENCE
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Compliant
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">96.2%</span>
              <span className="text-xs font-bold text-emerald-600">+3.4% MoM</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>2 overdue pastoral follow-ups</span>
            </div>
          </div>
        </div>

        {/* Filter Bar & Schedule View Switcher */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search congregant, pastor, session #... (⌘K)"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Date and View Selectors */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200">
                <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Today • Thursday, Nov 12, 2026</span>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {[
                  { key: 'day', label: 'Day Schedule' },
                  { key: 'week', label: 'Weekly Roster' },
                  { key: 'registry', label: 'Registry' },
                  { key: 'availability', label: 'Availability' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setViewType(t.key as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      viewType === t.key
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary Dropdown Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedPastor}
                onChange={(e) => setSelectedPastor(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="All">Pastor: All Pastors &amp; Elders (4)</option>
                <option value="David Chen">Pastor David Chen</option>
                <option value="Sarah Jenkins">Pastor Sarah Jenkins</option>
                <option value="Samuel Osei">Elder Samuel Osei</option>
                <option value="Julian Vance">Dr. Julian Vance</option>
              </select>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="All">Modality: All Care Categories</option>
                <option value="Premarital">Premarital Mentorship</option>
                <option value="Spiritual">Spiritual Formation</option>
                <option value="Crisis">Crisis &amp; Bereavement</option>
                <option value="Leadership">Leadership Shepherding</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="All">Status: All Session States</option>
                <option value="Completed">Completed</option>
                <option value="In-Session Now">In-Session Now</option>
                <option value="Priority Care">Priority Care</option>
                <option value="Virtual Tele-Care">Virtual Tele-Care</option>
                <option value="Pending Intake">Pending Intake</option>
              </select>

              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="All">Room / Venue: All Locations &amp; Channels</option>
                <option value="Suite 101">Suite 101</option>
                <option value="Historic Chapel">Historic Chapel</option>
                <option value="Suite 3">Suite 3</option>
                <option value="Virtual">Virtual Tele-Care</option>
              </select>
            </div>

            {(searchQuery || selectedPastor !== 'All' || selectedCategory !== 'All' || selectedStatus !== 'All' || selectedRoom !== 'All') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedPastor('All');
                  setSelectedCategory('All');
                  setSelectedStatus('All');
                  setSelectedRoom('All');
                }}
                className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Master 2-Column Content Grid: 2/3 Left & 1/3 Right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT 2/3 COLUMN: Active Daily Counseling Roster */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  Active Daily Counseling Roster
                </h3>
                <span className="text-xs text-slate-400">
                  {filteredSessions.length} Records Displayed • Completed • Active Now • Upcoming
                </span>
              </div>
            </div>

            {/* Session Cards Feed */}
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 transition-all hover:border-indigo-200 dark:hover:border-indigo-800"
              >
                {/* Header Row: Time, Status, Modality, Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white text-sm">
                      <Clock className="w-4 h-4 text-indigo-600" />
                      <span>{session.timeRange}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">({session.durationLabel})</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        session.status === 'Completed'
                          ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          : session.status === 'In-Session Now'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse'
                          : session.status === 'Priority Care'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : session.status === 'Virtual Tele-Care'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${session.badgeColor}`}>
                    {session.badgeLabel}
                  </span>
                </div>

                {/* Modality Category Title & Main Title */}
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                    {session.categoryHeader}
                  </span>
                  <h4 className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {session.title}
                  </h4>
                </div>

                {/* Two-Column Congregant & Pastor Identity Blocks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-black text-xs shrink-0">
                      {session.congregantName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h5 className="text-xs font-black text-slate-900 dark:text-white">
                        {session.congregantName}
                      </h5>
                      <p className="text-[10px] text-slate-500">
                        Congregant ID: <strong>{session.congregantId}</strong>
                        {session.congregantDetail && <span> • {session.congregantDetail}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-200/80 dark:border-slate-800 pt-2 sm:pt-0 sm:pl-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black text-xs shrink-0">
                      {session.pastorName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <h5 className="text-xs font-black text-slate-900 dark:text-white">
                        {session.pastorName}
                      </h5>
                      <p className="text-[10px] text-slate-500">
                        {session.pastorRole} • {session.pastorLocation}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Session Notes & Details */}
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                  {session.notes}
                </p>

                {/* Remaining Time Banner or Urgent Tag */}
                {session.remainingTimeBanner && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span className="font-bold">{session.remainingTimeBanner}</span>
                  </div>
                )}

                {session.urgentNote && (
                  <div className="bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                    <span className="font-bold">{session.urgentNote}</span>
                  </div>
                )}

                {session.virtualLink && (
                  <div className="bg-purple-50 dark:bg-purple-950/40 p-2.5 rounded-xl border border-purple-200 dark:border-purple-800 text-xs font-mono text-purple-800 dark:text-purple-300 flex items-center gap-2">
                    <Video className="w-3.5 h-3.5 text-purple-600" />
                    <span>{session.virtualLink}</span>
                  </div>
                )}

                {/* Footer Tags and Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    {session.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        <span>{tag.label}</span>
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {session.actions.map((act, idx) => (
                      <button
                        key={idx}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          act.primary
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT 1/3 COLUMN */}
          <div className="space-y-6">
            {/* 1. Clergy On-Duty Today */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Clergy On-Duty Today</h3>
                  <span className="text-[10px] text-slate-400">Nov 12 • 4 Rostered</span>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  {
                    name: 'Pastor David Chen',
                    role: 'Lead Pastor',
                    status: 'Available',
                    statusColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                    schedule: 'Office: 1:00 PM – 5:30 PM (2 of 4 Slots Booked)',
                  },
                  {
                    name: 'Pastor Sarah Jenkins',
                    role: 'Associate Pastor',
                    status: 'In Session',
                    statusColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
                    schedule: 'Office: 10:00 AM – 4:00 PM (3 of 5 Slots Booked)',
                  },
                  {
                    name: 'Elder Samuel Osei',
                    role: 'Hospital & Home Visitation',
                    status: 'On-Call Offsite',
                    statusColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                    schedule: 'Visitation: Grace Memorial & Home (2 Urgent Dispatches)',
                  },
                  {
                    name: 'Dr. Julian Vance, LMFT',
                    role: 'Clinical Pastoral Affiliate',
                    status: 'Referral Only',
                    statusColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                    schedule: 'Thursdays: By Special Appointment (Next: 10:00 AM)',
                  },
                ].map((clergy, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white">{clergy.name}</h4>
                        <p className="text-[10px] text-slate-400">{clergy.role}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${clergy.statusColor}`}>
                        {clergy.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      {clergy.schedule}
                    </p>
                  </div>
                ))}

                <button className="w-full py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/80 transition-colors">
                  Configure Pastoral Office Hours
                </button>
              </div>
            </div>

            {/* 2. Care Intake Queue */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Care Intake Queue</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  3 Pending Triage
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-200 text-rose-900 uppercase">
                      Urgent – Bereavement
                    </span>
                    <span className="text-[10px] text-slate-400">2h ago</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">Thomas Wright</h5>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400">
                      Pastoral Care Support &amp; Funeral Planning
                    </p>
                    <span className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold block mt-0.5">
                      Requested: Elder Samuel
                    </span>
                  </div>
                  <button className="w-full py-1.5 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow-xs">
                    Assign Immediately
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900">
                      Marriage Care
                    </span>
                    <span className="text-[10px] text-slate-400">2 days ago</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">Elena Rostova</h5>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400">
                      Spousal Communication Intervention
                    </p>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Preferred: Ps. David
                    </span>
                  </div>
                  <button className="w-full py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200">
                    Assign Pastor
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-900">
                      Spiritual Inquiry
                    </span>
                    <span className="text-[10px] text-slate-400">Yesterday</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">Michael Chang</h5>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400">
                      Adult Confirmation &amp; Faith Questions
                    </p>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Preferred: Any Clergy
                    </span>
                  </div>
                  <button className="w-full py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200">
                    Assign Pastor
                  </button>
                </div>

                <button className="w-full text-center py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Open Full Intake Registry (12 Completed) →
                </button>
              </div>
            </div>

            {/* 3. Clergy Privilege & HIPAA Shield */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Clergy Privilege &amp; HIPAA Shield</h3>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <Lock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>256-Bit Hardware Keystore Active</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  All session transcripts, clinical diagnostic references, and pastoral confessions are protected by constitutional clergy-penitent privilege and RCCP protocols.
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Audit Logs Clean (Last sync: 2m ago)</span>
                  <button className="text-indigo-600 font-bold hover:underline">Access Vault Logs</button>
                </div>
              </div>

              <button className="w-full py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 shadow-sm transition-all">
                <Phone className="w-3.5 h-3.5" />
                Emergency On-Call Pastoral Pager
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
