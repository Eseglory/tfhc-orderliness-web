'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  MapPin,
  Flame,
  Radio,
  Repeat,
  Tag,
  ExternalLink,
  Filter,
  X,
  Check,
  Share2,
  CalendarDays,
  Layers,
  ChevronDown,
  Info,
  Video,
  Sparkles,
  Shield,
  HeartHandshake,
  ArrowRight,
  CalendarCheck,
  Globe,
  AlertTriangle,
  MoveHorizontal,
  XCircle,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useToast, Modal } from '../../../../components/ui';
import {
  EventForm,
  EventTypeOption,
  CategoryOption,
  emptyEvent,
} from '../../../../components/EventForm';

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';
type DomainType = 'EVENT' | 'MEETING' | 'APPOINTMENT' | 'OPERATIONS';
type SourceFilter = 'ALL' | 'GOOGLE_SYNCED' | 'INTERNAL_ONLY';

interface UnifiedCalendarItem {
  id: string;
  originalId: string;
  domainType: DomainType;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date | null;
  locationName: string;
  meetingUrl?: string | null;
  status: string;
  isCompulsory?: boolean;
  visibility?: string;
  isRecurring: boolean;
  categoryName: string;
  eventTypeName?: string;
  clientName?: string;
  providerName?: string;
  color: string;
  googleSynced?: boolean;
  googleHtmlLink?: string | null;
  attendeesCount?: number;
  raw: any;
}

const DOMAIN_STYLES: Record<
  DomainType,
  { bg: string; text: string; border: string; dot: string; label: string; badgeClass: string }
> = {
  EVENT: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800',
    dot: 'bg-indigo-600',
    label: 'Organized Event',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200',
  },
  MEETING: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-600',
    label: 'Staff / Sync Meeting',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200',
  },
  APPOINTMENT: {
    bg: 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
    label: 'Appointment Booking',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200',
  },
  OPERATIONS: {
    bg: 'bg-violet-50 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-800',
    dot: 'bg-violet-600',
    label: 'Operational Session',
    badgeClass: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-violet-200',
  },
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS_RANGE = Array.from({ length: 17 }, (_, i) => i + 6); // 6 AM to 10 PM (22:00)

export default function AdvancedCalendarPage() {
  const { user, can } = useAuth();
  const { notify } = useToast();

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<UnifiedCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Domain & Source filters
  const [showEvents, setShowEvents] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [showAppointments, setShowAppointments] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');

  // Google Calendar integration state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [syncingGoogle, setSyncingGoogle] = useState(false);

  // Selected item modal / drawer
  const [selectedEvent, setSelectedEvent] = useState<UnifiedCalendarItem | null>(null);

  // Reschedule & Conflict detection state
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<UnifiedCalendarItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('10:00');
  const [rescheduleEndTime, setRescheduleEndTime] = useState('11:00');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [savingReschedule, setSavingReschedule] = useState(false);

  // Create event modal
  const [formOpen, setFormOpen] = useState(false);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // Mini calendar state
  const [miniCalDate, setMiniCalDate] = useState<Date>(() => new Date());

  const canCreate = can('events.create');

  // Load Google integration status
  const loadGoogleStatus = async () => {
    try {
      const res = await fetchApi<{ connected: boolean; googleEmail?: string }>('/calendar/integrations/google/status');
      setGoogleConnected(Boolean(res?.connected));
      setGoogleEmail(res?.googleEmail || null);
    } catch {
      setGoogleConnected(false);
    }
  };

  const loadLookups = async () => {
    try {
      const [cats, types] = await Promise.all([
        fetchApi<CategoryOption[]>('/meetings/categories').catch(() => []),
        fetchApi<EventTypeOption[]>('/meetings/event-types').catch(() => []),
      ]);
      setCategories(cats || []);
      setEventTypes(types || []);
    } catch {}
  };

  const loadCalendarData = async (targetDate: Date) => {
    setLoading(true);
    try {
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const from = new Date(year, month - 1, 1).toISOString();
      const to = new Date(year, month + 2, 0).toISOString();

      const items = await fetchApi<any[]>(`/calendar/feed?from=${from}&to=${to}`);
      const parsed: UnifiedCalendarItem[] = (items || []).map((i) => ({
        ...i,
        startTime: new Date(i.startTime),
        endTime: i.endTime ? new Date(i.endTime) : null,
      }));
      setEvents(parsed);
    } catch (err: any) {
      notify({ title: 'Calendar Error', description: err.message || 'Failed to load unified calendar items', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
    loadGoogleStatus();
  }, []);

  useEffect(() => {
    loadCalendarData(currentDate);
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  const handleManualSync = async () => {
    setSyncingGoogle(true);
    try {
      await loadCalendarData(currentDate);
      await loadGoogleStatus();
      notify({ title: 'Synchronization Complete', description: 'Calendar feeds and Google Calendar status updated.', variant: 'default' });
    } catch (err: any) {
      notify({ title: 'Sync Failed', description: err.message || 'Could not sync with Google', variant: 'destructive' });
    } finally {
      setSyncingGoogle(false);
    }
  };

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() - 7);
    } else if (viewMode === 'day') {
      d.setDate(d.getDate() - 1);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    setCurrentDate(d);
    setMiniCalDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else if (viewMode === 'day') {
      d.setDate(d.getDate() + 1);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    setCurrentDate(d);
    setMiniCalDate(d);
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setMiniCalDate(now);
  };

  // Filtered items
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchLocation = e.locationName.toLowerCase().includes(q);
        const matchCategory = e.categoryName.toLowerCase().includes(q);
        const matchClient = e.clientName?.toLowerCase().includes(q);
        const matchProvider = e.providerName?.toLowerCase().includes(q);
        if (!matchTitle && !matchLocation && !matchCategory && !matchClient && !matchProvider) {
          return false;
        }
      }

      if (!showEvents && e.domainType === 'EVENT') return false;
      if (!showMeetings && e.domainType === 'MEETING') return false;
      if (!showAppointments && e.domainType === 'APPOINTMENT') return false;

      if (sourceFilter === 'GOOGLE_SYNCED' && !e.googleSynced) return false;
      if (sourceFilter === 'INTERNAL_ONLY' && e.googleSynced) return false;

      return true;
    });
  }, [events, search, showEvents, showMeetings, showAppointments, sourceFilter]);

  // Month grid calculation
  const monthData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: { date: Date; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean }[] = [];

    // Prev month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      cells.push({
        date: d,
        isCurrentMonth: false,
        isToday: d.toDateString() === new Date().toDateString(),
        isSelected: d.toDateString() === currentDate.toDateString(),
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      cells.push({
        date: dateObj,
        isCurrentMonth: true,
        isToday: dateObj.toDateString() === new Date().toDateString(),
        isSelected: dateObj.toDateString() === currentDate.toDateString(),
      });
    }

    // Next month padding
    while (cells.length % 7 !== 0 || cells.length < 35) {
      const nextD = new Date(year, month + 1, cells.length - (firstDayOfWeek + daysInMonth) + 1);
      cells.push({
        date: nextD,
        isCurrentMonth: false,
        isToday: nextD.toDateString() === new Date().toDateString(),
        isSelected: nextD.toDateString() === currentDate.toDateString(),
      });
    }

    return cells;
  }, [currentDate]);

  // Week view calculation
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const dayOfWeek = d.getDay();
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - dayOfWeek);

    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      return day;
    });
  }, [currentDate]);

  const openRescheduleModal = (item: UnifiedCalendarItem) => {
    setRescheduleTarget(item);
    const dateStr = item.startTime.toISOString().split('T')[0];
    const startStr = item.startTime.toTimeString().slice(0, 5);
    const endStr = item.endTime ? item.endTime.toTimeString().slice(0, 5) : '11:00';
    setRescheduleDate(dateStr);
    setRescheduleStartTime(startStr);
    setRescheduleEndTime(endStr);
    setRescheduleReason('');
    setConflictWarning(null);
    setRescheduleModalOpen(true);
  };

  const handleCheckConflict = async () => {
    if (!rescheduleDate || !rescheduleStartTime || !rescheduleEndTime || !rescheduleTarget) return;
    setCheckingConflict(true);
    setConflictWarning(null);
    try {
      const start = new Date(`${rescheduleDate}T${rescheduleStartTime}:00`);
      const end = new Date(`${rescheduleDate}T${rescheduleEndTime}:00`);
      const res = await fetchApi<{ hasConflict: boolean; conflictingItems: any[] }>(
        `/calendar/conflicts?startTime=${start.toISOString()}&endTime=${end.toISOString()}&excludeId=${rescheduleTarget.id}`,
      );
      if (res?.hasConflict && res.conflictingItems?.length > 0) {
        setConflictWarning(
          `Schedule overlap detected with: "${res.conflictingItems[0].title}" (${new Date(res.conflictingItems[0].startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        );
      } else {
        notify({ title: 'Slot Available', description: 'No calendar conflicts found for this requested time window.' });
      }
    } catch {
    } finally {
      setCheckingConflict(false);
    }
  };

  const handleSaveReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate) return;
    setSavingReschedule(true);
    try {
      const start = new Date(`${rescheduleDate}T${rescheduleStartTime}:00`);
      const end = new Date(`${rescheduleDate}T${rescheduleEndTime}:00`);

      await fetchApi('/calendar/reschedule', {
        method: 'PATCH',
        body: JSON.stringify({
          entityType: rescheduleTarget.domainType,
          entityId: rescheduleTarget.id,
          newStartTime: start.toISOString(),
          newEndTime: end.toISOString(),
          reason: rescheduleReason || undefined,
        }),
      });

      notify({ title: 'Rescheduled Successfully', description: `${rescheduleTarget.title} moved and synchronized.` });
      setRescheduleModalOpen(false);
      setSelectedEvent(null);
      await loadCalendarData(currentDate);
    } catch (err: any) {
      notify({ title: 'Reschedule Failed', description: err.message || 'Could not reschedule entity', variant: 'destructive' });
    } finally {
      setSavingReschedule(false);
    }
  };

  const handleExportICS = () => {
    if (!filteredEvents.length) {
      notify({ title: 'No Events', description: 'No calendar entries matching filters to export.', variant: 'destructive' });
      return;
    }

    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TFHC Orderliness//Unified Calendar System//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    filteredEvents.forEach((e) => {
      const dtStart = e.startTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const dtEnd = (e.endTime || new Date(e.startTime.getTime() + 3600000)).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      ics.push(
        'BEGIN:VEVENT',
        `UID:${e.id}@orderliness.tfhc.org`,
        `SUMMARY:[${e.domainType}] ${e.title}`,
        `DESCRIPTION:${e.categoryName} - Status: ${e.status}${e.meetingUrl ? '\\nMeeting: ' + e.meetingUrl : ''}`,
        `LOCATION:${e.locationName}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        'END:VEVENT',
      );
    });

    ics.push('END:VCALENDAR');

    const blob = new Blob([ics.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tfhc-unified-calendar-${currentDate.toISOString().slice(0, 7)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    notify({ title: 'Export Generated', description: 'Universal ICS calendar file downloaded.' });
  };

  const getEventsForDate = (date: Date) => {
    const dStr = date.toDateString();
    return filteredEvents.filter((e) => e.startTime.toDateString() === dStr);
  };

  const formattedMonthHeader = useMemo(() => {
    return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [currentDate]);

  return (
    <AdminLayoutShell>
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Top Control Bar */}
        <header className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 z-20">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Navigation & Date Header */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                <button
                  onClick={handlePrev}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-colors shadow-2xs"
                  title="Previous"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleToday}
                  className="px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors shadow-2xs"
                >
                  Today
                </button>
                <button
                  onClick={handleNext}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-colors shadow-2xs"
                  title="Next"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>{formattedMonthHeader}</span>
                {googleConnected && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                    <Check className="w-3 h-3 text-emerald-600" /> Google Synced
                  </span>
                )}
              </h1>
            </div>

            {/* Right: Search, Filters & View Mode Selector */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search events, clients, locations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 w-48 sm:w-64 transition-all"
                />
              </div>

              {/* Source Filter Dropdown */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              >
                <option value="ALL">All Sources</option>
                <option value="GOOGLE_SYNCED">Google Synced Only</option>
                <option value="INTERNAL_ONLY">Internal Only</option>
              </select>

              {/* View Switcher Tabs */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1 text-xs font-bold capitalize rounded-lg transition-all ${
                      viewMode === mode
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* Sync / Refresh */}
              <button
                onClick={handleManualSync}
                disabled={syncingGoogle || loading}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                title="Synchronize Google Calendar"
              >
                <RefreshCw className={`w-4 h-4 ${syncingGoogle ? 'animate-spin text-indigo-600' : ''}`} />
              </button>

              {/* Export ICS */}
              <button
                onClick={handleExportICS}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                title="Export .ICS universal calendar"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Schedule Action */}
              {canCreate && (
                <button
                  onClick={() => setFormOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs shadow-indigo-600/30 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create</span>
                </button>
              )}
            </div>
          </div>

          {/* Domain Filter Pills Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> Domains:
              </span>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showEvents}
                  onChange={(e) => setShowEvents(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  Events ({events.filter((e) => e.domainType === 'EVENT').length})
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showMeetings}
                  onChange={(e) => setShowMeetings(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  Meetings ({events.filter((e) => e.domainType === 'MEETING').length})
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAppointments}
                  onChange={(e) => setShowAppointments(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                />
                <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Appointments ({events.filter((e) => e.domainType === 'APPOINTMENT').length})
                </span>
              </label>
            </div>

            {/* Google Sync Status Link */}
            <div className="flex items-center gap-2">
              <Link
                href="/admin/settings"
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{googleConnected ? `Google Account: ${googleEmail}` : 'Connect Google Calendar'}</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Calendar Viewport */}
          <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 p-2 sm:p-4">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center space-y-3 py-24">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Loading temporal items...</p>
              </div>
            ) : viewMode === 'month' ? (
              /* ======================= MONTH VIEW ======================= */
              <div className="h-full flex flex-col border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-center text-xs font-bold text-slate-600 dark:text-slate-300 py-2.5">
                  {WEEKDAY_NAMES.map((name) => (
                    <div key={name}>{name}</div>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-px bg-slate-200 dark:bg-slate-800 overflow-y-auto">
                  {monthData.map((cell, idx) => {
                    const dayEvents = getEventsForDate(cell.date);
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setCurrentDate(cell.date);
                          if (dayEvents.length > 0) {
                            setSelectedEvent(dayEvents[0]);
                          }
                        }}
                        className={`min-h-[105px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors cursor-pointer ${
                          cell.isCurrentMonth
                            ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            : 'bg-slate-50/60 dark:bg-slate-950/40 text-slate-400 dark:text-slate-600'
                        } ${cell.isToday ? 'ring-2 ring-indigo-500 ring-inset z-10' : ''}`}
                      >
                        {/* Day Number */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              cell.isToday
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : cell.isCurrentMonth
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-400'
                            }`}
                          >
                            {cell.date.getDate()}
                          </span>

                          {dayEvents.length > 3 && (
                            <span className="text-[10px] font-bold text-slate-400 px-1 rounded bg-slate-100 dark:bg-slate-800">
                              +{dayEvents.length - 3}
                            </span>
                          )}
                        </div>

                        {/* Events list inside cell */}
                        <div className="flex-1 mt-1 space-y-1 overflow-hidden">
                          {dayEvents.slice(0, 3).map((item) => {
                            const style = DOMAIN_STYLES[item.domainType] || DOMAIN_STYLES.EVENT;
                            return (
                              <button
                                key={item.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEvent(item);
                                }}
                                className={`w-full text-left px-1.5 py-0.5 rounded-md border text-[11px] font-semibold truncate transition-transform active:scale-95 flex items-center gap-1 ${style.bg} ${style.border} ${style.text}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                                <span className="truncate">{item.title}</span>
                                {item.meetingUrl && <Video className="w-2.5 h-2.5 text-blue-600 shrink-0 ml-auto" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === 'week' ? (
              /* ======================= WEEK VIEW ======================= */
              <div className="h-full flex flex-col border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-center py-3">
                  {weekDays.map((d, i) => {
                    const isToday = d.toDateString() === new Date().toDateString();
                    return (
                      <div key={i} className="flex flex-col items-center">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {WEEKDAY_NAMES[d.getDay()]}
                        </span>
                        <span
                          className={`w-7 h-7 mt-1 rounded-full flex items-center justify-center text-sm font-bold ${
                            isToday ? 'bg-indigo-600 text-white' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex-1 grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 overflow-y-auto">
                  {weekDays.map((d, i) => {
                    const dayEvents = getEventsForDate(d);
                    return (
                      <div key={i} className="bg-white dark:bg-slate-900 p-2 space-y-2 min-h-[300px]">
                        {dayEvents.map((item) => {
                          const style = DOMAIN_STYLES[item.domainType] || DOMAIN_STYLES.EVENT;
                          return (
                            <div
                              key={item.id}
                              onClick={() => setSelectedEvent(item)}
                              className={`p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all hover:shadow-md ${style.bg} ${style.border}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-extrabold text-[10px] uppercase tracking-wider">{style.label}</span>
                                {item.googleSynced && <span className="text-[10px] text-emerald-600 font-bold">✓ Synced</span>}
                              </div>
                              <p className="font-bold text-slate-900 dark:text-white line-clamp-2">{item.title}</p>
                              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {item.meetingUrl && (
                                <a
                                  href={item.meetingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-bold"
                                >
                                  <Video className="w-3 h-3" /> Join Google Meet
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === 'day' ? (
              /* ======================= DAY VIEW ======================= */
              <div className="h-full flex flex-col border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-slate-900 p-4 overflow-y-auto">
                <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {FULL_WEEKDAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString()}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {getEventsForDate(currentDate).length} scheduled items for this date
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  {getEventsForDate(currentDate).length > 0 ? (
                    getEventsForDate(currentDate).map((item) => {
                      const style = DOMAIN_STYLES[item.domainType] || DOMAIN_STYLES.EVENT;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedEvent(item)}
                          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-all ${style.bg} ${style.border}`}
                        >
                          <div className="space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider">{style.label}</span>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">{item.title}</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {item.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                                {item.endTime ? item.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Flexible'}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {item.locationName}
                              </span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {item.meetingUrl && (
                              <a
                                href={item.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
                              >
                                <Video className="w-4 h-4" />
                                <span>Join Google Meet</span>
                              </a>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openRescheduleModal(item);
                              }}
                              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                            >
                              Reschedule
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-16 text-center text-slate-400 text-xs">
                      No activities scheduled for this day.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ======================= AGENDA VIEW ======================= */
              <div className="h-full flex flex-col border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-slate-900 p-4 overflow-y-auto space-y-4">
                <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Chronological Agenda Schedule</h2>
                  <p className="text-xs text-slate-500">Upcoming sequence of events, meetings, and client appointments</p>
                </div>

                <div className="space-y-2">
                  {filteredEvents.map((item) => {
                    const style = DOMAIN_STYLES[item.domainType] || DOMAIN_STYLES.EVENT;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedEvent(item)}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:shadow-xs transition-all ${style.bg} ${style.border}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-center w-12 shrink-0 pr-3 border-r border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              {WEEKDAY_NAMES[item.startTime.getDay()]}
                            </p>
                            <p className="text-lg font-black text-slate-900 dark:text-white">
                              {item.startTime.getDate()}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{style.label}</span>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h4>
                            <p className="text-xs text-slate-500">
                              {item.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {item.locationName}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.googleSynced && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                              ✓ Google Synced
                            </span>
                          )}
                          {item.meetingUrl && (
                            <a
                              href={item.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1"
                            >
                              <Video className="w-3.5 h-3.5" /> Meet
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Selected Item Detail Drawer Modal (Dark Theme) */}
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#090d16] text-white border border-slate-800/90 rounded-[2rem] max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-slate-900/50">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5 border border-primary/25 shadow-xs">
                    {selectedEvent.domainType === 'EVENT' ? (
                      <CalendarIcon className="w-5 h-5" />
                    ) : selectedEvent.domainType === 'MEETING' ? (
                      <Users className="w-5 h-5" />
                    ) : (
                      <Clock className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                      {selectedEvent.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${DOMAIN_STYLES[selectedEvent.domainType].badgeClass}`}>
                        {DOMAIN_STYLES[selectedEvent.domainType].label}
                      </span>
                      <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Status: <strong className="text-white uppercase">{selectedEvent.status}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer shrink-0"
                  title="Close"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-3.5 text-xs sm:text-sm">
                {/* Time & Date Card */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 border border-cyan-500/20">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Time &amp; Date</p>
                    <p className="text-sm font-bold text-white mt-0.5">
                      {selectedEvent.startTime.toLocaleString()} — {selectedEvent.endTime ? selectedEvent.endTime.toLocaleTimeString() : 'Flexible'}
                    </p>
                  </div>
                </div>

                {/* Location Card */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 border border-rose-500/20">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Location / Platform</p>
                    <p className="text-sm font-medium text-slate-200 mt-0.5 leading-relaxed">{selectedEvent.locationName}</p>
                  </div>
                </div>

                {/* Google Meet Call Card */}
                {selectedEvent.meetingUrl && (
                  <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-800/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/25">
                        <Video className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white">Google Meet Video Call</p>
                        <p className="text-[11px] text-blue-400 truncate mt-0.5">{selectedEvent.meetingUrl}</p>
                      </div>
                    </div>
                    <a
                      href={selectedEvent.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md shadow-blue-600/25 shrink-0 transition-all"
                    >
                      Join Call
                    </a>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-end gap-3 shrink-0">
                <button
                  onClick={() => openRescheduleModal(selectedEvent)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 font-bold text-xs transition-all cursor-pointer"
                >
                  Reschedule Slot
                </button>
                <Link
                  href={
                    selectedEvent.domainType === 'EVENT'
                      ? '/admin/events'
                      : selectedEvent.domainType === 'MEETING'
                      ? '/admin/meetings'
                      : '/admin/appointments'
                  }
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs hover:bg-primary/90 transition-all shadow-lg shadow-primary/25"
                >
                  Manage in {selectedEvent.domainType === 'EVENT' ? 'Events' : selectedEvent.domainType === 'MEETING' ? 'Meetings' : 'Appointments'}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Reschedule Modal with Conflict Detection (Dark Theme) */}
        {rescheduleModalOpen && rescheduleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#090d16] text-white border border-slate-800/90 rounded-[2rem] max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Reschedule: {rescheduleTarget.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Automated conflict detection active</p>
                  </div>
                </div>
                <button
                  onClick={() => setRescheduleModalOpen(false)}
                  className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800/80">
                  Update date and time. Conflict detection checks existing internal calendars and Google Calendar events automatically.
                </p>

                {conflictWarning && (
                  <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{conflictWarning}</span>
                  </div>
                )}

                <div className="space-y-3.5 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-black uppercase tracking-wider text-slate-400 block">New Date</label>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white font-semibold text-xs focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">Start Time</label>
                      <input
                        type="time"
                        value={rescheduleStartTime}
                        onChange={(e) => setRescheduleStartTime(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white font-semibold text-xs focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-black uppercase tracking-wider text-slate-400 block">End Time</label>
                      <input
                        type="time"
                        value={rescheduleEndTime}
                        onChange={(e) => setRescheduleEndTime(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white font-semibold text-xs focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-black uppercase tracking-wider text-slate-400 block">Reason for Reschedule (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Schedule adjustment per stakeholder request"
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white font-medium text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={handleCheckConflict}
                    disabled={checkingConflict}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {checkingConflict ? 'Checking...' : 'Check Conflicts'}
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setRescheduleModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveReschedule}
                      disabled={savingReschedule}
                      className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-lg shadow-primary/25 disabled:opacity-50 cursor-pointer"
                    >
                      {savingReschedule ? 'Saving...' : 'Confirm Reschedule'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Event Modal */}
        {formOpen && (
          <EventForm
            open={formOpen}
            onClose={() => setFormOpen(false)}
            onSubmit={async (payload) => {
              await fetchApi('/meetings', { method: 'POST', body: JSON.stringify(payload) });
              setFormOpen(false);
              loadCalendarData(currentDate);
              notify({ title: 'Success', description: 'New calendar entry created successfully' });
            }}
            eventTypes={eventTypes}
            categories={categories}
            initial={emptyEvent}
          />
        )}
      </div>
    </AdminLayoutShell>
  );
}
