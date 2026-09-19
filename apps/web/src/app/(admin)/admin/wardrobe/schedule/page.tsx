'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Wand2,
  Tag,
  Shirt
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { useAuth, canCreateWardrobe } from '@/lib/auth';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';

interface OutfitItemLayer {
  id?: string;
  variant?: {
    colorName: string;
    colorHex?: string;
    imageUrl?: string;
  };
  item?: {
    name: string;
    category: string;
    imageUrl?: string;
  };
}

interface WardrobeOutfit {
  id: string;
  title: string;
  description?: string;
  gender: string;
  coverImageUrl?: string;
  isTemplate: boolean;
  items: OutfitItemLayer[];
}

interface WardrobeSchedule {
  id: string;
  title: string;
  eventType: string;
  scheduledDate: string;
  notes?: string;
  status: 'DRAFT' | 'PUBLISHED';
  meetingId?: string;
  outfit: WardrobeOutfit;
  meeting?: {
    id: string;
    title: string;
    scheduledAt: string;
  };
}

const EVENT_TYPES = [
  { value: 'SUNDAY_SERVICE', label: 'Sunday Service' },
  { value: 'SPECIAL_PROGRAM', label: 'Special Program / Event' },
  { value: 'YOUTH_CONVENTION', label: 'Youth Convention' },
  { value: 'THANKSGIVING', label: 'Thanksgiving Service' },
  { value: 'CONFERENCE', label: 'Conference / Summit' },
  { value: 'RETREAT', label: 'Retreat / Vigil' },
  { value: 'CHOIR_ANNIVERSARY', label: 'Choir Anniversary' },
  { value: 'OTHER', label: 'Other Event' }
];

export default function WardrobeSchedulePage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<WardrobeSchedule[]>([]);
  const [outfits, setOutfits] = useState<WardrobeOutfit[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date / Month state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Single Schedule CRUD
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WardrobeSchedule | null>(null);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleEventType, setScheduleEventType] = useState('SUNDAY_SERVICE');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleOutfitId, setScheduleOutfitId] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [submittingSchedule, setSubmittingSchedule] = useState(false);

  // Modal State for Bulk Monthly Generator
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkYear, setBulkYear] = useState(() => new Date().getFullYear());
  const [bulkMonth, setBulkMonth] = useState(() => new Date().getMonth() + 1);
  const [bulkOutfitId, setBulkOutfitId] = useState('');
  const [bulkStatus, setBulkStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [submittingBulk, setSubmittingBulk] = useState(false);

  // Detail Modal
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<WardrobeSchedule | null>(null);

  // Feedback Notification
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchScheduleData = useCallback(async () => {
    try {
      setLoading(true);
      const [schedulesRes, outfitsRes] = await Promise.all([
        apiRequest<any>('/admin/wardrobe/schedules'),
        apiRequest<any>('/admin/wardrobe/outfits')
      ]);
      const schedList = Array.isArray(schedulesRes?.data) ? schedulesRes.data : Array.isArray(schedulesRes) ? schedulesRes : [];
      const outfitList = Array.isArray(outfitsRes?.data) ? outfitsRes.data : Array.isArray(outfitsRes) ? outfitsRes : [];
      setSchedules(schedList);
      setOutfits(outfitList);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load wardrobe schedules' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduleData();
  }, [fetchScheduleData]);

  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const openCreateScheduleModal = () => {
    setEditingSchedule(null);
    setScheduleTitle('Sunday Service');
    setScheduleEventType('SUNDAY_SERVICE');
    setScheduleDate(new Date().toISOString().slice(0, 16));
    setScheduleOutfitId(outfits[0]?.id || '');
    setScheduleNotes('');
    setScheduleStatus('PUBLISHED');
    setIsScheduleModalOpen(true);
  };

  const openEditScheduleModal = (sched: WardrobeSchedule) => {
    setEditingSchedule(sched);
    setScheduleTitle(sched.title);
    setScheduleEventType(sched.eventType);
    setScheduleDate(new Date(sched.scheduledDate).toISOString().slice(0, 16));
    setScheduleOutfitId(sched.outfit.id);
    setScheduleNotes(sched.notes || '');
    setScheduleStatus(sched.status);
    setIsScheduleModalOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleTitle.trim() || !scheduleDate || !scheduleOutfitId) {
      setMessage({ type: 'error', text: 'Title, Date, and Outfit are required' });
      return;
    }

    try {
      setSubmittingSchedule(true);
      const payload = {
        title: scheduleTitle,
        eventType: scheduleEventType,
        scheduledDate: new Date(scheduleDate).toISOString(),
        outfitId: scheduleOutfitId,
        notes: scheduleNotes || undefined,
        status: scheduleStatus
      };

      if (editingSchedule) {
        await apiRequest(`/admin/wardrobe/schedules/${editingSchedule.id}`, {
          method: 'PATCH',
          body: payload
        });
        setMessage({ type: 'success', text: `Updated schedule for ${scheduleTitle}` });
      } else {
        await apiRequest('/admin/wardrobe/schedules', {
          method: 'POST',
          body: payload
        });
        setMessage({ type: 'success', text: `Scheduled outfit for ${scheduleTitle}` });
      }

      setIsScheduleModalOpen(false);
      fetchScheduleData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save wardrobe schedule' });
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const handleTogglePublish = async (sched: WardrobeSchedule) => {
    const newStatus = sched.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await apiRequest(`/admin/wardrobe/schedules/${sched.id}`, {
        method: 'PATCH',
        body: { status: newStatus }
      });
      setMessage({
        type: 'success',
        text: `Schedule "${sched.title}" is now ${newStatus === 'PUBLISHED' ? 'Published' : 'Draft'}`
      });
      fetchScheduleData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update status' });
    }
  };

  const handleDeleteSchedule = async (sched: WardrobeSchedule) => {
    if (!confirm(`Are you sure you want to remove the wardrobe schedule for "${sched.title}"?`)) return;

    try {
      await apiRequest(`/admin/wardrobe/schedules/${sched.id}`, {
        method: 'DELETE'
      });
      setMessage({ type: 'success', text: `Removed schedule for "${sched.title}"` });
      fetchScheduleData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete schedule' });
    }
  };

  const handleGenerateMonthlySundays = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkOutfitId) {
      setMessage({ type: 'error', text: 'Please select a default outfit for monthly generation' });
      return;
    }

    try {
      setSubmittingBulk(true);
      const res = await apiRequest<{ data: WardrobeSchedule[] }>('/admin/wardrobe/schedules/bulk-monthly', {
        method: 'POST',
        body: {
          year: Number(bulkYear),
          month: Number(bulkMonth),
          defaultOutfitId: bulkOutfitId,
          status: bulkStatus
        }
      });
      setMessage({
        type: 'success',
        text: `Successfully generated ${res.data?.length || 'all'} Sunday wardrobe schedules for ${new Date(bulkYear, bulkMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`
      });
      setIsBulkModalOpen(false);
      fetchScheduleData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to generate monthly Sundays' });
    } finally {
      setSubmittingBulk(false);
    }
  };

  const getOutfitImage = (scheduleOrOutfit: any) => {
    const outfit = scheduleOrOutfit?.outfit || scheduleOrOutfit;
    if (outfit?.coverImageUrl) return outfit.coverImageUrl;
    const title = `${scheduleOrOutfit?.title || ''} ${outfit?.title || ''}`.toLowerCase();
    if (title.includes('native') || title.includes('traditional')) return '/wardrobe/native-all.jpg';
    if (title.includes('carton') || title.includes('red tie')) return '/wardrobe/carton-red-tie.jpg';
    if (title.includes('colour riot') || title.includes('color riot')) return '/wardrobe/colour-riot-suit.jpg';
    if (title.includes('lemon') || title.includes('lime')) return '/wardrobe/lemon-gown.jpg';
    if (title.includes('white native')) return '/wardrobe/white-native.jpg';
    if (title.includes('suspenders')) return '/wardrobe/black-suspenders.jpg';
    if (title.includes('blazer') || title.includes('bright')) return '/wardrobe/bright-blazer.jpg';
    return '/wardrobe/native-all.jpg';
  };

  const resolveColorHex = (colorHex?: string, colorName?: string, itemName?: string) => {
    if (colorHex && colorHex.startsWith('#') && colorHex !== '#A855F7' && colorHex !== '#CBD5E1') {
      return colorHex;
    }
    const text = `${colorName || ''} ${itemName || ''}`.toLowerCase();
    if (text.includes('white') || text.includes('cream') || text.includes('ivory')) return '#F8FAFC';
    if (text.includes('black') || text.includes('midnight') || text.includes('dark')) return '#0F172A';
    if (text.includes('carton') || text.includes('tan') || text.includes('khaki') || text.includes('beige') || text.includes('brown')) return '#C29B38';
    if (text.includes('red') || text.includes('crimson') || text.includes('burgundy') || text.includes('maroon') || text.includes('wine')) return '#DC2626';
    if (text.includes('blue') || text.includes('navy') || text.includes('royal')) return '#1E40AF';
    if (text.includes('green') || text.includes('emerald') || text.includes('olive') || text.includes('mint')) return '#16A34A';
    if (text.includes('lemon') || text.includes('lime') || text.includes('yellow')) return '#EAB308';
    if (text.includes('purple') || text.includes('violet') || text.includes('lilac')) return '#9333EA';
    if (text.includes('pink') || text.includes('coral') || text.includes('rose') || text.includes('peach')) return '#F43F5E';
    if (text.includes('gold') || text.includes('bronze') || text.includes('orange') || text.includes('amber')) return '#D97706';
    if (text.includes('grey') || text.includes('gray') || text.includes('silver')) return '#64748B';
    return colorHex || '#6366F1';
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

  // Filter schedules for current selected month/search
  const currentMonthYearStr = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const filteredSchedules = schedules.filter((s) => {
    const sDate = new Date(s.scheduledDate);
    const matchesMonth =
      sDate.getMonth() === currentDate.getMonth() && sDate.getFullYear() === currentDate.getFullYear();
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.outfit.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.eventType.toLowerCase().includes(searchQuery.toLowerCase());

    return (searchQuery ? matchesSearch : matchesMonth && matchesSearch) && matchesStatus;
  });

  return (
    <AdminLayoutShell activeHref="/admin/wardrobe/schedule">
      <div className="space-y-8 pb-12 max-w-7xl mx-auto">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/admin/wardrobe" className="hover:text-primary transition-colors flex items-center gap-1 font-medium">
              <ArrowLeft className="w-4 h-4" /> Wardrobe Hub
            </Link>
            <span>/</span>
            <span className="text-foreground font-semibold">Timetable & Schedule</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-blue-600 to-teal-600 bg-clip-text text-transparent">
            Wardrobe Timetable & Scheduler
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Assign visual outfits to Sunday services and special programs. Toggle between Draft and Published state
            to prepare future months without premature exposure.
          </p>
        </div>

        {canCreateWardrobe(user) && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                setBulkOutfitId(outfits[0]?.id || '');
                setIsBulkModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card hover:bg-muted font-semibold text-sm transition-colors shadow-xs"
            >
              <Wand2 className="w-4 h-4 text-primary" /> Auto-Generate Month Sundays
            </button>

            <button
              onClick={openCreateScheduleModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95 text-sm"
            >
              <Plus className="w-5 h-5" /> Schedule Outfit
            </button>
          </div>
        )}
      </div>

      {/* Alerts */}
      {message && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs hover:underline font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Month Navigator & Controls */}
      <div className="bg-card border rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Month Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-2xl border">
              <button
                onClick={handlePrevMonth}
                className="p-2 rounded-xl hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-4 text-base font-extrabold text-foreground min-w-[10rem] text-center">
                {currentMonthYearStr}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-xl hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleToday}
              className="px-3.5 py-2 rounded-xl border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Current Month
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search schedule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-background border rounded-xl text-xs focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-background border rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published Only</option>
              <option value="DRAFT">Drafts Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Schedule Timetable List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card border rounded-2xl p-5 h-28 animate-pulse space-y-3">
              <div className="h-5 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="bg-card border rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <CalendarIcon className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold">No Scheduled Wardrobe for {currentMonthYearStr}</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? 'No schedules match your search query.'
              : 'You can auto-generate all Sunday wardrobe slots with 1 click, or schedule a custom event outfit.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setBulkOutfitId(outfits[0]?.id || '');
                setIsBulkModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
            >
              <Wand2 className="w-4 h-4" /> Auto-Generate Sundays
            </button>
            <button
              onClick={openCreateScheduleModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold hover:bg-muted"
            >
              <Plus className="w-4 h-4" /> Add Special Event
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSchedules.map((sched) => {
            const dateObj = new Date(sched.scheduledDate);
            const isPublished = sched.status === 'PUBLISHED';
            const formattedTime = dateObj.toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' });
            const outfitImg = getOutfitImage(sched);
            const countdown = getDaysUntil(sched.scheduledDate);

            return (
              <div
                key={sched.id}
                className="group bg-card border rounded-3xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-6"
              >
                {/* Left side: Date Badge (Navy Blue) + Full Title & Info */}
                <div className="flex items-start sm:items-center gap-5 flex-1 min-w-0">
                  {/* Visual Date Badge (Navy Blue) */}
                  <div className="flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#0f172a] border border-blue-900/60 text-white shrink-0 shadow-md shadow-slate-950/15 group-hover:border-blue-700/80 transition-all overflow-hidden relative">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-400" />
                    <span className="text-[10px] sm:text-[11px] font-black uppercase text-sky-400 tracking-wider">
                      {dateObj.toLocaleDateString('default', { month: 'short' })}
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-white leading-none my-0.5 tracking-tight">
                      {dateObj.getDate()}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-300">
                      {dateObj.toLocaleDateString('default', { weekday: 'short' })}
                    </span>
                  </div>

                  {/* Title, Badges, and Notes */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2.5 py-0.5 rounded-lg bg-muted font-bold text-foreground border">
                        {sched.eventType.replace('_', ' ')}
                      </span>

                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-lg font-extrabold flex items-center gap-1 border ${
                          isPublished
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {isPublished ? <CheckCircle2 className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {sched.status}
                      </span>

                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                        {countdown}
                      </span>

                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <Clock className="w-3.5 h-3.5" /> {formattedTime}
                      </span>
                    </div>

                    <h3
                      onClick={() => setSelectedScheduleForDetail(sched)}
                      className="text-lg sm:text-xl font-bold text-foreground group-hover:text-primary transition-colors cursor-pointer leading-snug"
                    >
                      {sched.title}
                    </h3>

                    {sched.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-1 italic">{sched.notes}</p>
                    )}
                  </div>
                </div>

                {/* Right side: Outfit Pill Card + Action Buttons */}
                <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                  {/* Assigned Visual Outfit Card */}
                  <div
                    onClick={() => setSelectedScheduleForDetail(sched)}
                    className="w-full sm:w-80 p-2.5 rounded-2xl bg-muted/40 border border-muted/80 hover:border-primary/50 hover:bg-muted/70 cursor-pointer transition-all flex items-center gap-3 group/outfit shadow-2xs"
                  >
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shrink-0 bg-slate-900">
                      <img
                        src={outfitImg}
                        alt={sched.outfit.title}
                        className="w-full h-full object-cover group-hover/outfit:scale-110 transition-transform duration-500"
                      />
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                        <p className="text-xs font-bold text-foreground truncate group-hover/outfit:text-primary transition-colors">
                          {sched.outfit.title}
                        </p>
                      </div>

                      {/* Mini Swatches */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sched.outfit.items.slice(0, 4).map((i, idx) => {
                          const hex = resolveColorHex(i.variant?.colorHex, i.variant?.colorName, i.item?.name);
                          return (
                            <span
                              key={idx}
                              title={i.variant?.colorName || i.item?.name}
                              className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: hex }}
                            />
                          );
                        })}
                        <span className="text-[10px] font-semibold text-muted-foreground ml-0.5">
                          {sched.outfit.items.length} pieces • <span className="text-primary font-bold">Lookbook</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleTogglePublish(sched)}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                        isPublished
                          ? 'hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30'
                          : 'hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30'
                      }`}
                      title={isPublished ? 'Unpublish (Switch to Draft)' : 'Publish for Members'}
                    >
                      {isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{isPublished ? 'Unpublish' : 'Publish'}</span>
                    </button>

                    <button
                      onClick={() => openEditScheduleModal(sched)}
                      className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border"
                      title="Edit Schedule"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteSchedule(sched)}
                      className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors border border-transparent hover:border-destructive/20"
                      title="Delete Schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Single Schedule Form (Create / Edit) */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-[2rem] max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 border border-primary/20 shadow-xs">
                  {editingSchedule ? <Edit2 className="w-5 h-5" /> : <CalendarIcon className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    {editingSchedule ? 'Edit Wardrobe Schedule' : 'Schedule Wardrobe Outfit'}
                  </h3>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                    {editingSchedule ? `Updating "${editingSchedule.title}"` : 'Designate what members will wear for this service or special gathering.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                title="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
                {/* Event Title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Schedule / Sunday Title <span className="text-primary">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sunday 6th September: Carton Trousers, White Shirt & Red Tie"
                    value={scheduleTitle}
                    onChange={(e) => setScheduleTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                  />
                </div>

                {/* Event Type & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Event Type <span className="text-primary">*</span>
                    </label>
                    <select
                      value={scheduleEventType}
                      onChange={(e) => setScheduleEventType(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                    >
                      {EVENT_TYPES.map((et) => (
                        <option key={et.value} value={et.value}>
                          {et.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Date &amp; Time <span className="text-primary">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                    />
                  </div>
                </div>

                {/* Outfit Selection Gallery */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" /> Select Visual Outfit Template <span className="text-primary">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">Click card to select</span>
                  </div>

                  {outfits.length === 0 ? (
                    <p className="text-xs text-amber-600 p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-900">
                      No outfits found. Create an outfit template first in the Wardrobe hub.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1.5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                      {outfits.map((outfit) => {
                        const isSelected = scheduleOutfitId === outfit.id;
                        const outfitImg = getOutfitImage(outfit);
                        return (
                          <div
                            key={outfit.id}
                            onClick={() => setScheduleOutfitId(outfit.id)}
                            className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-primary/10 border-primary ring-2 ring-primary/40 shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                              <img
                                src={outfitImg}
                                alt={outfit.title}
                                className="w-14 h-14 rounded-xl object-cover border border-black/10 dark:border-white/10 shrink-0 bg-slate-900 shadow-2xs"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-slate-900 dark:text-white leading-snug line-clamp-2">
                                  {outfit.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                    {outfit.gender === 'ALL' ? 'All Members' : outfit.gender}
                                  </span>
                                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                    • {outfit.items.length} pieces
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? 'bg-primary border-primary text-white shadow-xs'
                                  : 'border-slate-300 dark:border-slate-700 bg-transparent'
                              }`}
                            >
                              {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Special Instructions / Dress Code Reminders
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please ensure dress shoes are polished. Gowns should be floor or knee length."
                    value={scheduleNotes}
                    onChange={(e) => setScheduleNotes(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none shadow-2xs"
                  />
                </div>

                {/* Status Switch */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">Publication Status</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Draft entries remain hidden from member dashboards until published.
                    </p>
                  </div>
                  <select
                    value={scheduleStatus}
                    onChange={(e) => setScheduleStatus(e.target.value as any)}
                    className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-extrabold text-slate-900 dark:text-white shadow-2xs focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="PUBLISHED">Published</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSchedule}
                  className="px-7 py-2.5 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 disabled:opacity-50 cursor-pointer"
                >
                  {submittingSchedule ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Confirm & Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Auto-Generate Bulk Monthly Sundays */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-[2rem] max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Auto-Generate Sundays</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Quick monthly timetable builder</p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateMonthlySundays} className="p-6 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                Automatically calculates every Sunday date of the selected month, generates schedule slots, and
                attaches your chosen default outfit. You can edit individual Sundays anytime afterwards.
              </p>

              {/* Month & Year */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">Month</label>
                  <select
                    value={bulkMonth}
                    onChange={(e) => setBulkMonth(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20"
                  >
                    {[
                      'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'
                    ].map((m, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">Year</label>
                  <input
                    type="number"
                    value={bulkYear}
                    onChange={(e) => setBulkYear(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Default Outfit */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Default Outfit Template <span className="text-primary">*</span>
                </label>
                <select
                  required
                  value={bulkOutfitId}
                  onChange={(e) => setBulkOutfitId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20"
                >
                  {outfits.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} ({o.gender})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Initial Status
                </label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20"
                >
                  <option value="PUBLISHED">Published (Immediately visible to members)</option>
                  <option value="DRAFT">Draft (Keep hidden until ready)</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBulk}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs hover:bg-primary/90 flex items-center gap-2 shadow-lg shadow-primary/25"
                >
                  <Wand2 className="w-4 h-4" />
                  {submittingBulk ? 'Generating...' : 'Generate Sunday Timetable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Visual Schedule Details & Breakdown (Editorial Lookbook Modal) */}
      {selectedScheduleForDetail && (() => {
        const detailImg = getOutfitImage(selectedScheduleForDetail);
        const isPub = selectedScheduleForDetail.status === 'PUBLISHED';
        const countdown = getDaysUntil(selectedScheduleForDetail.scheduledDate);
        const formattedDate = new Date(selectedScheduleForDetail.scheduledDate).toLocaleString('default', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-slate-950 border border-slate-800 text-white rounded-[2rem] max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
              
              {/* Header Bar */}
              <div className="p-6 pb-4 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-slate-900/40">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[11px] px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-extrabold uppercase tracking-wider">
                      {selectedScheduleForDetail.eventType.replace('_', ' ')}
                    </span>
                    <span
                      className={`text-[11px] px-3 py-1 rounded-full font-bold flex items-center gap-1.5 border ${
                        isPub
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isPub ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      {isPub ? 'Live on Member App' : 'Draft Mode'}
                    </span>
                    <span className="text-[11px] px-3 py-1 rounded-full bg-white/10 text-white border border-white/10 font-bold">
                      {countdown}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {selectedScheduleForDetail.title}
                  </h3>
                  <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mt-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
                    {formattedDate}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedScheduleForDetail(null)}
                  className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-all border border-white/5"
                  title="Close Modal"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                
                {/* Hero Editorial Lookbook Card */}
                <div className="relative w-full h-64 sm:h-72 rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl group">
                  <img
                    src={detailImg}
                    alt={selectedScheduleForDetail.outfit.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  {/* Subtle Gradient Framing */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent pointer-events-none" />

                  {/* Top Badges */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 pointer-events-none">
                    <div className="px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{selectedScheduleForDetail.outfit.gender === 'ALL' || !selectedScheduleForDetail.outfit.gender ? 'For All Members' : selectedScheduleForDetail.outfit.gender}</span>
                    </div>

                    <div className="px-3.5 py-1.5 rounded-full bg-indigo-950/80 backdrop-blur-md border border-indigo-500/40 text-indigo-300 text-xs font-black tracking-wide flex items-center gap-1.5 shadow-lg">
                      <Shirt className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Official Dress Code</span>
                    </div>
                  </div>

                  {/* Bottom Title on Artwork */}
                  <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3 pointer-events-none">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-0.5 block">
                        Prescribed Ensemble
                      </span>
                      <h4 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-md">
                        {selectedScheduleForDetail.outfit.title}
                      </h4>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white border border-white/20">
                      {selectedScheduleForDetail.outfit.items.length} Pieces
                    </span>
                  </div>
                </div>

                {/* Special Instructions / Notes Banner */}
                {selectedScheduleForDetail.notes && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <h5 className="text-xs font-black uppercase tracking-wider text-amber-400">
                        Dress Code Guidance &amp; Notes
                      </h5>
                      <p className="text-xs text-amber-100/90 leading-relaxed">
                        {selectedScheduleForDetail.notes}
                      </p>
                    </div>
                  </div>
                )}

                {/* Prescribed Attire Layers Breakdown */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" /> Prescribed Components &amp; Layers ({selectedScheduleForDetail.outfit.items.length})
                    </h4>
                    <span className="text-[11px] text-slate-400 font-medium">Standard Attire Blueprint</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedScheduleForDetail.outfit.items.map((layer, idx) => {
                      const hex = resolveColorHex(layer.variant?.colorHex, layer.variant?.colorName, layer.item?.name);
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border border-slate-800 bg-slate-900/70 hover:bg-slate-900 transition-all flex items-center gap-3.5 shadow-xs"
                        >
                          <div
                            className="w-10 h-10 rounded-xl border-2 border-white/20 shadow-md flex-shrink-0 flex items-center justify-center relative overflow-hidden"
                            style={{ backgroundColor: hex }}
                          >
                            <span className="text-[10px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] uppercase">
                              L{idx + 1}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-extrabold text-white line-clamp-1">
                              {layer.item?.name || 'Garment Piece'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-semibold text-slate-300">
                                {layer.variant?.colorName || 'Prescribed Color'}
                              </span>
                              {layer.item?.category && (
                                <>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-[10px] text-indigo-400 font-medium capitalize">
                                    {layer.item.category.replace(/_/g, ' ').toLowerCase()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Modal Footer Controls */}
              <div className="p-6 pt-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    handleTogglePublish(selectedScheduleForDetail);
                    setSelectedScheduleForDetail((prev) =>
                      prev ? { ...prev, status: prev.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' } : null
                    );
                  }}
                  className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    isPub
                      ? 'border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                      : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                  }`}
                >
                  {isPub ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{isPub ? 'Switch to Draft' : 'Publish to Members'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const sched = selectedScheduleForDetail;
                      setSelectedScheduleForDetail(null);
                      openEditScheduleModal(sched);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit Schedule
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedScheduleForDetail(null)}
                    className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                  >
                    Close Preview
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
      </div>
    </AdminLayoutShell>
  );
}
