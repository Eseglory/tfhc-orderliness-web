'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Shirt,
  Calendar,
  Layers,
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Info,
  ChevronRight,
  Palette,
  Table as TableIcon,
  Grid,
  User,
  Users,
  Check,
  Award,
  Crown,
  Flame,
  Maximize2
} from 'lucide-react';
import { fetchApi } from '@/lib/api';

interface Variant {
  id: string;
  colorName: string;
  colorCode?: string;
  imageUrl?: string;
}

interface Item {
  id: string;
  name: string;
  category: string;
  gender: string;
  imageUrl?: string;
}

interface OutfitItemLayer {
  id?: string;
  notes?: string;
  variant?: Variant;
  item?: Item;
}

interface WardrobeOutfit {
  id: string;
  title: string;
  description?: string;
  genderTarget: string;
  notes?: string;
  coverImageUrl?: string;
  items: OutfitItemLayer[];
}

interface WardrobeSchedule {
  id: string;
  title: string;
  eventType: string;
  scheduledDate: string;
  endDate?: string;
  instructions?: string;
  outfit: WardrobeOutfit;
}

// Fallback image mapping if not present in DB
const OUTFIT_IMAGE_FALLBACKS: Record<string, string> = {
  'sched-sept-20': '/wardrobe/native-all.jpg',
  'sched-sept-06': '/wardrobe/carton-red-tie.jpg',
  'sched-sept-13': '/wardrobe/bright-blazer.jpg',
  'sched-sept-27': '/wardrobe/colour-riot-suit.jpg',
  'sched-july-05': '/wardrobe/lemon-gown.jpg',
  'sched-july-19': '/wardrobe/native-all.jpg',
  'sched-aug-02': '/wardrobe/white-native.jpg',
  'sched-aug-09': '/wardrobe/black-suspenders.jpg',
  'sched-aug-16': '/wardrobe/native-all.jpg',
};

// Visual Theme Styling by Uniform Type
function getUniformVisualTheme(title: string, instructions: string = '') {
  const text = (title + ' ' + instructions).toLowerCase();

  if (text.includes('native') || text.includes('traditional')) {
    return {
      gradient: 'from-amber-950 via-[#3a1d08] to-[#1a0c03]',
      accentBg: 'bg-amber-500/20',
      accentText: 'text-amber-400',
      borderColor: 'border-amber-500/40',
      badgeBg: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950',
      tag: 'Regal Traditional Native',
      icon: Crown,
      pattern: 'bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:16px_16px] opacity-25',
    };
  }
  if (text.includes('colour riot') || text.includes('color riot')) {
    return {
      gradient: 'from-purple-950 via-[#350d36] to-[#120417]',
      accentBg: 'bg-pink-500/20',
      accentText: 'text-pink-400',
      borderColor: 'border-pink-500/40',
      badgeBg: 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white',
      tag: 'Colour Riot Corporate',
      icon: Sparkles,
      pattern: 'bg-[radial-gradient(#ec4899_1px,transparent_1px)] [background-size:16px_16px] opacity-25',
    };
  }
  if (text.includes('lemon') || text.includes('lime')) {
    return {
      gradient: 'from-lime-950 via-[#1e2d08] to-[#0a1202]',
      accentBg: 'bg-lime-500/20',
      accentText: 'text-lime-400',
      borderColor: 'border-lime-500/40',
      badgeBg: 'bg-gradient-to-r from-lime-500 to-emerald-500 text-slate-950',
      tag: '2024 Conference Uniform',
      icon: Award,
      pattern: 'bg-[radial-gradient(#84cc16_1px,transparent_1px)] [background-size:16px_16px] opacity-25',
    };
  }
  if (text.includes('carton') || text.includes('red tie')) {
    return {
      gradient: 'from-amber-950 via-[#26150a] to-[#130904]',
      accentBg: 'bg-red-500/20',
      accentText: 'text-red-400',
      borderColor: 'border-red-500/40',
      badgeBg: 'bg-gradient-to-r from-red-600 to-amber-600 text-white',
      tag: 'Carton Slacks & Red Tie',
      icon: Flame,
      pattern: 'bg-[radial-gradient(#ef4444_1px,transparent_1px)] [background-size:16px_16px] opacity-25',
    };
  }
  if (text.includes('blazer') || text.includes('bright')) {
    return {
      gradient: 'from-blue-950 via-[#0e1f3d] to-[#060c18]',
      accentBg: 'bg-blue-500/20',
      accentText: 'text-blue-400',
      borderColor: 'border-blue-500/40',
      badgeBg: 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white',
      tag: 'Statement Blazer & Black Slacks',
      icon: Layers,
      pattern: 'bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px] opacity-25',
    };
  }
  if (text.includes('suspenders')) {
    return {
      gradient: 'from-slate-900 via-[#161c28] to-[#090c12]',
      accentBg: 'bg-slate-500/20',
      accentText: 'text-slate-300',
      borderColor: 'border-slate-500/40',
      badgeBg: 'bg-slate-100 text-slate-950',
      tag: 'Black Slacks & Suspenders',
      icon: Shirt,
      pattern: 'bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:16px_16px] opacity-20',
    };
  }
  return {
    gradient: 'from-slate-950 via-[#0f172a] to-[#020617]',
    accentBg: 'bg-primary/20',
    accentText: 'text-primary',
    borderColor: 'border-primary/40',
    badgeBg: 'bg-primary text-white',
    tag: 'Formal Corporate Uniform',
    icon: Shirt,
    pattern: 'bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px] opacity-20',
  };
}

export default function MemberWardrobePage() {
  const [nextSchedule, setNextSchedule] = useState<WardrobeSchedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<WardrobeSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOutfitModal, setSelectedOutfitModal] = useState<WardrobeSchedule | null>(null);
  const [viewTab, setViewTab] = useState<'roster_board' | 'weekly_list'>('roster_board');
  const [selectedMonth, setSelectedMonth] = useState<'SEPTEMBER' | 'AUGUST' | 'JULY' | 'ALL'>('SEPTEMBER');

  const fetchWardrobeData = useCallback(async () => {
    try {
      setLoading(true);
      const [nextRes, allRes] = await Promise.all([
        fetchApi<any>('/wardrobe/next').catch(() => null),
        fetchApi<any>('/wardrobe/upcoming?all=true').catch(() => [])
      ]);

      const nextItem = nextRes?.data || nextRes || null;
      const allItems = Array.isArray(allRes?.data)
        ? allRes.data
        : Array.isArray(allRes)
          ? allRes
          : [];

      setNextSchedule(nextItem);
      setAllSchedules(allItems);
    } catch (err) {
      // Handled gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWardrobeData();
  }, [fetchWardrobeData]);

  // Group schedules by month
  const schedulesByMonth = useMemo(() => {
    const july: WardrobeSchedule[] = [];
    const august: WardrobeSchedule[] = [];
    const september: WardrobeSchedule[] = [];

    allSchedules.forEach((s) => {
      const d = new Date(s.scheduledDate);
      const month = d.getUTCMonth(); // 6=July, 7=August, 8=September
      if (month === 6) july.push(s);
      else if (month === 7) august.push(s);
      else if (month === 8) september.push(s);
    });

    const sortByDate = (a: WardrobeSchedule, b: WardrobeSchedule) =>
      new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();

    return {
      july: july.sort(sortByDate),
      august: august.sort(sortByDate),
      september: september.sort(sortByDate),
    };
  }, [allSchedules]);

  // Next theme styling
  const nextTheme = useMemo(() => {
    if (!nextSchedule) return null;
    return getUniformVisualTheme(nextSchedule.outfit.title, nextSchedule.instructions);
  }, [nextSchedule]);

  // Filtered schedules for list view
  const displayedSchedules = useMemo(() => {
    if (selectedMonth === 'SEPTEMBER') return schedulesByMonth.september;
    if (selectedMonth === 'AUGUST') return schedulesByMonth.august;
    if (selectedMonth === 'JULY') return schedulesByMonth.july;
    return allSchedules;
  }, [selectedMonth, schedulesByMonth, allSchedules]);

  const getGenderBreakdown = (text: string = '', notes: string = '') => {
    const fullText = (text + ' ' + notes).trim();
    let ladies = '';
    let men = '';

    if (fullText.includes('Ladies:') || fullText.includes('Sisters/Ladies:')) {
      const parts = fullText.split(/Men:|Brothers\/Men:/i);
      ladies = parts[0].replace(/•?\s*Sisters\/Ladies:|•?\s*Ladies:/gi, '').trim();
      if (parts[1]) men = parts[1].trim();
    } else if (fullText.toLowerCase().includes('for all')) {
      ladies = 'All sisters wear standard prescribed uniform attire.';
      men = 'All brothers wear standard prescribed uniform attire.';
    } else {
      ladies = fullText;
      men = fullText;
    }

    return { ladies, men };
  };

  const getOutfitImage = (sched: WardrobeSchedule) => {
    return sched.outfit.coverImageUrl || OUTFIT_IMAGE_FALLBACKS[sched.id] || '/wardrobe/native-all.jpg';
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white pb-32 antialiased selection:bg-primary selection:text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 sm:px-8 backdrop-blur-xl shadow-xs">
        <div className="flex items-center gap-3.5">
          <Link
            href="/member"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-transform active:scale-95 shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> TFHC Orderliness Unit
            </span>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
              Uniform Roster &amp; Dress Guide
            </h1>
          </div>
        </div>

        {/* View Tabs Toggle */}
        <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-1 rounded-2xl border border-slate-300/50 dark:border-slate-700">
          <button
            onClick={() => setViewTab('roster_board')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
              viewTab === 'roster_board'
                ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Roster Board</span>
          </button>
          <button
            onClick={() => setViewTab('weekly_list')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
              viewTab === 'weekly_list'
                ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Weekly Cards</span>
          </button>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col gap-8 px-4 sm:px-8 py-6 max-w-6xl mx-auto">
        {/* =========================================================================
            FEATURED HERO: UPCOMING SERVICE DRESS CODE (WITH REAL CLOTHING PHOTO)
        ========================================================================= */}
        {nextSchedule && nextTheme && (
          <section className="relative group overflow-hidden rounded-[2.5rem] border-2 border-primary/30 bg-gradient-to-br shadow-2xl transition-all duration-300">
            {/* Background Layer with Motif */}
            <div className={`absolute inset-0 bg-gradient-to-br ${nextTheme.gradient}`} />
            <div className={`absolute inset-0 ${nextTheme.pattern}`} />

            {/* Glowing Orbs */}
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/25 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 p-6 sm:p-9 text-white space-y-7">
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/15 pb-5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-md animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" /> This Sunday&apos;s Dress Code
                    </span>
                    <span className={`px-3 py-1 rounded-full ${nextTheme.badgeBg} text-[10px] font-black uppercase tracking-wider shadow-xs`}>
                      {nextTheme.tag}
                    </span>
                  </div>

                  <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white drop-shadow-md">
                    {nextSchedule.title}
                  </h2>
                </div>

                {/* Date Pill */}
                <div className="flex items-center gap-3.5 bg-white/10 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/20 shadow-inner self-start sm:self-auto">
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-amber-300">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-black text-white/70 block">Service Date</span>
                    <span className="text-sm font-black text-white">
                      {new Date(nextSchedule.scheduledDate).toLocaleDateString('default', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'UTC'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Content: Real Clothing Photo (Left) & Directives (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-center">
                {/* Real Cloth Showcase Photo (5 cols) */}
                <div className="lg:col-span-5">
                  <div
                    onClick={() => setSelectedOutfitModal(nextSchedule)}
                    className="group/photo relative w-full h-72 sm:h-80 rounded-3xl overflow-hidden border-2 border-white/25 shadow-2xl cursor-pointer"
                  >
                    <img
                      src={getOutfitImage(nextSchedule)}
                      alt={nextSchedule.outfit.title}
                      className="w-full h-full object-cover group-hover/photo:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white">
                      <div>
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[9px] uppercase tracking-wider block mb-1">
                          Official Attire Model
                        </span>
                        <p className="text-sm font-black text-white drop-shadow-md truncate">
                          {nextSchedule.outfit.title}
                        </p>
                      </div>
                      <span className="p-2 rounded-xl bg-black/50 backdrop-blur-md border border-white/20 text-white group-hover/photo:bg-white group-hover/photo:text-slate-950 transition-colors">
                        <Maximize2 className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Directives & Pieces (7 cols) */}
                <div className="lg:col-span-7 space-y-5">
                  {/* Sisters & Brothers Dual Directive Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Sisters Card */}
                    <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 p-4 space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-pink-500/30 text-pink-200 border border-pink-400/40 text-[11px] font-black uppercase tracking-wider">
                          <Sparkles className="w-3 h-3 text-pink-300" /> Sisters
                        </span>
                        <span className="text-[10px] text-white/60 font-semibold">Attire Guide</span>
                      </div>

                      <p className="text-xs font-semibold text-white/95 leading-relaxed">
                        {getGenderBreakdown(nextSchedule.instructions, nextSchedule.outfit.notes).ladies}
                      </p>
                    </div>

                    {/* Brothers Card */}
                    <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 p-4 space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-500/30 text-blue-200 border border-blue-400/40 text-[11px] font-black uppercase tracking-wider">
                          <Shirt className="w-3 h-3 text-blue-300" /> Brothers
                        </span>
                        <span className="text-[10px] text-white/60 font-semibold">Attire Guide</span>
                      </div>

                      <p className="text-xs font-semibold text-white/95 leading-relaxed">
                        {getGenderBreakdown(nextSchedule.instructions, nextSchedule.outfit.notes).men}
                      </p>
                    </div>
                  </div>

                  {/* Palette & Pieces Swatches */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                        <Palette className="w-4 h-4 text-amber-300" /> Required Components &amp; Palette Swatches
                      </span>
                      <span className="text-[11px] text-white/60">
                        {nextSchedule.outfit.items.length} Required Items
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {nextSchedule.outfit.items.map((layer, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-black/35 backdrop-blur-md border border-white/15 flex items-center gap-2.5 text-xs"
                        >
                          <span
                            className="w-4 h-4 rounded-full border-2 border-white shadow-md shrink-0"
                            style={{ backgroundColor: layer.variant?.colorCode || '#D97706' }}
                          />
                          <div className="min-w-0">
                            <p className="font-extrabold text-white truncate text-[11px]">{layer.item?.name}</p>
                            <p className="text-[9px] text-white/70 truncate">
                              {layer.notes || layer.variant?.colorName || 'Prescribed'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <button
                      onClick={() => setSelectedOutfitModal(nextSchedule)}
                      className="px-7 py-3 rounded-2xl bg-white text-slate-950 hover:bg-amber-100 font-black text-xs transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4 text-primary" /> View Complete Guidelines &amp; Model Photo
                    </button>

                    <p className="text-xs text-white/70 italic text-center sm:text-right">
                      Arrive 30 mins before service in full uniform.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =========================================================================
            VIEW 1: OFFICIAL ROSTER BOARD MATRIX (FAITHFUL TO CHART GRAPHIC)
        ========================================================================= */}
        {viewTab === 'roster_board' && (
          <section className="space-y-6 animate-in fade-in duration-300">
            {/* Roster Banner */}
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-700 via-emerald-600 via-purple-700 to-amber-600 p-7 text-white shadow-xl text-center space-y-2">
              <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
              <span className="text-[11px] font-black uppercase tracking-widest text-white/80 block">
                The Father&apos;s House Church • Orderliness Unit
              </span>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider drop-shadow-md">
                JULY, AUG. &amp; SEPT. ORDERLINESS UNIFORM ROSTER
              </h2>
              <p className="text-xs sm:text-sm text-white/95 max-w-2xl mx-auto font-medium leading-relaxed">
                Visual matrix timetable for Sunday services. Click on any date card to view complete outfit breakdowns and grooming notes.
              </p>
            </div>

            {/* Matrix Columns Table */}
            <div className="overflow-x-auto rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
              <table className="w-full border-collapse text-left text-xs min-w-[950px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="p-4 font-black uppercase text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 w-32 text-center text-xs">
                      Month
                    </th>
                    <th className="p-4 font-black uppercase text-white bg-blue-600 text-center w-1/5 shadow-inner">
                      <span className="text-sm block font-black">1st Sunday</span>
                      <span className="text-[10px] text-white/80 font-bold block mt-0.5">5th Jul / 2nd Aug / 6th Sept</span>
                    </th>
                    <th className="p-4 font-black uppercase text-white bg-slate-700 text-center w-1/5 shadow-inner">
                      <span className="text-sm block font-black">2nd Sunday</span>
                      <span className="text-[10px] text-white/80 font-bold block mt-0.5">12th Jul / 9th Aug / 13th Sept</span>
                    </th>
                    <th className="p-4 font-black uppercase text-white bg-purple-600 text-center w-1/5 shadow-inner">
                      <span className="text-sm block font-black">3rd Sunday</span>
                      <span className="text-[10px] text-white/80 font-bold block mt-0.5">19th Jul / 16th Aug / 20th Sept</span>
                    </th>
                    <th className="p-4 font-black uppercase text-white bg-red-600 text-center w-1/5 shadow-inner">
                      <span className="text-sm block font-black">4th Sunday</span>
                      <span className="text-[10px] text-white/80 font-bold block mt-0.5">26th Jul / 23rd Aug / 27th Sept</span>
                    </th>
                    <th className="p-4 font-black uppercase text-white bg-amber-500 text-center w-1/5 shadow-inner">
                      <span className="text-sm block font-black">5th Sunday</span>
                      <span className="text-[10px] text-white/90 font-bold block mt-0.5">30th August</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                  {/* July Row */}
                  <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-5 font-black text-center bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">
                      <span className="text-base font-black text-blue-600 dark:text-blue-400 block">July</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">4 Sundays</span>
                    </td>
                    {schedulesByMonth.july.map((sched) => {
                      const breakdown = getGenderBreakdown(sched.instructions, sched.outfit.notes);
                      const isNative = sched.instructions?.toLowerCase().includes('native');
                      const img = getOutfitImage(sched);

                      return (
                        <td
                          key={sched.id}
                          onClick={() => setSelectedOutfitModal(sched)}
                          className="p-3.5 align-top cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition-all border-r border-slate-100 dark:border-slate-800 space-y-2 group"
                        >
                          <div className="relative h-20 w-full rounded-xl overflow-hidden border mb-2 shadow-xs">
                            <img src={img} alt={sched.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <span className="absolute bottom-1 left-2 text-[10px] font-black text-white">
                              {new Date(sched.scheduledDate).getUTCDate()}th July
                            </span>
                          </div>

                          {isNative ? (
                            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-300 text-[11px] font-bold">
                              👑 Native for all members.
                            </div>
                          ) : (
                            <div className="space-y-1 text-[11px]">
                              {breakdown.ladies && (
                                <p className="text-pink-700 dark:text-pink-300 font-medium line-clamp-2">
                                  <strong className="text-pink-900 dark:text-pink-200">Ladies:</strong> {breakdown.ladies}
                                </p>
                              )}
                              {breakdown.men && (
                                <p className="text-blue-700 dark:text-blue-300 font-medium line-clamp-2">
                                  <strong className="text-blue-900 dark:text-blue-200">Men:</strong> {breakdown.men}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {/* Blank 5th Sunday */}
                    <td className="p-4 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-800/20 italic">
                      —
                    </td>
                  </tr>

                  {/* August Row */}
                  <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-5 font-black text-center bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400 block">August</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">5 Sundays</span>
                    </td>
                    {schedulesByMonth.august.map((sched) => {
                      const breakdown = getGenderBreakdown(sched.instructions, sched.outfit.notes);
                      const isNative = sched.instructions?.toLowerCase().includes('native');
                      const img = getOutfitImage(sched);

                      return (
                        <td
                          key={sched.id}
                          onClick={() => setSelectedOutfitModal(sched)}
                          className="p-3.5 align-top cursor-pointer hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-all border-r border-slate-100 dark:border-slate-800 space-y-2 group"
                        >
                          <div className="relative h-20 w-full rounded-xl overflow-hidden border mb-2 shadow-xs">
                            <img src={img} alt={sched.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <span className="absolute bottom-1 left-2 text-[10px] font-black text-white">
                              {new Date(sched.scheduledDate).getUTCDate()}th Aug
                            </span>
                          </div>

                          {isNative ? (
                            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-300 text-[11px] font-bold">
                              👑 {sched.instructions}
                            </div>
                          ) : (
                            <div className="space-y-1 text-[11px]">
                              {breakdown.ladies && (
                                <p className="text-pink-700 dark:text-pink-300 font-medium line-clamp-2">
                                  <strong className="text-pink-900 dark:text-pink-200">Ladies:</strong> {breakdown.ladies}
                                </p>
                              )}
                              {breakdown.men && (
                                <p className="text-blue-700 dark:text-blue-300 font-medium line-clamp-2">
                                  <strong className="text-blue-900 dark:text-blue-200">Men:</strong> {breakdown.men}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* September Row (Highlighted Active Month) */}
                  <tr className="bg-primary/5 dark:bg-primary/15 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors">
                    <td className="p-5 font-black text-center bg-primary text-white border-r border-primary/30 shadow-md">
                      <span className="text-base font-black block">September</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Active Month</span>
                    </td>
                    {schedulesByMonth.september.map((sched) => {
                      const breakdown = getGenderBreakdown(sched.instructions, sched.outfit.notes);
                      const isNext = nextSchedule?.id === sched.id;
                      const isNative = sched.instructions?.toLowerCase().includes('native');
                      const img = getOutfitImage(sched);

                      return (
                        <td
                          key={sched.id}
                          onClick={() => setSelectedOutfitModal(sched)}
                          className={`p-3.5 align-top cursor-pointer transition-all border-r border-primary/20 space-y-2 group ${
                            isNext ? 'bg-primary/10 dark:bg-primary/25 ring-2 ring-primary ring-inset' : 'hover:bg-primary/10'
                          }`}
                        >
                          <div className="relative h-20 w-full rounded-xl overflow-hidden border mb-2 shadow-md">
                            <img src={img} alt={sched.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                            <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between">
                              <span className="text-[10px] font-black text-white">
                                {new Date(sched.scheduledDate).getUTCDate()}th Sept
                              </span>
                              {isNext && (
                                <span className="px-1.5 py-0.2 rounded bg-red-600 text-white text-[8px] font-black uppercase">
                                  Next
                                </span>
                              )}
                            </div>
                          </div>

                          {isNative ? (
                            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 text-[11px] font-bold">
                              👑 Native for all members.
                            </div>
                          ) : (
                            <div className="space-y-1 text-[11px]">
                              {breakdown.ladies && (
                                <p className="text-pink-800 dark:text-pink-300 font-medium line-clamp-2">
                                  <strong className="text-pink-950 dark:text-pink-100">Ladies:</strong> {breakdown.ladies}
                                </p>
                              )}
                              {breakdown.men && (
                                <p className="text-blue-800 dark:text-blue-300 font-medium line-clamp-2">
                                  <strong className="text-blue-950 dark:text-blue-100">Men:</strong> {breakdown.men}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {/* Blank 5th Sunday */}
                    <td className="p-4 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-800/20 italic">
                      —
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* =========================================================================
            VIEW 2: WEEKLY CARDS VIEW (WITH REAL CLOTHING PHOTOS)
        ========================================================================= */}
        {viewTab === 'weekly_list' && (
          <section className="space-y-6 animate-in fade-in duration-300">
            {/* Header & Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Sunday Uniform Showcases
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a month tab to view each Sunday&apos;s prescribed wear and individual piece breakdown.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-200/80 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-300/50 dark:border-slate-700 self-start sm:self-auto">
                {(['SEPTEMBER', 'AUGUST', 'JULY', 'ALL'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(m)}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                      selectedMonth === m
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {m === 'SEPTEMBER' ? 'Sept (Active)' : m === 'ALL' ? 'All (13)' : m}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {displayedSchedules.map((sched) => {
                const theme = getUniformVisualTheme(sched.outfit.title, sched.instructions);
                const isNext = nextSchedule?.id === sched.id;
                const breakdown = getGenderBreakdown(sched.instructions, sched.outfit.notes);
                const dateObj = new Date(sched.scheduledDate);
                const img = getOutfitImage(sched);

                return (
                  <div
                    key={sched.id}
                    onClick={() => setSelectedOutfitModal(sched)}
                    className={`group relative overflow-hidden rounded-[2.2rem] border bg-white dark:bg-slate-900 shadow-lg hover:shadow-2xl transition-all cursor-pointer flex flex-col justify-between ${
                      isNext
                        ? 'border-primary ring-2 ring-primary/40'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    {/* Realistic Clothing Photo Banner */}
                    <div className="relative w-full h-52 sm:h-60 overflow-hidden bg-slate-950">
                      <img
                        src={img}
                        alt={sched.outfit.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />

                      {/* Top Badges */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full ${theme.badgeBg} text-[9px] font-black uppercase tracking-wider shadow-md`}>
                            {theme.tag}
                          </span>
                          {isNext && (
                            <span className="px-2.5 py-1 rounded-full bg-red-600 text-white text-[9px] font-black uppercase shadow-md animate-pulse">
                              This Sunday
                            </span>
                          )}
                        </div>

                        <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-black text-xs border border-white/20">
                          {dateObj.getUTCDate()} {dateObj.toLocaleString([], { month: 'short', timeZone: 'UTC' })}
                        </span>
                      </div>

                      {/* Bottom Title on Banner */}
                      <div className="absolute bottom-3 left-4 right-4">
                        <h4 className="text-lg font-black text-white leading-tight drop-shadow-md">
                          {sched.title}
                        </h4>
                      </div>
                    </div>

                    {/* Directives Body */}
                    <div className="p-5 space-y-4">
                      {/* Gender Breakdown Container */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 font-bold text-[10px] uppercase shrink-0 mt-0.5">
                            Ladies
                          </span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                            {breakdown.ladies}
                          </p>
                        </div>
                        <div className="flex items-start gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700">
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold text-[10px] uppercase shrink-0 mt-0.5">
                            Men
                          </span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                            {breakdown.men}
                          </p>
                        </div>
                      </div>

                      {/* Pieces Swatches & CTA */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div className="flex items-center gap-1.5">
                          {sched.outfit.items.slice(0, 5).map((layer, idx) => (
                            <span
                              key={idx}
                              title={`${layer.item?.name} (${layer.variant?.colorName || 'Standard'})`}
                              className="w-4 h-4 rounded-full border border-black/15 dark:border-white/30 shadow-xs"
                              style={{ backgroundColor: layer.variant?.colorCode || '#D97706' }}
                            />
                          ))}
                        </div>

                        <span className="text-xs font-black text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          <span>Inspect Full Guide</span>
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* =========================================================================
          HIGH FIDELITY DETAIL MODAL (WITH FULL RESOLUTION PHOTO SHOWCASE)
      ========================================================================= */}
      {selectedOutfitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto text-slate-900 dark:text-white">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="space-y-1">
                <span className="text-[10px] px-3 py-1 rounded-full bg-primary/10 text-primary font-black uppercase tracking-wider">
                  {selectedOutfitModal.eventType.replace('_', ' ')}
                </span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
                  {selectedOutfitModal.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold pt-1">
                  <Calendar className="w-4 h-4 text-primary" />
                  {new Date(selectedOutfitModal.scheduledDate).toLocaleDateString('default', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC'
                  })}
                </p>
              </div>

              <button
                onClick={() => setSelectedOutfitModal(null)}
                className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-transform active:scale-95"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Real Clothing Photograph Hero */}
            <div className="relative w-full h-64 sm:h-80 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md">
              <img
                src={getOutfitImage(selectedOutfitModal)}
                alt={selectedOutfitModal.outfit.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

              <div className="absolute bottom-4 left-5 right-5 text-white">
                <span className="px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[9px] font-black uppercase tracking-wider">
                  Official Attire Showcase
                </span>
                <h4 className="text-xl font-black text-white mt-1 leading-snug drop-shadow-md">
                  {selectedOutfitModal.outfit.title}
                </h4>
              </div>
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
              <span className="font-black text-slate-500 uppercase tracking-wider text-[10px] block mb-1">
                Styling Overview:
              </span>
              {selectedOutfitModal.instructions || selectedOutfitModal.outfit.description}
            </div>

            {/* Gender Requirements Side-by-Side */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" /> Specific Gender Requirements
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Sisters */}
                <div className="p-4 rounded-2xl bg-pink-50/70 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-900/60 space-y-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-pink-200 dark:bg-pink-900 text-pink-900 dark:text-pink-200 font-black text-[10px] uppercase">
                    Sisters / Ladies
                  </span>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                    {getGenderBreakdown(selectedOutfitModal.instructions, selectedOutfitModal.outfit.notes).ladies}
                  </p>
                </div>

                {/* Brothers */}
                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-200 font-black text-[10px] uppercase">
                    Brothers / Men
                  </span>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                    {getGenderBreakdown(selectedOutfitModal.instructions, selectedOutfitModal.outfit.notes).men}
                  </p>
                </div>
              </div>
            </div>

            {/* Required Pieces Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-primary" /> Required Pieces Checklist ({selectedOutfitModal.outfit.items.length} Items)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedOutfitModal.outfit.items.map((layer, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3.5 shadow-xs"
                  >
                    <span
                      className="w-8 h-8 rounded-xl border border-black/15 shadow-sm flex-shrink-0 flex items-center justify-center text-white"
                      style={{ backgroundColor: layer.variant?.colorCode || '#D97706' }}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </span>

                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {layer.item?.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {layer.notes || layer.variant?.colorName || 'Prescribed Item'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedOutfitModal(null)}
                className="px-7 py-3 rounded-2xl bg-primary text-white font-black text-xs hover:bg-primary/90 transition-transform active:scale-95 shadow-md"
              >
                Understood &amp; Ready
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
