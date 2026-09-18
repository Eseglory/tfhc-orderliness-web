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
            <Link href="/admin/wardrobe" className="hover:text-primary transition-colors flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Wardrobe Hub
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Timetable & Schedule</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-blue-600 to-teal-600 bg-clip-text text-transparent">
            Wardrobe Timetable & Monthly Scheduler
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Assign visual outfits to Sunday services and special programs. Toggle between Draft and Published state
            to prepare future months without premature exposure.
          </p>
        </div>

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
            const formattedDay = dateObj.toLocaleDateString('default', { weekday: 'short', day: 'numeric', month: 'short' });
            const formattedTime = dateObj.toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' });

            return (
              <div
                key={sched.id}
                className="group bg-card border rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
              >
                {/* Left: Date & Event details */}
                <div className="flex items-start gap-4 flex-1">
                  {/* Visual Date Badge */}
                  <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-indigo-500/10 border border-primary/20 text-foreground flex-shrink-0">
                    <span className="text-[10px] font-black uppercase text-primary tracking-wider">
                      {dateObj.toLocaleDateString('default', { month: 'short' })}
                    </span>
                    <span className="text-xl font-black leading-none">{dateObj.getDate()}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {dateObj.toLocaleDateString('default', { weekday: 'short' })}
                    </span>
                  </div>

                  {/* Title & Metadata */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2.5 py-0.5 rounded-lg bg-muted font-semibold text-foreground border">
                        {sched.eventType.replace('_', ' ')}
                      </span>

                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-lg font-bold flex items-center gap-1 ${
                          isPublished
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {isPublished ? <CheckCircle2 className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {sched.status}
                      </span>

                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formattedTime}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                      {sched.title}
                    </h3>

                    {sched.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-1 italic">{sched.notes}</p>
                    )}
                  </div>
                </div>

                {/* Center: Assigned Visual Outfit */}
                <div
                  onClick={() => setSelectedScheduleForDetail(sched)}
                  className="w-full md:w-80 p-3 rounded-2xl bg-muted/30 border border-muted/80 hover:border-primary/40 cursor-pointer transition-all flex items-center gap-3.5 group/outfit"
                >
                  {sched.outfit.coverImageUrl ? (
                    <img
                      src={sched.outfit.coverImageUrl}
                      alt={sched.outfit.title}
                      className="w-14 h-14 rounded-xl object-cover border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Shirt className="w-6 h-6 stroke-[1.5]" />
                    </div>
                  )}

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <p className="text-xs font-bold text-foreground line-clamp-1 group-hover/outfit:text-primary">
                        {sched.outfit.title}
                      </p>
                    </div>

                    {/* Mini Swatches */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {sched.outfit.items.slice(0, 4).map((i, idx) => (
                        <span
                          key={idx}
                          title={i.variant?.colorName || i.item?.name}
                          className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                          style={{ backgroundColor: i.variant?.colorHex || '#CBD5E1' }}
                        />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {sched.outfit.items.length} pieces
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => handleTogglePublish(sched)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      isPublished
                        ? 'hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30'
                        : 'hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30'
                    }`}
                    title={isPublished ? 'Unpublish (Switch to Draft)' : 'Publish for Members'}
                  >
                    {isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{isPublished ? 'Unpublish' : 'Publish'}</span>
                  </button>

                  <button
                    onClick={() => openEditScheduleModal(sched)}
                    className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit Schedule"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteSchedule(sched)}
                    className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete Schedule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Single Schedule Form */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-xl font-bold">
                  {editingSchedule ? `Edit Schedule "${editingSchedule.title}"` : 'Schedule Wardrobe Outfit'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Designate what members will wear for this service or special gathering.
                </p>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              {/* Event Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Event / Service Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday Celebration Service, Youth Convention, Thanksgiving"
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 font-medium"
                />
              </div>

              {/* Event Type & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Event Type
                  </label>
                  <select
                    value={scheduleEventType}
                    onChange={(e) => setScheduleEventType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Assigned Outfit Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Select Required Outfit *
                  </label>
                  <Link
                    href="/admin/wardrobe/outfits"
                    target="_blank"
                    className="text-[11px] text-primary hover:underline"
                  >
                    + Compose New Outfit
                  </Link>
                </div>

                {outfits.length === 0 ? (
                  <p className="text-xs text-destructive p-3 rounded-xl border bg-destructive/10">
                    No outfits available. Please create outfits in the Outfit Builder first.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 max-h-48 overflow-y-auto p-2 bg-muted/20 border rounded-2xl">
                    {outfits.map((outfit) => {
                      const isSelected = scheduleOutfitId === outfit.id;
                      return (
                        <div
                          key={outfit.id}
                          onClick={() => setScheduleOutfitId(outfit.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-primary/10 border-primary shadow-xs'
                              : 'bg-card hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {outfit.coverImageUrl ? (
                              <img
                                src={outfit.coverImageUrl}
                                alt={outfit.title}
                                className="w-10 h-10 rounded-lg object-cover border"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                <Shirt className="w-5 h-5" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-foreground">{outfit.title}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {outfit.gender} • {outfit.items.length} pieces
                              </p>
                            </div>
                          </div>

                          <span
                            className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              isSelected ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/40'
                            }`}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Special Instructions / Reminders
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Please ensure dress shoes are polished. Gowns should be floor or knee length."
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              {/* Status Switch */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border">
                <div>
                  <p className="text-xs font-bold text-foreground">Publication Status</p>
                  <p className="text-[11px] text-muted-foreground">
                    Draft entries remain hidden from member dashboards until published.
                  </p>
                </div>
                <select
                  value={scheduleStatus}
                  onChange={(e) => setScheduleStatus(e.target.value as any)}
                  className="px-3 py-1.5 bg-background border rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20"
                >
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSchedule}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
                >
                  {submittingSchedule ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Auto-Generate Bulk Monthly Sundays */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold">Auto-Generate Monthly Sundays</h3>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateMonthlySundays} className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Automatically calculates every Sunday date of the selected month, generates schedule slots, and
                attaches your chosen default outfit. You can edit individual Sundays anytime afterwards.
              </p>

              {/* Month & Year */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month</label>
                  <select
                    value={bulkMonth}
                    onChange={(e) => setBulkMonth(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20"
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
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year</label>
                  <input
                    type="number"
                    value={bulkYear}
                    onChange={(e) => setBulkYear(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Default Outfit */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Default Outfit Template *
                </label>
                <select
                  required
                  value={bulkOutfitId}
                  onChange={(e) => setBulkOutfitId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20"
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Initial Status
                </label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20"
                >
                  <option value="PUBLISHED">Published (Immediately visible to members)</option>
                  <option value="DRAFT">Draft (Keep hidden until ready)</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBulk}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 flex items-center gap-2 shadow-md shadow-primary/20"
                >
                  <Wand2 className="w-4 h-4" />
                  {submittingBulk ? 'Generating...' : 'Generate Sunday Timetable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Visual Schedule Details & Breakdown */}
      {selectedScheduleForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <span className="text-xs px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold uppercase tracking-wider">
                  {selectedScheduleForDetail.eventType.replace('_', ' ')}
                </span>
                <h3 className="text-xl font-bold mt-1">{selectedScheduleForDetail.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {new Date(selectedScheduleForDetail.scheduledDate).toLocaleString('default', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedScheduleForDetail(null)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Outfit Header */}
            <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
              {selectedScheduleForDetail.outfit.coverImageUrl ? (
                <img
                  src={selectedScheduleForDetail.outfit.coverImageUrl}
                  alt={selectedScheduleForDetail.outfit.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/60">
                  <Shirt className="w-12 h-12 stroke-[1.25]" />
                  <span className="text-xs font-semibold tracking-wider uppercase">Visual Outfit Ensemble</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-4 right-4">
                <h4 className="text-lg font-extrabold text-white">{selectedScheduleForDetail.outfit.title}</h4>
              </div>
            </div>

            {/* Pieces */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-primary" /> Outfit Components ({selectedScheduleForDetail.outfit.items.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {selectedScheduleForDetail.outfit.items.map((layer, idx) => (
                  <div key={idx} className="p-3 rounded-xl border bg-muted/30 flex items-center gap-3">
                    <span
                      className="w-5 h-5 rounded-full border border-black/20 shadow-xs flex-shrink-0"
                      style={{ backgroundColor: layer.variant?.colorHex || '#CBD5E1' }}
                    />
                    <div>
                      <p className="text-xs font-bold text-foreground">{layer.item?.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {layer.variant?.colorName || 'Default'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedScheduleForDetail(null)}
                className="px-6 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayoutShell>
  );
}
