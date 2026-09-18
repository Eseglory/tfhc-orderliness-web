'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Shirt,
  Calendar,
  Sparkles,
  Tag,
  Plus,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Eye,
  Layers,
  ChevronRight,
  Palette,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { useToast } from '../../../../components/ui';

export default function AdminWardrobeOverviewPage() {
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  const [nextSchedule, setNextSchedule] = useState<any>(null);
  const [upcomingSchedules, setUpcomingSchedules] = useState<any[]>([]);
  const [itemsCount, setItemsCount] = useState(0);
  const [outfitsCount, setOutfitsCount] = useState(0);
  const [schedulesCount, setSchedulesCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRes, upcomingRes, itemsRes, outfitsRes, schedulesRes] = await Promise.all([
        fetchApi<any>('/admin/wardrobe/next').catch(() => null),
        fetchApi<any>('/admin/wardrobe/upcoming').catch(() => []),
        fetchApi<any>('/admin/wardrobe/items').catch(() => []),
        fetchApi<any>('/admin/wardrobe/outfits').catch(() => []),
        fetchApi<any>('/admin/wardrobe/schedules').catch(() => []),
      ]);
      setNextSchedule(nextRes?.data || nextRes || null);
      setUpcomingSchedules(Array.isArray(upcomingRes?.data) ? upcomingRes.data : Array.isArray(upcomingRes) ? upcomingRes : []);
      const itemsList = Array.isArray(itemsRes?.data) ? itemsRes.data : Array.isArray(itemsRes) ? itemsRes : [];
      const outfitsList = Array.isArray(outfitsRes?.data) ? outfitsRes.data : Array.isArray(outfitsRes) ? outfitsRes : [];
      const schedulesList = Array.isArray(schedulesRes?.data) ? schedulesRes.data : Array.isArray(schedulesRes) ? schedulesRes : [];
      setItemsCount(itemsList.length);
      setOutfitsCount(outfitsList.length);
      setSchedulesCount(schedulesList.length);
    } catch (e: any) {
      notify(e.message || 'Could not load wardrobe summary', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getOutfitImage = (schedule: any) => {
    if (schedule?.outfit?.coverImageUrl) return schedule.outfit.coverImageUrl;
    const title = `${schedule?.title || ''} ${schedule?.outfit?.title || ''}`.toLowerCase();
    if (title.includes('native') || title.includes('traditional')) return '/wardrobe/native-all.jpg';
    if (title.includes('carton') || title.includes('red tie')) return '/wardrobe/carton-red-tie.jpg';
    if (title.includes('colour riot') || title.includes('color riot')) return '/wardrobe/colour-riot-suit.jpg';
    if (title.includes('lemon') || title.includes('lime')) return '/wardrobe/lemon-gown.jpg';
    if (title.includes('white native')) return '/wardrobe/white-native.jpg';
    if (title.includes('suspenders')) return '/wardrobe/black-suspenders.jpg';
    if (title.includes('blazer') || title.includes('bright')) return '/wardrobe/bright-blazer.jpg';
    return '/wardrobe/native-all.jpg';
  };

  const getDaysUntil = (dateStr: string) => {
    try {
      const target = new Date(dateStr);
      const now = new Date();
      target.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays > 1 && diffDays <= 7) return `This ${target.toLocaleDateString('en-GB', { weekday: 'long' })}`;
      if (diffDays > 7) return `In ${diffDays} days`;
      if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
      return 'Upcoming';
    } catch {
      return 'Upcoming';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <AdminLayoutShell activeHref="/admin/wardrobe">
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
              <span>VISUAL WARDROBE SUITE</span>
              <span>•</span>
              <span>DRESS CODE &amp; TIMETABLE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
              Wardrobe Management
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
              Catalogue reusable clothing items, build layered visual outfits, and manage the monthly Sunday and special programs dress code timetable.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <Link
              href="/admin/wardrobe/schedule"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-100 transition-colors shadow-xs"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Timetable Manager</span>
            </Link>

            <Link
              href="/admin/wardrobe/outfits"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Outfit</span>
            </Link>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Catalogue Items</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{itemsCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Suits, Native Wears, Shirts &amp; Colors</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Tag className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Composed Outfits</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{outfitsCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Layered templates &amp; presets</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Scheduled Events</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{schedulesCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Sunday services &amp; special programs</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-100 dark:border-violet-900 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <CalendarDays className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Next Scheduled Wardrobe Hero */}
        <div className="relative rounded-3xl bg-slate-950 bg-gradient-to-br from-slate-950 via-[#0f172a] to-[#1e1b4b] text-white p-6 sm:p-8 shadow-2xl border border-indigo-500/30 overflow-hidden">
          {/* Ambient Lighting Accents */}
          <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

          {nextSchedule ? (
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Details & Garments */}
              <div className="lg:col-span-7 space-y-4">
                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-bold uppercase tracking-wider shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Next Scheduled Wardrobe (Member View)</span>
                  </span>

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Published • {getDaysUntil(nextSchedule.scheduledDate)}</span>
                  </span>

                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-slate-300 text-xs font-semibold">
                    <CalendarDays className="w-3.5 h-3.5 text-indigo-300" />
                    <span>{nextSchedule.eventType?.replace('_', ' ') || 'Sunday Service'}</span>
                  </span>
                </div>

                {/* Title & Date */}
                <div>
                  <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white drop-shadow-xs">
                    {nextSchedule.outfit?.title || nextSchedule.title}
                  </h2>
                  <div className="flex items-center gap-2 mt-2 text-sm text-indigo-200/90 font-medium">
                    <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-white font-bold">{formatDate(nextSchedule.scheduledDate)}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-300 line-clamp-1">{nextSchedule.title}</span>
                  </div>
                </div>

                {/* Instructions / Styling Guidance */}
                {nextSchedule.instructions && (
                  <div className="bg-white/10 dark:bg-black/30 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 text-xs sm:text-sm text-indigo-100 flex items-start gap-3 shadow-inner">
                    <span className="text-amber-400 text-base leading-none shrink-0">💡</span>
                    <p className="leading-relaxed">{nextSchedule.instructions}</p>
                  </div>
                )}

                {/* Components Breakdown */}
                {nextSchedule.outfit?.items && nextSchedule.outfit.items.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
                      <span>Prescribed Attire Breakdown</span>
                      <span className="text-indigo-400 font-semibold">{nextSchedule.outfit.items.length} Layered Pieces</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {nextSchedule.outfit.items.map((it: any, idx: number) => (
                        <div
                          key={it.id}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-sm transition-colors text-xs font-medium"
                        >
                          {it.variant?.colorCode ? (
                            <span
                              className="w-4 h-4 rounded-full border border-white/40 shrink-0 shadow-xs"
                              style={{ backgroundColor: it.variant.colorCode }}
                              title={it.variant.colorName}
                            />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-slate-600 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-white font-semibold block truncate">{it.item?.name}</span>
                            {it.variant && (
                              <span className="text-indigo-300 text-[11px] block truncate">
                                Color: {it.variant.colorName}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 bg-white/10 px-1.5 py-0.5 rounded-md shrink-0">
                            L{idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href="/admin/wardrobe/schedule"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 hover:shadow-lg transition-all active:scale-95 shadow-md"
                  >
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>Open Timetable Scheduler</span>
                  </Link>
                  <Link
                    href="/admin/wardrobe/outfits"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs backdrop-blur-md transition-all active:scale-95"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-300" />
                    <span>Manage Outfits</span>
                  </Link>
                  <Link
                    href="/member/wardrobe"
                    target="_blank"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-indigo-300 hover:text-white text-xs font-semibold transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Member App</span>
                  </Link>
                </div>
              </div>

              {/* Right Column: Visual Outfit Card Showcase */}
              <div className="lg:col-span-5 flex justify-center lg:justify-end">
                <div className="relative group w-full max-w-sm rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-slate-900/80 backdrop-blur-xl">
                  {/* Outfit Artwork */}
                  <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-950">
                    <img
                      src={getOutfitImage(nextSchedule)}
                      alt={nextSchedule.outfit?.title || nextSchedule.title}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    
                    {/* Floating Gender/Target Badge */}
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-[11px] font-bold text-white uppercase tracking-wider">
                        {nextSchedule.outfit?.genderTarget === 'ALL' ? 'For All Members' : nextSchedule.outfit?.genderTarget || 'All Members'}
                      </span>
                    </div>

                    {/* Floating Date Chip */}
                    <div className="absolute top-3 right-3">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-600/90 backdrop-blur-md border border-indigo-400/40 text-[11px] font-bold text-white">
                        {formatDate(nextSchedule.scheduledDate).split(',')[0]}
                      </span>
                    </div>

                    {/* Bottom overlay text */}
                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="text-white font-bold text-sm truncate">
                        {nextSchedule.outfit?.title || nextSchedule.title}
                      </p>
                      <p className="text-indigo-200 text-xs truncate mt-0.5">
                        {nextSchedule.outfit?.items?.length || 0} Prescribed Garment Layers
                      </p>
                    </div>
                  </div>

                  {/* Card Footer Quick Link */}
                  <div className="p-3.5 bg-slate-950/90 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Official Corporate Dress Code</span>
                    </span>
                    <Link
                      href="/admin/wardrobe/schedule"
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                    >
                      <span>Edit</span>
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center mx-auto">
                <Calendar className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white">No upcoming published wardrobe schedule</h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Set up your monthly Sunday timetable or schedule a special program to keep all church members informed and aligned.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-3">
                <Link
                  href="/admin/wardrobe/schedule"
                  className="px-5 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 transition-all shadow-md"
                >
                  Schedule Next Service
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Quick Hub Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link
            href="/admin/wardrobe/schedule"
            className="group p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/50 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span>Timetable &amp; Schedules</span>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Monthly Sunday generator, special programs, Draft/Published toggles, and schedule calendar.
            </p>
          </Link>

          <Link
            href="/admin/wardrobe/outfits"
            className="group p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span>Visual Outfit Builder</span>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Compose complete outfits with layered clothing items, color swatches, and styling notes.
            </p>
          </Link>

          <Link
            href="/admin/wardrobe/catalogue"
            className="group p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-violet-500/50 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Tag className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span>Clothing Catalogue</span>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Manage reusable clothing categories, clothing pieces, color swatches, and images.
            </p>
          </Link>
        </div>

        {/* Upcoming Published Timetable List */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Upcoming Published Wardrobe Schedules
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                What members currently see on their dashboards and timetable.
              </p>
            </div>
            <Link
              href="/admin/wardrobe/schedule"
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <span>View Full Calendar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {upcomingSchedules.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {upcomingSchedules.map((s) => (
                <div
                  key={s.id}
                  className="group p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/80 hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(s.scheduledDate)}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {getDaysUntil(s.scheduledDate)}
                      </span>
                    </div>

                    <div className="flex items-start gap-3">
                      {/* Mini Thumbnail */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 border border-slate-300/60 dark:border-slate-700">
                        <img
                          src={getOutfitImage(s)}
                          alt={s.outfit?.title || s.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {s.outfit?.title || s.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{s.title}</p>
                        <span className="inline-block text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1">
                          {s.eventType?.replace('_', ' ') || 'Sunday Service'}
                        </span>
                      </div>
                    </div>

                    {/* Outfit Component Pills */}
                    {s.outfit?.items && s.outfit.items.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {s.outfit.items.slice(0, 3).map((it: any) => (
                          <span
                            key={it.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                          >
                            {it.variant?.colorCode && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: it.variant.colorCode }}
                              />
                            )}
                            <span className="truncate max-w-[100px]">{it.item?.name}</span>
                          </span>
                        ))}
                        {s.outfit.items.length > 3 && (
                          <span className="text-[10px] text-slate-400 font-semibold self-center">
                            +{s.outfit.items.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">
                      {s.outfit?.items?.length || 0} Prescribed Items
                    </span>
                    <Link
                      href={`/admin/wardrobe/schedule`}
                      className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1"
                    >
                      <span>Manage</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              No published upcoming wardrobe events. Click &quot;Timetable Manager&quot; to schedule or publish.
            </div>
          )}
        </div>
      </div>
    </AdminLayoutShell>
  );
}
