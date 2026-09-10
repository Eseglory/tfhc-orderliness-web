'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Filter,
  RefreshCw,
  Download,
  Share2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  Radio,
  ExternalLink,
  MapPin,
  Mic,
  Music,
  HeartHandshake,
  BookOpen,
  Coffee,
  Truck,
  Edit2,
  Check,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

interface CampusActivity {
  id: string;
  dayOfWeek: string;
  dayNum: string;
  monthStr: string;
  timeRange: string;
  title: string;
  description: string;
  category: string;
  categoryColor: string;
  venue: string;
  leadCoordinator: string;
  registeredCount: number;
  capacityCount: number;
  volunteerAssigned: number;
  volunteerRequired: number;
  statusBadge: string;
  urgentVolunteer?: boolean;
  urgentCount?: number;
  sessionInfo?: string;
  techStatus?: string;
}

const ACTIVITIES_LIST: CampusActivity[] = [
  {
    id: 'act-1',
    dayOfWeek: 'FRI',
    dayNum: '13',
    monthStr: 'NOV',
    timeRange: '7:00 PM – 9:30 PM',
    title: 'Young Adult Ignite Night & Fellowship Dinner',
    description:
      'Acoustic praise set, guest speaker panel on workplace ethics, followed by catered street tacos in the outdoor pavilion.',
    category: 'Young Adults & College',
    categoryColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    venue: 'Youth Hall & Outdoor Patio',
    leadCoordinator: 'Pastor Sarah Jenkins',
    registeredCount: 125,
    capacityCount: 150,
    volunteerAssigned: 8,
    volunteerRequired: 8,
    statusBadge: 'Registration Open',
  },
  {
    id: 'act-2',
    dayOfWeek: 'SAT',
    dayNum: '21',
    monthStr: 'NOV',
    timeRange: '8:30 AM – 2:00 PM',
    title: 'Thanksgiving Community Food Bank Drive & Outreach',
    description:
      'Packing and distributing 450 turkey meal kits and dry pantry goods for local sheltered families across the metropolitan district.',
    category: 'Benevolence & Outreach',
    categoryColor: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    venue: 'West Hall Parking Pavilion & Fellowship Hall 204',
    leadCoordinator: 'Elder Marcus Sterling',
    registeredCount: 450,
    capacityCount: 450,
    volunteerAssigned: 28,
    volunteerRequired: 35,
    statusBadge: 'Urgent: 7 Volunteers Needed',
    urgentVolunteer: true,
    urgentCount: 7,
  },
  {
    id: 'act-3',
    dayOfWeek: 'SUN',
    dayNum: '15',
    monthStr: 'NOV',
    timeRange: '11:45 AM – 1:15 PM',
    title: 'New Covenant Discipleship Seminar & Leadership Lab',
    description:
      'Core theology module examining Pauline epistles, spiritual gifts assessment, and practical small-group mentorship principles.',
    category: 'Christian Education',
    categoryColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    venue: 'Pastoral Suite 102 & Zoom Hybrid',
    leadCoordinator: 'Pastor David Chen',
    registeredCount: 32,
    capacityCount: 40,
    volunteerAssigned: 4,
    volunteerRequired: 4,
    statusBadge: 'Session 3 of 6',
    sessionInfo: 'Packets Distributed',
  },
  {
    id: 'act-4',
    dayOfWeek: 'THU',
    dayNum: '12',
    monthStr: 'NOV',
    timeRange: '6:30 PM – 9:00 PM',
    title: 'Kingdom Sound Worship Team Rehearsal & Vocal Intensive',
    description:
      'Full band rhythm section, vocal harmony blocking, and multi-track audio recording prep for Sunday broadcast.',
    category: 'Worship & Arts',
    categoryColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    venue: 'Main Sanctuary Choir Loft',
    leadCoordinator: 'Sophia Lin-Vance',
    registeredCount: 22,
    capacityCount: 25,
    volunteerAssigned: 6,
    volunteerRequired: 6,
    statusBadge: 'Confirmed Tech Check',
    techStatus: 'Full IEM & ProPresenter Synced',
  },
  {
    id: 'act-5',
    dayOfWeek: 'TUE',
    dayNum: '17',
    monthStr: 'NOV',
    timeRange: '10:00 AM – 12:00 PM',
    title: 'Golden Years Seniors Fellowship Tea & Hymn Sing',
    description:
      'Acoustic pipe organ devotional, warm artisan teas, and wellness updates with pastoral elder visitation teams.',
    category: 'Pastoral Care',
    categoryColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    venue: 'Historic Chapel & Tea Parlor',
    leadCoordinator: 'Elder Samuel Osei',
    registeredCount: 45,
    capacityCount: 50,
    volunteerAssigned: 5,
    volunteerRequired: 5,
    statusBadge: 'Senior Transportation Active',
  },
];

export default function ActivitiesMasterCalendarPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'feed' | 'month' | 'venue' | 'volunteers'>('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [ministryFilter, setMinistryFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [venueFilter, setVenueFilter] = useState('All');

  const [selectedDay, setSelectedDay] = useState<number>(29);
  const [selectedMonth, setSelectedMonth] = useState('November 2026');

  const filteredActivities = useMemo(() => {
    return ACTIVITIES_LIST.filter((act) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText =
          act.title.toLowerCase().includes(q) ||
          act.description.toLowerCase().includes(q) ||
          act.venue.toLowerCase().includes(q) ||
          act.leadCoordinator.toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      if (ministryFilter !== 'All' && !act.category.includes(ministryFilter)) {
        return false;
      }
      return true;
    });
  }, [searchQuery, ministryFilter]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>CHURCH OPERATIONS</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">GRACE CATHEDRAL CAMPUS</span>
              <span>/</span>
              <span>ACTIVITIES & MASTER CALENDAR</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Activities & Campus Master Calendar
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Node C-2026
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Coordinate church-wide events, ministry activities, facilities bookings, registration quotas, and volunteer team rosters across all campus venues.
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
              Export (PDF/iCal)
            </button>
            <Link
              href="/admin/events"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              Schedule Activity / Event
            </Link>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                SCHEDULED ACTIVITIES
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <CalendarIcon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">38 Active</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>14 in next 14 days</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">+6 this month</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                TOTAL REGISTRATIONS
              </span>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">1,842 Confirmed</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>87% avg venue capacity</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded">
                High Demand
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                FACILITIES BOOKED
              </span>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">91.4%</span>
              <span className="text-xs font-bold text-slate-400">Saturation</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Peak: Sat &amp; Sun</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">9 Venues Active</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                VOLUNTEER COVERAGE
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <HeartHandshake className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">94.2%</span>
              <span className="text-xs font-bold text-slate-400">Assigned</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>142 / 150 Positions</span>
              <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.2 rounded">
                8 Open Roles
              </span>
            </div>
          </div>
        </div>

        {/* Search, Filter & View Controls Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-xl">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search activities, ministries, venues, or event coordinators... (⌘K)"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* View Switcher Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
              {[
                { key: 'feed', label: 'Activity Feed' },
                { key: 'month', label: 'Monthly Grid' },
                { key: 'venue', label: 'Venue Matrix' },
                { key: 'volunteers', label: 'Volunteers' },
              ].map((v) => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === v.key
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Filter Dropdowns & Date Navigator */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={ministryFilter}
                onChange={(e) => setMinistryFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="All">All Ministries (All)</option>
                <option value="Young Adults">Young Adults &amp; College</option>
                <option value="Benevolence">Benevolence &amp; Outreach</option>
                <option value="Christian Education">Christian Education</option>
                <option value="Worship">Worship &amp; Arts</option>
                <option value="Pastoral Care">Pastoral Care</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="All">All Activity Types</option>
                <option value="Gathering">Worship Gatherings</option>
                <option value="Rehearsal">Rehearsals &amp; Practices</option>
                <option value="Seminar">Seminars &amp; Classes</option>
                <option value="Outreach">Community Outreach</option>
              </select>

              <select
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="All">All Campus Venues</option>
                <option value="Main Sanctuary">Main Sanctuary</option>
                <option value="Historic Chapel">Historic Chapel</option>
                <option value="Fellowship Hall">Fellowship Hall 204</option>
                <option value="Youth Hall">Youth Hall &amp; Patio</option>
              </select>

              {(searchQuery || ministryFilter !== 'All' || typeFilter !== 'All' || venueFilter !== 'All') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setMinistryFilter('All');
                    setTypeFilter('All');
                    setVenueFilter('All');
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors px-2 py-1"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Date Navigator */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedMonth('November 2026')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
              >
                Today
              </button>
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1">
                <button className="p-0.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-black text-slate-900 dark:text-white px-2">
                  November 2026
                </span>
                <button className="p-0.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Master 2-Column Grid: 2/3 Left & 1/3 Right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT 2/3 COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Featured Flagship Event Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-amber-500 text-slate-950">
                      FLAGSHIP EVENT
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      Broadcast Live
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sunday, Nov 29, 2026 • 6:00 PM – 9:00 PM</span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      96% Capacity
                    </span>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Annual Advent Worship &amp; Candlelight Gala
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 font-medium mt-1">
                    <span className="flex items-center gap-1 text-indigo-300 font-semibold">
                      <MapPin className="w-3.5 h-3.5" />
                      Main Sanctuary &amp; Grand Atrium
                    </span>
                    <span>•</span>
                    <span>Lead Host: <strong>Dr. Julian Vance</strong></span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    Campus-wide worship gathering with combined orchestral choir, symphonic brass, community lighting ceremony, and global benevolence offering.
                  </p>
                </div>

                {/* RSVP Quota progress bar */}
                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>RSVP Quota: 480 / 500</span>
                    <span className="text-amber-400">20 Seats Left</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 rounded-full w-[96%]" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 24 Volunteers Assigned
                    </span>
                    <span>Tech Rehearsal Confirmed</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-[11px] font-extrabold text-amber-300/90 uppercase tracking-wider">
                    REGISTRATION CLOSES SOON: Advent Season Launch
                  </span>
                  <div className="flex items-center gap-2">
                    <button className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-sm">
                      Manage Registration Roster
                    </button>
                    <button className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-colors">
                      Run-of-Service
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Upcoming Scheduled Activities Feed */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                    Upcoming Scheduled Activities
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    5 this week
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Sort by:</span>
                  <span className="font-bold text-slate-900 dark:text-white">Chronological</span>
                </div>
              </div>

              {filteredActivities.map((act) => (
                <div
                  key={act.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-sm transition-all hover:border-indigo-200 dark:hover:border-indigo-800 ${
                    act.urgentVolunteer
                      ? 'border-amber-200/80 dark:border-amber-800/80 bg-amber-50/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    {/* Date Block */}
                    <div
                      className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                        act.urgentVolunteer
                          ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                        {act.dayOfWeek}
                      </span>
                      <span className="text-xl font-black leading-none my-0.5">{act.dayNum}</span>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                        {act.monthStr}
                      </span>
                    </div>

                    {/* Main Activity Details */}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold border ${act.categoryColor}`}>
                          {act.category}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {act.timeRange}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded text-[10px] font-extrabold ${
                            act.urgentVolunteer
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {act.statusBadge}
                        </span>
                      </div>

                      <h4 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                        {act.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {act.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {act.venue}
                        </span>
                        <span>•</span>
                        <span>Coordinator: <strong>{act.leadCoordinator}</strong></span>
                        <span>•</span>
                        <span>
                          {act.registeredCount} / {act.capacityCount} Registered (
                          {Math.round((act.registeredCount / act.capacityCount) * 100)}%)
                        </span>
                        {act.urgentVolunteer ? (
                          <span className="font-extrabold text-rose-600 dark:text-rose-400">
                            • Staff Gaps ({act.volunteerAssigned}/{act.volunteerRequired} Volunteers)
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            • Full Roster ({act.volunteerAssigned}/{act.volunteerRequired})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action edit/view buttons */}
                    <div className="flex sm:flex-col items-center gap-1 self-start sm:self-center">
                      <button className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <span>Showing 5 of 38 active campus activities</span>
                <div className="flex items-center gap-1">
                  <button className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Previous
                  </button>
                  <button className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold">1</button>
                  <button className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">2</button>
                  <button className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">3</button>
                  <button className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 1/3 COLUMN */}
          <div className="space-y-6">
            {/* 1. Interactive Mini Month Calendar */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">November 2026</h3>
                <div className="flex items-center gap-1">
                  <button className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Mini Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
                  <span key={i} className="text-[10px] font-bold text-slate-400 uppercase py-1">
                    {d}
                  </span>
                ))}
                {/* Blank days for Nov 2026 (Nov 1 is Sunday) */}
                {Array.from({ length: 30 }).map((_, idx) => {
                  const day = idx + 1;
                  const isSelected = selectedDay === day;
                  const hasUrgent = day === 21;
                  const isFeatured = day === 29;
                  const hasActivity = [12, 13, 15, 17].includes(day);

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`h-8 rounded-lg flex flex-col items-center justify-center relative font-semibold transition-all ${
                        isFeatured
                          ? 'bg-indigo-600 text-white font-black shadow-sm'
                          : hasUrgent
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-bold ring-1 ring-amber-400'
                          : isSelected
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span>{day}</span>
                      {hasActivity && !isFeatured && (
                        <span className="w-1 h-1 rounded-full bg-indigo-500 absolute bottom-1" />
                      )}
                      {hasUrgent && (
                        <span className="w-1 h-1 rounded-full bg-rose-500 absolute bottom-1" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" /> Today
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500" /> Featured Event
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Urgent Needs
                </span>
              </div>
            </div>

            {/* 2. Venue Live Availability */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Venue Live Availability</h3>
                    <span className="text-[10px] text-slate-400">Campus Node 1</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    name: 'Main Sanctuary',
                    spec: 'Cap: 1,200 • Full Stage Rig',
                    status: 'Booked (6:30 PM)',
                    statusColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
                  },
                  {
                    name: 'Historic Chapel',
                    spec: 'Cap: 180 • Organ Sound',
                    status: 'Free until 4:00 PM',
                    statusColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
                  },
                  {
                    name: 'Fellowship Hall 204',
                    spec: 'Cap: 90 • Commercial Kitchen',
                    status: 'Booked 2PM–5PM',
                    statusColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                  },
                  {
                    name: 'Conference Room A',
                    spec: 'Cap: 24 • Zoom Conference',
                    status: 'Available All Day',
                    statusColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                  },
                ].map((venue, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">{venue.name}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{venue.spec}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${venue.statusColor}`}>
                      {venue.status}
                    </span>
                  </div>
                ))}
              </div>

              <button className="w-full py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/80 transition-colors">
                Reserve Campus Space
              </button>
            </div>

            {/* 3. Roster Gaps & Urgent Needs */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Roster Gaps &amp; Urgent Needs</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  8 Roles Open
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">
                Critical operations lacking mandatory volunteer headcount for upcoming weekend gatherings:
              </p>

              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-rose-950 dark:text-rose-200">Thanksgiving Outreach</h5>
                    <p className="text-[10px] text-rose-700 dark:text-rose-400">4 Box Truck Drivers, 3 Sorters</p>
                  </div>
                  <span className="text-xs font-black text-rose-700 dark:text-rose-300">7 Needed • Nov 21</span>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-amber-950 dark:text-amber-200">Sunday Children&apos;s Ministry</h5>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">Certified Nursery Caregivers</p>
                  </div>
                  <span className="text-xs font-black text-amber-700 dark:text-amber-300">2 Needed • Nov 15</span>
                </div>
              </div>

              <button className="w-full py-2.5 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2 shadow-sm transition-all">
                <Send className="w-3.5 h-3.5" />
                Broadcast Volunteer Call (SMS/Email)
              </button>
            </div>

            {/* 4. Equipment & Asset Dispatch */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Equipment &amp; Asset Dispatch</h3>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Broadcast Livestream Rig A</span>
                    <span className="text-[10px] text-slate-400">Reserved: Advent Gala</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    Main Tech
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">15-Passenger Van #1 &amp; #2</span>
                    <span className="text-[10px] text-slate-400">Route: Senior Tea Pickup</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Fleet Lot
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Espresso &amp; Banquet Kit</span>
                    <span className="text-[10px] text-slate-400">Approved: Hospitality Dept</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Kitchen 2
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
