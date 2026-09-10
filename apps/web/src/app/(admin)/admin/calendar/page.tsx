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
  AlertTriangle,
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
  Shield,
  Activity,
  Flame,
  Music,
  Mic2,
  Printer,
  FileText,
  Sliders,
  Check,
  Zap,
  Lock,
  Thermometer,
  Wifi,
  ExternalLink,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { useAuth } from '../../../../lib/auth';
import { useToast } from '../../../../components/ui';

type CalendarTab = 'month' | 'gantt' | 'run-of-service' | 'conflict-matrix' | 'av-roster';

interface CalendarEventItem {
  id: string;
  day: number;
  time: string;
  title: string;
  venue: string;
  category: 'liturgy' | 'discipleship' | 'outreach' | 'facility' | 'conflict';
  categoryLabel: string;
  badgeTone: string;
  hasConflict?: boolean;
  lead?: string;
  attendees?: string;
}

const NOVEMBER_EVENTS: CalendarEventItem[] = [
  { id: 'ev-1', day: 1, time: '8:00 AM', title: 'All Saints Day High Mass', venue: 'Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-2', day: 2, time: '8:00 AM', title: 'Staff Devotions & Briefing', venue: 'Conf Room B', category: 'facility', categoryLabel: 'Facilities & Staff', badgeTone: 'bg-slate-700 text-slate-100 border-slate-600' },
  { id: 'ev-3', day: 3, time: '6:30 PM', title: 'Alpha Course Session 4', venue: 'Fellowship Hall', category: 'discipleship', categoryLabel: 'Discipleship & Formation', badgeTone: 'bg-emerald-900 text-emerald-100 border-emerald-700' },
  { id: 'ev-4', day: 4, time: '7:00 PM', title: 'Midweek Vespers & Communion', venue: 'Historic Chapel', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-5', day: 5, time: '10:30 AM', title: 'Food Pantry Distribution', venue: 'North Wing', category: 'outreach', categoryLabel: 'Community & Outreach', badgeTone: 'bg-amber-900 text-amber-100 border-amber-700' },
  { id: 'ev-6', day: 6, time: '5:00 PM', title: 'Choral Rehearsal & Tuning', venue: 'Chancel', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-7', day: 7, time: '1:00 PM', title: 'Audio Soundcheck & Line In', venue: 'Main Stage', category: 'facility', categoryLabel: 'Facilities & Staff', badgeTone: 'bg-slate-700 text-slate-100 border-slate-600' },
  { id: 'ev-8a', day: 8, time: '8:00 AM', title: 'Traditional Liturgy', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-8b', day: 8, time: '11:00 AM', title: 'Contemporary Praise', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-9', day: 9, time: '9:00 AM', title: 'Facility HVAC & BMS Audit', venue: 'Campus Wide', category: 'facility', categoryLabel: 'Facilities & Staff', badgeTone: 'bg-slate-700 text-slate-100 border-slate-600' },
  { id: 'ev-10', day: 10, time: '6:30 PM', title: 'Alpha Cohort #2 Group', venue: 'Upper Room', category: 'discipleship', categoryLabel: 'Discipleship & Formation', badgeTone: 'bg-emerald-900 text-emerald-100 border-emerald-700' },
  { id: 'ev-11', day: 11, time: '11:00 AM', title: 'Veterans Day Memorial', venue: 'Sanctuary Gardens', category: 'outreach', categoryLabel: 'Community & Outreach', badgeTone: 'bg-amber-900 text-amber-100 border-amber-700' },
  { id: 'ev-12', day: 12, time: '4:30 PM', title: 'Chapel Overlap (Funeral vs Choir)', venue: 'Historic Chapel', category: 'conflict', categoryLabel: 'Conflict Warning', badgeTone: 'bg-rose-600 text-white border-rose-500 animate-pulse', hasConflict: true },
  { id: 'ev-13', day: 13, time: '5:00 PM', title: 'Wedding Rehearsal', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-14', day: 14, time: '2:00 PM', title: 'Vance & Brooks Wedding', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-15', day: 15, time: '6:00 PM', title: 'Advent Candlelight Symphony', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400' },
  { id: 'ev-16', day: 16, time: '7:00 PM', title: 'Trustees Governance Council', venue: 'Conference Suite', category: 'facility', categoryLabel: 'Facilities & Staff', badgeTone: 'bg-slate-700 text-slate-100 border-slate-600' },
  { id: 'ev-17', day: 17, time: '6:30 PM', title: 'Alpha Cohort #3 Mentorship', venue: 'Fellowship Hall', category: 'discipleship', categoryLabel: 'Discipleship & Formation', badgeTone: 'bg-emerald-900 text-emerald-100 border-emerald-700' },
  { id: 'ev-18', day: 18, time: '7:00 PM', title: 'Youth Fellowship Rally', venue: 'Youth Pavilion', category: 'discipleship', categoryLabel: 'Discipleship & Formation', badgeTone: 'bg-emerald-900 text-emerald-100 border-emerald-700' },
  { id: 'ev-19', day: 19, time: '9:00 AM', title: 'Food Bank Holiday Prep', venue: 'North Wing', category: 'outreach', categoryLabel: 'Community & Outreach', badgeTone: 'bg-amber-900 text-amber-100 border-amber-700' },
  { id: 'ev-20', day: 20, time: '1:00 PM', title: 'Sanctuary Deep Cleaning', venue: 'Main Sanctuary', category: 'facility', categoryLabel: 'Facilities & Staff', badgeTone: 'bg-slate-700 text-slate-100 border-slate-600' },
  { id: 'ev-21', day: 21, time: '10:00 AM', title: 'Deacon Ordination Prep', venue: 'Historic Chapel', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-22', day: 22, time: '9:00 AM', title: 'Christ the King Sunday', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-23', day: 23, time: '2:00 PM', title: 'Pastoral Counseling Clinic', venue: 'Pastoral Suite', category: 'outreach', categoryLabel: 'Community & Outreach', badgeTone: 'bg-amber-900 text-amber-100 border-amber-700' },
  { id: 'ev-24', day: 24, time: '6:00 PM', title: 'Outreach Steering Committee', venue: 'Conf Room A', category: 'outreach', categoryLabel: 'Community & Outreach', badgeTone: 'bg-amber-900 text-amber-100 border-amber-700' },
  { id: 'ev-25', day: 25, time: '7:00 PM', title: 'Thanksgiving Eve Meal & Praise', venue: 'Fellowship Hall', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-amber-900 text-amber-100 border-amber-700' },
  { id: 'ev-26', day: 26, time: '10:00 AM', title: 'Thanksgiving Ecumenical Service', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-27', day: 27, time: '8:00 AM', title: 'Campus Facilities Maintenance', venue: 'Grounds Wide', category: 'facility', categoryLabel: 'Facilities & Staff', badgeTone: 'bg-slate-700 text-slate-100 border-slate-600' },
  { id: 'ev-28', day: 28, time: '9:00 AM', title: 'Hanging of the Greens Gala Prep', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-29', day: 29, time: '9:00 AM', title: 'First Sunday of Advent', venue: 'Main Sanctuary', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
  { id: 'ev-30', day: 30, time: '7:00 PM', title: 'St. Andrews Feast Service', venue: 'Historic Chapel', category: 'liturgy', categoryLabel: 'Worship & Liturgy', badgeTone: 'bg-indigo-900 text-indigo-100 border-indigo-700' },
];

export default function ActivitiesMasterCalendarPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<CalendarTab>('month');
  const [selectedDay, setSelectedDay] = useState<number>(15);
  const [conflictResolved, setConflictResolved] = useState(false);
  const [facilityFilter, setFacilityFilter] = useState('All Ministries & Facilities');
  const [isExporting, setIsExporting] = useState(false);

  // November 2026 starts on Sunday (day 1 = index 0)
  // Total 30 days
  const calendarDays = useMemo(() => {
    const days: { dayNumber: number; isCurrentMonth: boolean }[] = [];
    // Previous month filler days (Oct has 31 days)
    // Nov 1 2026 is Sunday, so 0 filler days needed
    for (let d = 1; d <= 30; d++) {
      days.push({ dayNumber: d, isCurrentMonth: true });
    }
    // Next month filler days (5 days to fill 5 weeks grid = 35)
    for (let d = 1; d <= 5; d++) {
      days.push({ dayNumber: d, isCurrentMonth: false });
    }
    return days;
  }, []);

  const handleResolveConflict = () => {
    setConflictResolved(true);
    notify('Conflict Resolved: Youth Choir Reassigned to Suite 204 & SMS Dispatched.', 'success');
  };

  const handleDispatchSMS = () => {
    notify('Run-of-Service SMS & Digital Cue Sheets dispatched to 28 staff & volunteers.', 'success');
  };

  const handlePrintBadges = () => {
    notify('Printing 42 Officiant & VIP Badges to Admin Workstation.', 'info');
  };

  const handleSyncPlanningCenter = () => {
    notify('Planning Center & iCal Sync Completed • 0 discrepancies.', 'success');
  };

  return (
    <AdminLayoutShell>
      <div className="space-y-5 pb-12">
        {/* Page Header with System Status Badges & Action Buttons */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                CAMPUS OPERATIONS
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                PRODUCTION V4.2
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sync Engine Active
              </span>
            </div>

            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Master Operations Calendar &amp; Scheduling Engine
            </h1>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Grace Cathedral Campus • Liturgical Year C • Multi-Venue Automation &amp; Conflict Arbiter
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!conflictResolved && (
              <button
                onClick={handleResolveConflict}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition-all shadow-xs"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                <span>Resolve Conflicts (1 Pending)</span>
              </button>
            )}

            <button
              onClick={handleSyncPlanningCenter}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
              <span>Sync Planning Center &amp; iCal</span>
            </button>

            <button
              onClick={() => {
                setIsExporting(true);
                setTimeout(() => {
                  setIsExporting(false);
                  notify('Exported November Run-of-Service schedule (PDF/CSV).', 'success');
                }, 800);
              }}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>{isExporting ? 'Exporting...' : 'Export Run-of-Service'}</span>
            </button>

            <Link
              href="/admin/events"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create Booking</span>
            </Link>
          </div>
        </div>

        {/* 4 Top KPI Metric Cards */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-1 sm:pb-0">
          {/* Card 1 */}
          <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                BOOKED EVENTS (NOV)
              </span>
              <CalendarIcon className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">54</span>
              <span className="text-xs font-bold text-emerald-600">+12% MoM</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>7 Major Liturgies</span>
              <span>18 Pastoral Care</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                VENUE SATURATION
              </span>
              <Building2 className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">96.4%</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Peak Capacity
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>9/10 Main Rooms</span>
              <span className={conflictResolved ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                {conflictResolved ? '0 Alerts' : '1 Overlap Alert'}
              </span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                STAFF &amp; VOLUNTEER SHIFTS
              </span>
              <HeartHandshake className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">186/194</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                8 Unfilled
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>95.8% Fill Rate</span>
              <span className="text-amber-600 font-bold">A/V Tech Critical</span>
            </div>
          </div>

          {/* Card 4 */}
          <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                SMART BMS &amp; BROADCAST
              </span>
              <Zap className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">100% Sync</span>
              <span className="text-[10px] font-bold text-slate-400">Live Stream Ready</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Smart Locks Pre-Armed</span>
              <span>HVAC Set: 68°F</span>
            </div>
          </div>
        </div>

        {/* View Switcher Bar & Date/Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* View Mode Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { key: 'month', label: 'Monthly Grid', icon: CalendarIcon },
              { key: 'gantt', label: 'Weekly Gantt', icon: Layers },
              { key: 'run-of-service', label: 'Daily Run-of-Service', icon: Clock },
              { key: 'conflict-matrix', label: 'Venue Conflict Matrix', icon: AlertTriangle },
              { key: 'av-roster', label: 'A/V Tech Roster', icon: Radio },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as CalendarTab)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Date Selector & Facility Dropdown */}
          <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 text-xs font-bold text-slate-700 dark:text-slate-200">
              <button className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">Today</span>
              <button className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs font-black text-slate-900 dark:text-white px-2">
              November 2026
            </span>

            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All Ministries & Facilities">All Ministries &amp; Facilities</option>
              <option value="Main Sanctuary">Main Sanctuary</option>
              <option value="Historic Chapel">Historic Chapel</option>
              <option value="Fellowship Hall">Fellowship Hall</option>
              <option value="Youth Pavilion">Youth Pavilion</option>
            </select>

            <span className="text-[11px] font-mono text-slate-400 hidden xl:inline">EST (UTC-5)</span>
          </div>
        </div>

        {/* Main Work Area: 2-Column Responsive Layout (7-Col Calendar Grid on Left, Inspection & Conflict Sidebar on Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Monthly Calendar Grid (Span 8) */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-4 flex flex-col justify-between">
            {/* Day of Week Header */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-extrabold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 dark:border-slate-800">
              <span>SUN</span>
              <span>MON</span>
              <span>TUE</span>
              <span>WED</span>
              <span>THU</span>
              <span>FRI</span>
              <span>SAT</span>
            </div>

            {/* 35-Cell Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                const dayNum = cell.dayNumber;
                const isSelected = cell.isCurrentMonth && selectedDay === dayNum;
                const dayEvents = cell.isCurrentMonth
                  ? NOVEMBER_EVENTS.filter((e) => e.day === dayNum)
                  : [];

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (cell.isCurrentMonth) setSelectedDay(dayNum);
                    }}
                    className={`min-h-[88px] sm:min-h-[104px] p-1.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                      !cell.isCurrentMonth
                        ? 'bg-slate-50/40 dark:bg-slate-950/20 border-slate-100 dark:border-slate-800/40 text-slate-300 dark:text-slate-600 pointer-events-none'
                        : isSelected
                        ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-500/80 ring-2 ring-indigo-500/30 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {/* Day Number Header with Badges */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-black ${
                          isSelected
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : cell.isCurrentMonth
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      >
                        {dayNum}
                      </span>

                      {isSelected && (
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-indigo-600 text-white uppercase">
                          Selected
                        </span>
                      )}

                      {dayEvents.some((e) => e.hasConflict && !conflictResolved) && (
                        <span className="px-1 py-0.2 rounded text-[8px] font-black bg-rose-600 text-white uppercase flex items-center gap-0.5 animate-pulse">
                          <AlertTriangle className="w-2 h-2" />
                        </span>
                      )}
                    </div>

                    {/* Event Blocks inside Date Cell */}
                    <div className="space-y-1 my-1 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border truncate transition-all ${
                            ev.hasConflict && !conflictResolved
                              ? 'bg-rose-600 text-white border-rose-700 font-extrabold'
                              : ev.category === 'liturgy'
                              ? 'bg-indigo-950 text-indigo-100 border-indigo-800'
                              : ev.category === 'discipleship'
                              ? 'bg-emerald-950 text-emerald-100 border-emerald-800'
                              : ev.category === 'outreach'
                              ? 'bg-amber-950 text-amber-100 border-amber-800'
                              : 'bg-slate-800 text-slate-100 border-slate-700'
                          }`}
                          title={`${ev.time} • ${ev.title} (${ev.venue})`}
                        >
                          <span className="opacity-75 mr-1 font-mono">{ev.time.split(' ')[0]}</span>
                          <span>{ev.title}</span>
                        </div>
                      ))}

                      {dayEvents.length > 2 && (
                        <div className="text-[8px] font-bold text-slate-400 pl-1">
                          +{dayEvents.length - 2} more
                        </div>
                      )}
                    </div>

                    {/* Bottom Status Dot */}
                    <div className="flex items-center gap-1">
                      {dayEvents.length > 0 && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            dayEvents.some((e) => e.hasConflict && !conflictResolved)
                              ? 'bg-rose-500'
                              : 'bg-indigo-500'
                          }`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Color Legend & Instruction Bar */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  COLOR LEGEND:
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-indigo-900 border border-indigo-700" />
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Worship &amp; Liturgy
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-900 border border-emerald-700" />
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Discipleship &amp; Formation
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-900 border border-amber-700" />
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Community &amp; Outreach
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-slate-600" />
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Facilities &amp; Staff
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-rose-600" />
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                    Conflict Warning
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                <span>⚡ Click any block to inspect Run-of-Service details</span>
              </div>
            </div>
          </div>

          {/* Right Column: Inspection, Conflict Engine & Run-of-Service Sidebar (Span 4) */}
          <div className="lg:col-span-4 space-y-4">
            {/* 1. Smart Conflict Engine Panel */}
            <div
              className={`p-4 rounded-2xl border shadow-sm transition-all ${
                conflictResolved
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/80'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-rose-200/60 dark:border-rose-800/60">
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚠️</span>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white">Smart Conflict Engine</h3>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    conflictResolved
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {conflictResolved ? 'Resolved' : '1 Critical Overlap'}
                </span>
              </div>

              {!conflictResolved ? (
                <div className="space-y-3 pt-2.5 text-xs">
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                    Room overlap detected in <strong className="text-slate-900 dark:text-white">Historic Chapel</strong> on{' '}
                    <strong>Thursday, Nov 12 (4:30 PM – 6:00 PM)</strong>.
                  </p>

                  <div className="space-y-1.5 bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">Miller Memorial Service</span>
                      <span className="text-slate-500 font-mono">4:00 – 5:30 PM</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Officiant: Rev. David Chen</p>

                    <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="font-bold text-rose-600">Youth Choir Vocal Warmup</span>
                      <span className="text-rose-600 font-mono">5:00 – 6:30 PM</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Director: Sarah Jenkins</p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 text-[11px] text-indigo-900 dark:text-indigo-200">
                    <p className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1 mb-0.5">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      Recommended Resolution
                    </p>
                    <p className="text-[10px] leading-relaxed">
                      Relocate Youth Choir Vocal Warmup to <strong>Rehearsal Suite 204</strong> (capacity 35, acoustic piano available, HVAC pre-scheduled).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleResolveConflict}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all text-center flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>1-Click Reassign &amp; Notify</span>
                    </button>
                    <button
                      onClick={() => setConflictResolved(true)}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>All Venue Schedules Synchronized</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Youth Choir Vocal Warmup relocated to Rehearsal Suite 204. No further conflicts detected across all 10 campus venues.
                  </p>
                </div>
              )}
            </div>

            {/* 2. Liturgical Highlight & Selected Event Detail Panel */}
            <div className="bg-slate-950 text-white rounded-2xl border border-slate-800 p-4 space-y-4 shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 pb-2 border-b border-slate-800">
                <span>LITURGICAL HIGHLIGHT • SUNDAY, NOV 15</span>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Share2 className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
                  <Edit2 className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
                </div>
              </div>

              {/* Title & Timing */}
              <div>
                <h3 className="text-base font-black text-white tracking-tight leading-snug">
                  Advent Candlelight Symphony &amp; Choral Festival
                </h3>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>6:00 PM – 8:45 PM • Main Sanctuary</span>
                </p>
              </div>

              {/* Capacity & Ticketing Gauge */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">CAPACITY &amp; TICKETING</span>
                  <span className="font-mono text-emerald-400 font-bold">742 / 750 (98.9%)</span>
                </div>
                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '98.9%' }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="text-amber-300 font-bold">8 Seats Remaining</span>
                  <span>Overflow Livestream Ready</span>
                </div>
              </div>

              {/* Run of Service Timeline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  <span>RUN OF SERVICE (TIMELINE)</span>
                  <button className="text-indigo-400 hover:underline">Edit Cue Sheet</button>
                </div>

                <div className="space-y-1.5 text-xs font-medium">
                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-indigo-400 font-bold">4:30 PM</span>
                      <span className="text-slate-200">Soundcheck &amp; Broadcast Line Check</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Media Team</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-indigo-400 font-bold">5:30 PM</span>
                      <span className="text-slate-200">Narthex Doors Open / Usher Stationing</span>
                    </div>
                    <span className="text-[10px] text-slate-400">24 Ushers</span>
                  </div>

                  <div className="p-2 rounded-lg bg-indigo-950/70 border border-indigo-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-emerald-400 font-bold">6:00 PM</span>
                      <span className="text-white font-bold">Orchestral Overture &amp; Processional</span>
                    </div>
                    <span className="text-[10px] text-indigo-300 font-bold">Symphony</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-indigo-400 font-bold">7:15 PM</span>
                      <span className="text-slate-200">Homily: &quot;Light in Darkness&quot;</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Lead Pastor</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-indigo-400 font-bold">8:10 PM</span>
                      <span className="text-slate-200">Candle Lighting &amp; Silent Night Choral</span>
                    </div>
                    <span className="text-[10px] text-slate-400">All Choir</span>
                  </div>
                </div>
              </div>

              {/* Duty Roster & Officiants */}
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  DUTY ROSTER &amp; OFFIDIANTS
                </span>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
                      DC
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-200 truncate">Rev. David Chen</p>
                      <p className="text-[10px] text-slate-400 truncate">Lead Officiant</p>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-[10px]">
                      JV
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-200 truncate">Dr. Julian Vance</p>
                      <p className="text-[10px] text-slate-400 truncate">Choir Master</p>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                      MT
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-200 truncate">Marcus Todd</p>
                      <p className="text-[10px] text-slate-400 truncate">A/V Director</p>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-[10px]">
                      ER
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-200 truncate">Elena Rostova</p>
                      <p className="text-[10px] text-slate-400 truncate">Head Usher</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleDispatchSMS}
                  className="w-full py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Run-of-Service SMS to Team</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handlePrintBadges}
                    className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-400" />
                    <span>Print Badges</span>
                  </button>

                  <button
                    onClick={() => notify('Bulletin Insert (Order of Worship) rendered to PDF.', 'info')}
                    className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Bulletin Insert</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Venue Automation Hub Status Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Grace Cathedral Venue Automation Hub
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">● BMS Online (BacNet IP Synced)</span>
              <span>•</span>
              <span>All Sensors Live</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Main Sanctuary */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Main Sanctuary</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Doors: <span className="text-emerald-600 font-semibold">Armed • Auto-unlock 5:00 PM</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 block">
                  HVAC: 69°F Heating
                </span>
                <span className="text-[10px] text-emerald-600 font-bold">Zone 1 Active</span>
              </div>
            </div>

            {/* Fellowship Hall */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Building2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Fellowship Hall</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Doors: <span className="text-slate-600 dark:text-slate-300 font-semibold">Locked • Scheduled 6:00 PM</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono text-slate-500 block">HVAC: Eco Standby (64°F)</span>
                <span className="text-[10px] text-slate-400">Zone 3 Pre-conditioning 70°F</span>
              </div>
            </div>

            {/* Historic Chapel */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Building2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Historic Chapel</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Doors:{' '}
                  <span className={conflictResolved ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                    {conflictResolved ? 'Armed • Ready' : 'Armed • Overlap Alert Flagged'}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono text-slate-500 block">HVAC: Set 68°F</span>
                <span className={conflictResolved ? 'text-emerald-600 font-bold text-[10px]' : 'text-rose-600 font-bold text-[10px]'}>
                  {conflictResolved ? 'Zone 2 Synced' : 'Zone 2 Conflict'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
