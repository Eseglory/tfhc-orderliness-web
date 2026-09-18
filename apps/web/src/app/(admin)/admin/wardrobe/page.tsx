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
        <div className="rounded-3xl bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-indigo-900/40 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Next Scheduled Wardrobe (Member View)</span>
              </div>

              {nextSchedule ? (
                <>
                  <h2 className="text-2xl sm:text-4xl font-black tracking-tight">
                    {nextSchedule.outfit?.title || nextSchedule.title}
                  </h2>
                  <p className="text-sm sm:text-base text-indigo-200/90 font-medium">
                    {nextSchedule.title} • <span className="font-bold text-white">{formatDate(nextSchedule.scheduledDate)}</span>
                  </p>
                  {nextSchedule.instructions && (
                    <p className="text-xs sm:text-sm text-slate-300 bg-white/5 p-3 rounded-xl border border-white/10 max-w-xl">
                      💡 {nextSchedule.instructions}
                    </p>
                  )}

                  {/* Components Breakdown */}
                  {nextSchedule.outfit?.items && nextSchedule.outfit.items.length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {nextSchedule.outfit.items.map((it: any) => (
                        <div
                          key={it.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs text-xs font-medium"
                        >
                          {it.variant?.colorCode && (
                            <span
                              className="w-3 h-3 rounded-full border border-white/40 shrink-0"
                              style={{ backgroundColor: it.variant.colorCode }}
                            />
                          )}
                          <span>{it.item?.name}</span>
                          {it.variant && (
                            <span className="text-indigo-300 font-semibold">• {it.variant.colorName}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-4">
                  <h2 className="text-xl sm:text-2xl font-bold">No upcoming published wardrobe schedule</h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Set up your monthly Sunday timetable or schedule a special program to keep members informed.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
              <Link
                href="/admin/wardrobe/schedule"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 transition-all shadow-md active:scale-95"
              >
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>Open Timetable Scheduler</span>
              </Link>
              <Link
                href="/admin/wardrobe/outfits"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-xs transition-all active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span>Manage Outfits</span>
              </Link>
            </div>
          </div>
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
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      <span>{formatDate(s.scheduledDate)}</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Published
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {s.outfit?.title || s.title}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-1">{s.title}</p>

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
                            <span>{it.item?.name}</span>
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

                  <div className="pt-4 mt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{s.eventType?.replace('_', ' ') || 'Service'}</span>
                    <Link
                      href={`/admin/wardrobe/schedule`}
                      className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      Manage →
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
