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
  Share2,
  ChevronRight,
  Sparkles,
  MapPin,
  HeartHandshake,
  DollarSign,
  Ticket,
  QrCode,
  Smartphone,
  Radio,
  FileCheck,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Layers,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { useAuth } from '../../../../lib/auth';

interface EventCardItem {
  id: string;
  title: string;
  category: string;
  priceBadge: string;
  priceBadgeColor: string;
  dateTime: string;
  venue: string;
  stat1Label: string;
  stat1Value: string;
  stat2Label: string;
  stat2Value: string;
  actions: { label: string; primary?: boolean }[];
}

const EVENTS_CATALOG: EventCardItem[] = [
  {
    id: 'evt-1',
    title: 'Annual Thanksgiving Community Banquet & Food Distribution',
    category: 'Outreach & Benevolence',
    priceBadge: 'FREE COMMUNITY',
    priceBadgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dateTime: 'Sat, Nov 21, 2026 • 11:00 AM',
    venue: 'West Hall Pavilion',
    stat1Label: 'Families Registered',
    stat1Value: '388 / 400 (97%)',
    stat2Label: 'Volunteer Staffing',
    stat2Value: '42 / 50 Filled',
    actions: [{ label: 'Attendees' }, { label: 'Volunteers (42)' }, { label: 'Meal Tickets', primary: true }],
  },
  {
    id: 'evt-2',
    title: 'Awaken Young Adults Fall Retreat: Deep Roots',
    category: 'Youth & Young Adults',
    priceBadge: '$145 / STUDENT',
    priceBadgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    dateTime: 'Nov 27 – 29, 2026',
    venue: 'Pinecrest Mountain Camp',
    stat1Label: 'Registration Gross',
    stat1Value: '$12,760 (88 / 100)',
    stat2Label: 'Lodging Quota',
    stat2Value: 'Cabin A-D Full, Cabin E (4 left)',
    actions: [{ label: '82/88 Waivers Signed' }, { label: 'Lodging' }, { label: 'Waivers', primary: true }],
  },
  {
    id: 'evt-3',
    title: 'Kingdom Worship Creative Conference 2027',
    category: 'Worship & Production',
    priceBadge: 'EARLY BIRD OPEN',
    priceBadgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dateTime: 'Jan 15 – 17, 2027',
    venue: 'Main Sanctuary & Tech Suites',
    stat1Label: 'Registrations (Pass)',
    stat1Value: '190 / 250 (76%)',
    stat2Label: 'Keynote',
    stat2Value: 'Dr. Evelyn Vance & Collective',
    actions: [{ label: 'Breakouts (8 Tracks)' }, { label: 'Manage Passes', primary: true }],
  },
  {
    id: 'evt-4',
    title: 'Marriage Covenant Weekend: Unshakeable Foundation',
    category: 'Couples & Family',
    priceBadge: '$85 / COUPLE',
    priceBadgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    dateTime: 'Dec 4 – 6, 2026',
    venue: 'Historic Chapel & Banquet Hall',
    stat1Label: 'Couple Roster',
    stat1Value: '45 / 50 Couples (90%)',
    stat2Label: 'Childcare Requested',
    stat2Value: '32 Children (Nursery Ready)',
    actions: [{ label: 'Catering Orders' }, { label: 'Childcare Roster', primary: true }],
  },
];

export default function EventsManagementPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'conferences' | 'free' | 'archived'>('all');
  const [formatFilter, setFormatFilter] = useState('All');
  const [salesFilter, setSalesFilter] = useState('All');
  const [venueFilter, setVenueFilter] = useState('All');

  const filteredEvents = useMemo(() => {
    return EVENTS_CATALOG.filter((evt) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          evt.title.toLowerCase().includes(q) ||
          evt.category.toLowerCase().includes(q) ||
          evt.venue.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [searchQuery]);

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
              <span>EVENTS &amp; REGISTRATIONS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Events Management &amp; Registrations
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Overview campus-wide conferences, holiday liturgies, retreats, tiered ticketing quotas, live scanner kiosks, and pastoral logistics.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm">
              <Download className="w-3.5 h-3.5 text-slate-400" />
              Export Attendee Roster
            </button>
            <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm">
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Sync Eventbrite / Kiosks
            </button>
            <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all">
              <Plus className="w-4 h-4" />
              Create New Event
            </button>
          </div>
        </div>

        {/* 4 KPI Scorecard Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL CONFIRMED
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                +14% YoY
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">3,420</span>
              <span className="text-xs font-bold text-slate-400">Attendees</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>Across 12 scheduled campus events</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                GROSS TICKET REVENUE
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Audited
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">$42,850</span>
              <span className="text-xs font-bold text-slate-400">USD</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>88% of quarterly ministry target</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                VENUE SATURATION
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                High Demand
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">89.4%</span>
              <span className="text-xs font-bold text-slate-400">Capacity</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>4 events near capacity / waitlisted</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                VOLUNTEER CHECK-INS
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Ready
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">218</span>
              <span className="text-xs font-bold text-slate-400">Assigned</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
              <span>94% crew &amp; usher shifts filled</span>
            </div>
          </div>
        </div>

        {/* Filter Bar & Category Tabs */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, guest artists, ticket #... (⌘K)"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="All">Category: All Formats (Q4 2026)</option>
                <option value="Liturgies">Holiday Liturgies</option>
                <option value="Conferences">Conferences</option>
                <option value="Retreats">Youth Retreats</option>
                <option value="Outreach">Community Outreach</option>
              </select>

              <select
                value={salesFilter}
                onChange={(e) => setSalesFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="All">Status: Active Sales</option>
                <option value="SoldOut">Sold Out</option>
                <option value="EarlyBird">Early Bird</option>
                <option value="Free">Free Registration</option>
              </select>

              <select
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <option value="All">Venue: All Spaces</option>
                <option value="MainSanctuary">Main Sanctuary</option>
                <option value="WestHall">West Hall</option>
                <option value="HistoricChapel">Historic Chapel</option>
                <option value="Camp">Pinecrest Camp</option>
              </select>
            </div>
          </div>

          {/* Filter Tabs Strip */}
          <div className="flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 overflow-x-auto">
            {[
              { key: 'all', label: 'All Events (12)' },
              { key: 'active', label: 'Active Ticket Sales (5)' },
              { key: 'conferences', label: 'Conferences & Galas (3)' },
              { key: 'free', label: 'Community Free (4)' },
              { key: 'archived', label: 'Archived (28)' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Master 2-Column Grid: 2/3 Left & 1/3 Right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT 2/3 COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Flagship Annual Liturgy Event Banner Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-6 shadow-xl relative overflow-hidden space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-slate-950">
                    FLAGSHIP ANNUAL LITURGY
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    98.9% Full
                  </span>
                </div>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Advent Candlelight Worship &amp; Choral Symphony
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 font-medium mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Sunday, Dec 20, 2026 • 6:30 PM – 9:00 PM
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    Main Sanctuary &amp; Grand Foyer
                  </span>
                  <span>•</span>
                  <span>742 / 750 Reserved</span>
                </div>
              </div>

              {/* Tiered Tickets Sub-Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">General Admission</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-300 uppercase">
                      SOLD OUT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Free Reserved • 520 / 520</p>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Choral Patron Tier</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-300 uppercase">
                      SOLD OUT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">$25.00 • 180 / 180</p>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Choir Family Circle</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 uppercase">
                      8 LEFT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">$15.00 • 42 / 50</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm">
                    Manage Guest Roster
                  </button>
                  <button className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors">
                    Seating Chart (750 Pews)
                  </button>
                </div>
                <button className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors">
                  Check-in Kiosk Setup
                </button>
              </div>
            </div>

            {/* 2. Events 2x2 Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3.5 flex flex-col justify-between hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        {evt.category}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${evt.priceBadgeColor}`}>
                        {evt.priceBadge}
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                      {evt.title}
                    </h4>

                    <div className="text-xs text-slate-500 space-y-0.5">
                      <p className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {evt.dateTime}
                      </p>
                      <p className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {evt.venue}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">{evt.stat1Label}:</span>
                        <strong className="text-slate-900 dark:text-white">{evt.stat1Value}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">{evt.stat2Label}:</span>
                        <strong className="text-slate-900 dark:text-white">{evt.stat2Value}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {evt.actions.map((act, idx) => (
                      <button
                        key={idx}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
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
              ))}
            </div>

            {/* 3. Recent Ticket Transactions & Registrations Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Recent Ticket Transactions &amp; Registrations
                  </h3>
                </div>
                <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  View Live Stream
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 pr-4">ATTENDEE / FAMILY</th>
                      <th className="py-2.5 px-4">EVENT</th>
                      <th className="py-2.5 px-4">TIER / QUOTA</th>
                      <th className="py-2.5 px-4">AMOUNT</th>
                      <th className="py-2.5 pl-4 text-right">CHECK-IN STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                            MS
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">Marcus &amp; Clara Sterling</span>
                            <span className="text-[10px] text-slate-400">m.sterling@churchexample.org</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-semibold">
                        Advent Choral Symphony
                      </td>
                      <td className="py-3 px-4 text-slate-500">Patron (2 Seats)</td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">$50.00</td>
                      <td className="py-3 pl-4 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          • QR Issued
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center text-[10px] font-black">
                            TH
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">Thomas Hayes (Student)</span>
                            <span className="text-[10px] text-slate-400">thayes@university.edu</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-semibold">
                        Awaken Fall Retreat
                      </td>
                      <td className="py-3 px-4 text-slate-500">Cabin Lodging</td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">$145.00</td>
                      <td className="py-3 pl-4 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          • Waiver Signed
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">
                            EG
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">Elena Gomez &amp; Family (4)</span>
                            <span className="text-[10px] text-slate-400">elena.gomez@gmail.com</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-semibold">
                        Thanksgiving Banquet
                      </td>
                      <td className="py-3 px-4 text-slate-500">Community (Free)</td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">$0.00</td>
                      <td className="py-3 pl-4 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          • Confirmed
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT 1/3 COLUMN */}
          <div className="space-y-6">
            {/* 1. Kiosks & Scanner Telemetry */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Kiosks &amp; Scanner Telemetry</h3>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white">Kiosk 1 (Sanctuary West)</h5>
                    <p className="text-[10px] text-slate-400">IP: 192.168.10.41 • Speed: 0.7s/scan</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Online
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white">Kiosk 2 (Foyer Welcome Center)</h5>
                    <p className="text-[10px] text-slate-400">IP: 192.168.10.45 • 99.4% Accuracy</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Online
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white">Mobile Usher Companion</h5>
                    <p className="text-[10px] text-slate-400">14 Handheld Scanners Active</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    14/14
                  </span>
                </div>

                <button className="w-full py-2.5 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all flex items-center justify-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" />
                  Deploy Scanner Pairing Key
                </button>
              </div>
            </div>

            {/* 2. Capacity & Waivers Alert */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Capacity &amp; Waivers Alert</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  2 Action Items
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black text-amber-950 dark:text-amber-200">Advent Choral Waitlist</h5>
                    <span className="text-[10px] font-black text-amber-800 dark:text-amber-300">48 on queue</span>
                  </div>
                  <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                    Capacity saturated. 12 balcony orchestra temp pews remain re-allocatable from clergy reserve.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button className="flex-1 py-1 rounded text-[10px] font-bold bg-amber-600 text-white hover:bg-amber-700">
                      Release Reserved Pews
                    </button>
                    <button className="flex-1 py-1 rounded text-[10px] font-bold bg-white dark:bg-slate-800 border border-amber-300 text-amber-900 dark:text-amber-200">
                      View Queue
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black text-rose-950 dark:text-rose-200">Young Adult Retreat Waivers</h5>
                    <span className="text-[10px] font-black text-rose-800 dark:text-rose-300">6 Unsigned</span>
                  </div>
                  <p className="text-[10px] text-rose-800/80 dark:text-rose-300/80 leading-relaxed">
                    Departure in 9 days. Bus boarding is conditional on approved digital liability submission.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button className="flex-1 py-1 rounded text-[10px] font-bold bg-rose-600 text-white hover:bg-rose-700">
                      Send Reminder SMS
                    </button>
                    <button className="flex-1 py-1 rounded text-[10px] font-bold bg-white dark:bg-slate-800 border border-rose-300 text-rose-900 dark:text-rose-200">
                      Export Unsigned
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Event Ledger & Payouts */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Event Ledger &amp; Payouts</h3>
                </div>
                <span className="text-[10px] text-slate-400">Q4 Consolidated</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Gross Ticket Sales:</span>
                  <span className="font-bold text-slate-900 dark:text-white">$42,850.00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Benevolence Subsidies:</span>
                  <span className="font-bold text-rose-600">-$2,100.00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Processing Fees (Stripe 2.2%):</span>
                  <span className="font-bold text-rose-600">-$942.70</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 font-bold">
                  <span className="text-slate-900 dark:text-white">Net Camp &amp; Ministry Payout:</span>
                  <span className="text-emerald-600 text-sm font-black">$39,807.30</span>
                </div>
                <p className="text-[10px] text-slate-400 pt-1">
                  Next scheduled ACH transfer: <strong>Nov 24, 2026</strong> directly to Grace Cathedral General Account.
                </p>
                <button className="w-full mt-2 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800">
                  Initiate Manual Payout / Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
