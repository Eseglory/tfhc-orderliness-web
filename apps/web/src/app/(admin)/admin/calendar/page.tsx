'use client';

import React, { useState, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MapPin,
  HeartHandshake,
  Edit2,
  Send,
  SlidersHorizontal,
  Volume2,
  MoreHorizontal,
  Layers,
  Radio,
  Share2,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
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
  statusColor?: string;
  urgentVolunteer?: boolean;
  urgentCount?: number;
  sessionInfo?: string;
  techStatus?: string;
  crewStatus?: string;
  isToday?: boolean;
}

const ACTIVITIES_LIST: CampusActivity[] = [
  {
    id: 'act-1',
    dayOfWeek: 'FRI',
    dayNum: '13',
    monthStr: 'NOV',
    isToday: true,
    timeRange: '7:00 PM – 9:30 PM',
    title: 'Young Adult Ignite & Dinner',
    description:
      'Acoustic praise set, guest speaker panel on workplace ethics, followed by catered street tacos in the outdoor pavilion.',
    category: 'Young Adults & College',
    categoryColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    venue: 'Youth Hall + Outdoor Patio',
    leadCoordinator: 'Ps. Sarah Jenkins',
    registeredCount: 125,
    capacityCount: 150,
    volunteerAssigned: 8,
    volunteerRequired: 8,
    statusBadge: 'Confirmed',
    statusColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    crewStatus: 'Crew: 8/8 Ready',
  },
  {
    id: 'act-3',
    dayOfWeek: 'SUN',
    dayNum: '15',
    monthStr: 'NOV',
    timeRange: '11:45 AM – 1:15 PM',
    title: 'New Covenant Discipleship',
    description:
      'Core theology module examining Pauline epistles, spiritual gifts assessment, and practical small-group mentorship principles.',
    category: 'Christian Education',
    categoryColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    venue: 'Pastoral Suite 102',
    leadCoordinator: 'Pastor David Chen',
    registeredCount: 32,
    capacityCount: 40,
    volunteerAssigned: 4,
    volunteerRequired: 4,
    statusBadge: 'Module 3 of 6',
    statusColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    crewStatus: 'Course Kit Ready',
  },
  {
    id: 'act-5',
    dayOfWeek: 'TUE',
    dayNum: '17',
    monthStr: 'NOV',
    timeRange: '10:00 AM – 11:30 AM',
    title: 'Golden Years Fellowship Tea',
    description:
      'Acoustic pipe organ devotional, warm artisan teas, and wellness updates with pastoral elder visitation teams.',
    category: 'Pastoral Care',
    categoryColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    venue: 'Historic Chapel Nave',
    leadCoordinator: 'Elder Samuel Osei',
    registeredCount: 45,
    capacityCount: 50,
    volunteerAssigned: 5,
    volunteerRequired: 5,
    statusBadge: 'Recurring',
    statusColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    crewStatus: 'Catering Dispatched',
  },
  {
    id: 'act-2',
    dayOfWeek: 'SAT',
    dayNum: '21',
    monthStr: 'NOV',
    timeRange: '8:30 AM – 2:00 PM',
    title: 'Thanksgiving Food Bank Drive',
    description:
      'Packing and distributing 450 turkey meal kits and dry pantry goods for local sheltered families across the metropolitan district.',
    category: 'Benevolence & Outreach',
    categoryColor: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    venue: 'West Hall Pavilion',
    leadCoordinator: 'Elder Marcus Sterling',
    registeredCount: 450,
    capacityCount: 450,
    volunteerAssigned: 18,
    volunteerRequired: 25,
    statusBadge: '7 Open Shifts',
    statusColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    urgentVolunteer: true,
    urgentCount: 7,
    crewStatus: 'Logistics Pending',
    sessionInfo: '450 Family Parcels',
  },
];

export default function ActivitiesMasterCalendarPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'feed' | 'month' | 'venue' | 'volunteers'>('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [ministryFilter, setMinistryFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [venueFilter, setVenueFilter] = useState('All');

  const [selectedDay, setSelectedDay] = useState<number>(13);
  const [calendarView, setCalendarView] = useState<'agenda' | 'week'>('agenda');

  const daysStrip = [
    { dow: 'M', day: '09', active: false },
    { dow: 'T', day: '10', active: false },
    { dow: 'W', day: '11', active: false },
    { dow: 'T', day: '12', active: false },
    { dow: 'F', day: '13', active: true },
    { dow: 'S', day: '14', active: false },
    { dow: 'S', day: '15', active: false },
  ];

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
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Top Breadcrumb & Header Subtext */}
        <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-slate-400">⚙</span>
            <span className="truncate">Operations • Master Calendar</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Campus Sync</span>
          </div>
        </div>

        {/* Title and Mobile Quick Actions */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Activities &amp; Calendar
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              42 Campus events programmed for November
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {}}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
              title="Filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              onClick={() => {}}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors hidden sm:inline-flex"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              href="/admin/events"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule</span>
            </Link>
          </div>
        </div>

        {/* Horizontal Swipeable KPI Ribbon (Mobile-Optimized Horizontal Scroll) */}
        <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 sm:grid sm:grid-cols-3 lg:grid-cols-4">
          <div className="min-w-[130px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                ACTIVITIES
              </span>
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="my-1">
              <span className="text-xl font-black text-slate-900 dark:text-white">38</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              +6 this mo
            </span>
          </div>

          <div className="min-w-[140px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                CONFIRMED
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                High Cap
              </span>
            </div>
            <div className="my-1">
              <span className="text-xl font-black text-slate-900 dark:text-white">1,842</span>
            </div>
            <span className="text-[10px] text-slate-400 truncate">
              87% seat allotment
            </span>
          </div>

          <div className="min-w-[130px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                FACILITIES
              </span>
              <Building2 className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="my-1">
              <span className="text-xl font-black text-slate-900 dark:text-white">91.4%</span>
            </div>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold truncate">
              9 of 10 booked
            </span>
          </div>

          <div className="min-w-[130px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hidden lg:flex">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                VOLUNTEERS
              </span>
              <HeartHandshake className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="my-1">
              <span className="text-xl font-black text-slate-900 dark:text-white">94.2%</span>
            </div>
            <span className="text-[10px] text-rose-600 font-bold truncate">
              8 Open Roles
            </span>
          </div>
        </div>

        {/* Horizontal Week / Day Carousel Strip */}
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>November 2026</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                onClick={() => setCalendarView('agenda')}
                className={`px-2 py-0.5 rounded ${
                  calendarView === 'agenda' ? 'bg-white dark:bg-slate-900 shadow-xs text-indigo-600' : 'text-slate-500'
                }`}
              >
                Agenda
              </button>
              <button
                onClick={() => setCalendarView('week')}
                className={`px-2 py-0.5 rounded ${
                  calendarView === 'week' ? 'bg-white dark:bg-slate-900 shadow-xs text-indigo-600' : 'text-slate-500'
                }`}
              >
                Week
              </button>
            </div>
          </div>

          {/* Days Strip */}
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {daysStrip.map((item, idx) => {
              const isSelected = selectedDay === parseInt(item.day);
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(parseInt(item.day))}
                  className={`py-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className={`text-[9px] font-extrabold uppercase ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {item.dow}
                  </span>
                  <span className="text-sm font-black leading-tight mt-0.5">{item.day}</span>
                  <span className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-transparent'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Volunteer Shortage Critical Alert Banner */}
        <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 p-3.5 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 mt-0.5">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  Volunteer Shortage: 7 Roles
                </h4>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 uppercase">
                  Critical
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                Thanksgiving Outreach (Nov 21) still needs 4 drivers and 3 kitchen helpers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-1 sm:pt-0">
            <button className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors text-center">
              View Roles
            </button>
            <button className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-600 text-white hover:bg-amber-700 shadow-sm transition-all">
              <Volume2 className="w-3.5 h-3.5" />
              <span>Broadcast SMS Call</span>
            </button>
          </div>
        </div>

        {/* Campus Spotlight / Featured Flagship Event Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider mb-2">
            <span className="text-indigo-400">CAMPUS SPOTLIGHT</span>
            <span className="text-amber-300">96% Capacity</span>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-amber-500 text-slate-950 uppercase">
                Flagship Event
              </span>
              <span className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
                ⛪ Main Sanctuary + Atrium
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
              Advent Candlelight &amp; Choral Gala
            </h3>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Sun, Nov 29 • 6:00 PM – 8:30 PM</span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                20 Seats Left
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>480 Confirmed RSVPs</span>
              <span>500 Total Target</span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button className="flex-1 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10 text-center">
                Roster (42)
              </button>
              <button className="flex-1 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm text-center">
                Run-of-Service
              </button>
            </div>
          </div>
        </div>

        {/* Scheduled Activities Feed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Scheduled Activities</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Real-time campus agenda</p>
            </div>
            <span className="text-xs font-bold text-slate-400">Filtered: All (4)</span>
          </div>

          <div className="space-y-2.5">
            {filteredActivities.map((act) => (
              <div
                key={act.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3.5 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {/* Date Pill */}
                    <div
                      className={`px-2 py-1.5 rounded-xl flex flex-col items-center justify-center shrink-0 text-center font-bold ${
                        act.isToday
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          : act.urgentVolunteer
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-[8px] uppercase">{act.isToday ? 'TODAY' : act.dayOfWeek}</span>
                      <span className="text-xs font-black leading-none">{act.dayNum}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                          {act.title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{act.venue}</span>
                      </p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${act.statusColor}`}>
                    {act.statusBadge}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-2 truncate">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {act.timeRange}
                    </span>
                    <span>•</span>
                    <span className="truncate">{act.leadCoordinator}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span className={act.urgentVolunteer ? 'text-rose-600 font-bold' : 'text-slate-600 dark:text-slate-400 font-semibold'}>
                    {act.registeredCount} / {act.capacityCount} RSVPs • {act.crewStatus}
                  </span>

                  {act.urgentVolunteer ? (
                    <button className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline">
                      Assign
                    </button>
                  ) : (
                    <button className="p-1 text-slate-400 hover:text-slate-600">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Venue Occupancy Section */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div>
              <h3 className="text-xs font-black text-slate-900 dark:text-white">Live Venue Occupancy</h3>
              <p className="text-[10px] text-slate-400">Real-time room allocation status</p>
            </div>
            <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              Reserve
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Main Sanctuary</h4>
                  <p className="text-[10px] text-slate-400">Capacity: 750 seats</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-extrabold text-rose-600 block">• Booked (6:30 PM)</span>
                <span className="text-[9px] text-slate-400">Soundcheck Active</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Historic Chapel</h4>
                  <p className="text-[10px] text-slate-400">Capacity: 120 seats</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-extrabold text-emerald-600 block">• Free until 4:00 PM</span>
                <span className="text-[9px] text-slate-400">No Tech Setup</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Fellowship Hall 204</h4>
                  <p className="text-[10px] text-slate-400">Capacity: 60 seats</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-extrabold text-blue-600 block">• In Use: Prayer Team</span>
                <span className="text-[9px] text-slate-400">Clears at 2:00 PM</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
