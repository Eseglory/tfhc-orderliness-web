'use client';
import React, { useEffect, useState } from 'react';
import { Button, Field, inputClass } from './ui';
import { fetchApi } from '../lib/api';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Globe,
  Sparkles,
  Users,
  Shield,
  Layers,
  X,
  CheckCircle2,
  ChevronRight,
  Info,
} from 'lucide-react';

export interface EventTypeOption { id: string; name: string; color: string | null; defaultCompulsory: boolean }
export interface CategoryOption { id: string; name: string; pointWeight: number }
interface SubTeamOption { id: string; name: string }
interface MemberOption { id: string; firstName: string; lastName: string }

export interface EventFormValue {
  id?: string;
  title: string;
  description: string;
  eventTypeId: string;
  categoryId: string;
  date: string;
  allDay: boolean;
  openTime: string;
  arrivalTime: string;
  startTime: string;
  closeTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  pointWeight: number;
  isCompulsory: boolean;
  mode: 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';
  virtualMeetingUrl?: string;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  organizerName: string;
  notes: string;
  visibility: 'PUBLIC' | 'RESTRICTED';
  audienceScopes: ('ALL_MEMBERS' | 'EXECUTIVES' | 'ADMINS')[];
  audienceSubTeamIds: string[];
  audienceMemberIds: string[];
}

export const emptyEvent: EventFormValue = {
  title: '',
  description: '',
  eventTypeId: '',
  categoryId: '',
  date: '',
  allDay: false,
  openTime: '',
  arrivalTime: '',
  startTime: '',
  closeTime: '',
  endTime: '',
  gracePeriodMinutes: 10,
  pointWeight: 1,
  isCompulsory: true,
  mode: 'IN_PERSON',
  virtualMeetingUrl: '',
  locationName: 'The Father’s House Church, 90 Alagbole–Akute Road, Iju, Ojodu',
  address: '',
  latitude: 6.6697906,
  longitude: 3.3581822,
  geofenceRadiusMeters: 100,
  organizerName: '',
  notes: '',
  visibility: 'PUBLIC',
  audienceScopes: [],
  audienceSubTeamIds: [],
  audienceMemberIds: [],
};

export function eventToPayload(v: EventFormValue) {
  const iso = (t: string) => new Date(`${v.date}T${t || '00:00'}`).toISOString();
  const audiences =
    v.visibility === 'RESTRICTED'
      ? [
          ...v.audienceScopes.map((scope) => ({ scope })),
          ...v.audienceSubTeamIds.map((subTeamId) => ({ subTeamId })),
          ...v.audienceMemberIds.map((memberId) => ({ memberId })),
        ]
      : [];
  
  // Combine virtual URL in notes if present
  let finalNotes = v.notes.trim();
  if (v.virtualMeetingUrl && (v.mode === 'VIRTUAL' || v.mode === 'HYBRID')) {
    const urlTag = `[Virtual Link: ${v.virtualMeetingUrl.trim()}]`;
    if (!finalNotes.includes(urlTag)) {
      finalNotes = finalNotes ? `${finalNotes}\n${urlTag}` : urlTag;
    }
  }

  return {
    title: v.title.trim(),
    description: v.description.trim() || undefined,
    eventTypeId: v.eventTypeId || undefined,
    categoryId: v.categoryId,
    meetingDate: new Date(`${v.date}T${v.startTime || '00:00'}`).toISOString(),
    startTime: iso(v.startTime),
    expectedArrivalTime: iso(v.arrivalTime || v.startTime),
    attendanceOpenTime: iso(v.openTime || v.startTime),
    attendanceCloseTime: iso(v.closeTime || v.startTime),
    endTime: v.endTime ? iso(v.endTime) : undefined,
    allDay: v.allDay,
    gracePeriodMinutes: Number(v.gracePeriodMinutes),
    pointWeight: Number(v.pointWeight),
    isCompulsory: v.isCompulsory,
    locationName: v.mode === 'VIRTUAL' ? 'Online / Virtual Platform' : v.locationName.trim(),
    address: v.mode === 'VIRTUAL' ? (v.virtualMeetingUrl || undefined) : (v.address.trim() || undefined),
    latitude: Number(v.latitude),
    longitude: Number(v.longitude),
    geofenceRadiusMeters: v.mode === 'VIRTUAL' ? 100000 : Number(v.geofenceRadiusMeters),
    organizerName: v.organizerName.trim() || undefined,
    notes: finalNotes || undefined,
    visibility: v.visibility,
    audiences,
  };
}

export function meetingToForm(m: any): EventFormValue {
  const hhmm = (iso: string) => (iso ? new Date(iso).toISOString().slice(11, 16) : '');
  const notesText = m.notes ?? '';
  const urlMatch = notesText.match(/\[Virtual Link:\s*([^\s\]]+)\]/i);
  const virtualUrl = urlMatch ? urlMatch[1] : (m.address && m.address.startsWith('http') ? m.address : '');

  const isVirtual = m.locationName?.toLowerCase().includes('virtual') || m.locationName?.toLowerCase().includes('online') || Boolean(urlMatch);

  return {
    ...emptyEvent,
    id: m.id,
    title: m.title ?? '',
    description: m.description ?? '',
    eventTypeId: m.eventTypeId ?? m.eventType?.id ?? '',
    categoryId: m.categoryId ?? m.category?.id ?? '',
    date: m.startTime ? new Date(m.startTime).toISOString().slice(0, 10) : '',
    allDay: Boolean(m.allDay),
    openTime: hhmm(m.attendanceOpenTime),
    arrivalTime: hhmm(m.expectedArrivalTime),
    startTime: hhmm(m.startTime),
    closeTime: hhmm(m.attendanceCloseTime),
    endTime: m.endTime ? hhmm(m.endTime) : '',
    gracePeriodMinutes: m.gracePeriodMinutes ?? 10,
    pointWeight: m.pointWeight ?? 1,
    isCompulsory: Boolean(m.isCompulsory),
    mode: isVirtual ? 'VIRTUAL' : 'IN_PERSON',
    virtualMeetingUrl: virtualUrl,
    locationName: m.locationName ?? emptyEvent.locationName,
    address: m.address ?? '',
    latitude: m.latitude ?? emptyEvent.latitude,
    longitude: m.longitude ?? emptyEvent.longitude,
    geofenceRadiusMeters: m.geofenceRadiusMeters ?? 100,
    organizerName: m.organizerName ?? '',
    notes: m.notes ?? '',
    visibility: m.visibility ?? 'PUBLIC',
    audienceScopes: (m.audiences ?? []).filter((a: any) => a.scope).map((a: any) => a.scope),
    audienceSubTeamIds: (m.audiences ?? []).filter((a: any) => a.subTeamId).map((a: any) => a.subTeamId),
    audienceMemberIds: (m.audiences ?? []).filter((a: any) => a.memberId).map((a: any) => a.memberId),
  };
}

export function EventForm({
  open,
  initial,
  eventTypes,
  categories,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: EventFormValue;
  eventTypes: EventTypeOption[];
  categories: CategoryOption[];
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof eventToPayload>) => Promise<void>;
}) {
  const [v, setV] = useState<EventFormValue>(initial);
  const [subTeams, setSubTeams] = useState<SubTeamOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activePreset, setActivePreset] = useState<'service' | 'sync' | 'rehearsal' | 'conference' | 'custom'>('custom');

  const set = <K extends keyof EventFormValue>(k: K, val: EventFormValue[K]) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    if (open) {
      setV(initial);
      setError('');
      setActivePreset('custom');
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    fetchApi<SubTeamOption[]>('/members/sub-teams').then(setSubTeams).catch(() => setSubTeams([]));
    fetchApi<any[]>('/members').then((rows) => setMembers(rows.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName })))).catch(() => setMembers([]));
  }, [open]);

  // Apply quick preset
  const applyPreset = (preset: 'service' | 'sync' | 'rehearsal' | 'conference') => {
    setActivePreset(preset);
    if (preset === 'service') {
      const serviceType = eventTypes.find((t) => t.name.toLowerCase().includes('service'))?.id || '';
      const serviceCat = categories.find((c) => c.name.toLowerCase().includes('sunday') || c.name.toLowerCase().includes('service'))?.id || categories[0]?.id || '';
      setV((s) => ({
        ...s,
        title: s.title || 'Sunday Worship Service',
        eventTypeId: serviceType,
        categoryId: serviceCat,
        startTime: '08:00',
        arrivalTime: '07:30',
        openTime: '07:00',
        closeTime: '08:15',
        endTime: '11:00',
        mode: 'IN_PERSON',
        isCompulsory: true,
        visibility: 'PUBLIC',
        pointWeight: 1,
      }));
    } else if (preset === 'sync') {
      const meetingType = eventTypes.find((t) => t.name.toLowerCase().includes('meeting'))?.id || '';
      const meetingCat = categories.find((c) => c.name.toLowerCase().includes('meeting') || c.name.toLowerCase().includes('unit'))?.id || categories[0]?.id || '';
      setV((s) => ({
        ...s,
        title: s.title || 'Departmental Sync & Briefing',
        eventTypeId: meetingType,
        categoryId: meetingCat,
        startTime: '18:00',
        arrivalTime: '17:55',
        openTime: '17:45',
        closeTime: '18:15',
        endTime: '19:00',
        mode: 'HYBRID',
        isCompulsory: true,
        visibility: 'RESTRICTED',
        pointWeight: 1,
      }));
    } else if (preset === 'rehearsal') {
      const trainType = eventTypes.find((t) => t.name.toLowerCase().includes('training') || t.name.toLowerCase().includes('meeting'))?.id || '';
      const trainCat = categories.find((c) => c.name.toLowerCase().includes('training') || c.name.toLowerCase().includes('meeting'))?.id || categories[0]?.id || '';
      setV((s) => ({
        ...s,
        title: s.title || 'Weekly Team Rehearsal & Prep',
        eventTypeId: trainType,
        categoryId: trainCat,
        startTime: '17:00',
        arrivalTime: '16:45',
        openTime: '16:30',
        closeTime: '17:15',
        endTime: '19:30',
        mode: 'IN_PERSON',
        isCompulsory: true,
        visibility: 'RESTRICTED',
        pointWeight: 1,
      }));
    } else if (preset === 'conference') {
      const specType = eventTypes.find((t) => t.name.toLowerCase().includes('special') || t.name.toLowerCase().includes('celebration'))?.id || '';
      const specCat = categories.find((c) => c.name.toLowerCase().includes('special') || c.name.toLowerCase().includes('conference'))?.id || categories[0]?.id || '';
      setV((s) => ({
        ...s,
        title: s.title || 'Annual Convention / Conference',
        eventTypeId: specType,
        categoryId: specCat,
        startTime: '09:00',
        arrivalTime: '08:30',
        openTime: '08:00',
        closeTime: '09:30',
        endTime: '16:00',
        mode: 'HYBRID',
        isCompulsory: false,
        visibility: 'PUBLIC',
        pointWeight: 2,
      }));
    }
  };

  const toggle = (k: 'audienceScopes' | 'audienceSubTeamIds' | 'audienceMemberIds', id: string) =>
    setV((s) => {
      const arr = s[k] as string[];
      return { ...s, [k]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });

  const submit = async () => {
    setError('');
    if (v.title.trim().length < 2) return setError('Please enter a title for the event / meeting.');
    if (!v.categoryId) return setError('Please select a scoring category.');
    if (!v.date) return setError('Please choose a date.');
    if (!v.startTime) return setError('Please set a start time.');
    if (
      v.visibility === 'RESTRICTED' &&
      v.audienceScopes.length + v.audienceSubTeamIds.length + v.audienceMemberIds.length === 0
    ) {
      return setError('A restricted gathering needs at least one selected team or audience scope.');
    }
    setSaving(true);
    try {
      await onSubmit(eventToPayload(v));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save event.');
    } finally {
      setSaving(false);
    }
  };

  const darkInputClass = "w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-2xl my-8 bg-[#0a0f1d] border border-slate-800/90 rounded-[2rem] shadow-2xl shadow-black/80 overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-white">
                {v.id ? 'Edit Gathering / Event' : 'Schedule Event, Service or Meeting'}
              </h3>
              <p className="text-xs font-medium text-slate-400">
                Unified setup for church services, departmental syncs, rehearsals, and conferences.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {/* Quick Preset Selector */}
          {!v.id && (
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Quick Preset Fill
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('service')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-center border ${
                    activePreset === 'service'
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  ⛪ Church Service
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('sync')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-center border ${
                    activePreset === 'sync'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  👥 Team Sync
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('rehearsal')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-center border ${
                    activePreset === 'rehearsal'
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  🎵 Rehearsal
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('conference')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-center border ${
                    activePreset === 'conference'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  🌟 Conference
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Gathering Title <span className="text-amber-400">*</span>
            </label>
            <input
              className={darkInputClass}
              value={v.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={160}
              placeholder="e.g. Sunday Celebration Service, Choir Sync, or Leadership Meeting"
            />
          </div>

          {/* Classification & Scoring */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Event / Service Type
              </label>
              <select
                className={darkInputClass}
                value={v.eventTypeId}
                onChange={(e) => {
                  const t = eventTypes.find((x) => x.id === e.target.value);
                  setV((s) => ({ ...s, eventTypeId: e.target.value, isCompulsory: t ? t.defaultCompulsory : s.isCompulsory }));
                }}
              >
                <option value="">— Select Type —</option>
                {eventTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Scoring Category <span className="text-amber-400">*</span>
              </label>
              <select
                className={darkInputClass}
                value={v.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
              >
                <option value="">— Choose Category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} (Multiplier ×{c.pointWeight})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Description / Agenda (Optional)
            </label>
            <textarea
              className={darkInputClass}
              rows={2}
              value={v.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={2000}
              placeholder="Provide context, agenda items, or preparation notes..."
            />
          </div>

          {/* Mode Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Delivery Format / Mode
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => set('mode', 'IN_PERSON')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  v.mode === 'IN_PERSON'
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                In-Person
              </button>
              <button
                type="button"
                onClick={() => set('mode', 'VIRTUAL')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  v.mode === 'VIRTUAL'
                    ? 'bg-blue-500/20 border-blue-500/60 text-blue-300'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                Virtual Only
              </button>
              <button
                type="button"
                onClick={() => set('mode', 'HYBRID')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  v.mode === 'HYBRID'
                    ? 'bg-purple-500/20 border-purple-500/60 text-purple-300'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Hybrid
              </button>
            </div>
          </div>

          {/* Virtual Link if Virtual or Hybrid */}
          {(v.mode === 'VIRTUAL' || v.mode === 'HYBRID') && (
            <div className="space-y-1.5 p-3.5 rounded-2xl bg-blue-950/20 border border-blue-900/40">
              <label className="text-[11px] font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" />
                Meeting Link (Google Meet / Zoom URL)
              </label>
              <input
                className={darkInputClass}
                value={v.virtualMeetingUrl || ''}
                onChange={(e) => set('virtualMeetingUrl', e.target.value)}
                placeholder="https://meet.google.com/xyz-abcd-efg"
              />
            </div>
          )}

          {/* Date & All Day */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Date <span className="text-amber-400">*</span>
              </label>
              <input
                type="date"
                className={darkInputClass}
                value={v.date}
                onChange={(e) => set('date', e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
                checked={v.allDay}
                onChange={(e) => set('allDay', e.target.checked)}
              />
              <span className="text-xs font-semibold text-slate-300">All-Day Gathering</span>
            </label>
          </div>

          {/* Time Schedule */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Check-in Opens</label>
              <input type="time" className={darkInputClass} value={v.openTime} onChange={(e) => set('openTime', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Arrival</label>
              <input type="time" className={darkInputClass} value={v.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Starts At *</label>
              <input type="time" className={darkInputClass} value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Check-in Closes</label>
              <input type="time" className={darkInputClass} value={v.closeTime} onChange={(e) => set('closeTime', e.target.value)} />
            </div>
          </div>

          {/* Rules & Multipliers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ends At (Optional)</label>
              <input type="time" className={darkInputClass} value={v.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grace Period (Min)</label>
              <input type="number" min={0} className={darkInputClass} value={v.gracePeriodMinutes} onChange={(e) => set('gracePeriodMinutes', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5 flex items-end">
              <label className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
                  checked={v.isCompulsory}
                  onChange={(e) => set('isCompulsory', e.target.checked)}
                />
                <span className="text-xs font-semibold text-slate-300">Compulsory Attendance</span>
              </label>
            </div>
          </div>

          {/* Venue & Geofencing (If In-Person or Hybrid) */}
          {v.mode !== 'VIRTUAL' && (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <MapPin className="w-4 h-4 text-amber-400" />
                Physical Venue & GPS Geofence
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Venue Name</label>
                  <input className={darkInputClass} value={v.locationName} onChange={(e) => set('locationName', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Address</label>
                  <input className={darkInputClass} value={v.address} onChange={(e) => set('address', e.target.value)} placeholder="Physical address" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Geofence Radius (Meters)</label>
                  <input type="number" className={darkInputClass} value={v.geofenceRadiusMeters} onChange={(e) => set('geofenceRadiusMeters', Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Organiser Name</label>
                  <input className={darkInputClass} value={v.organizerName} onChange={(e) => set('organizerName', e.target.value)} placeholder="e.g. Protocol / Media Unit" />
                </div>
              </div>
            </div>
          )}

          {/* Visibility & Audience Scopes */}
          <div className="space-y-3 p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Shield className="w-4 h-4 text-amber-400" />
                Audience Scope & Access
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set('visibility', 'PUBLIC')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    v.visibility === 'PUBLIC'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  All Members
                </button>
                <button
                  type="button"
                  onClick={() => set('visibility', 'RESTRICTED')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    v.visibility === 'RESTRICTED'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Restricted / Teams
                </button>
              </div>
            </div>

            {v.visibility === 'RESTRICTED' && (
              <div className="pt-2 space-y-3 border-t border-slate-800">
                <div className="flex flex-wrap gap-2">
                  {(['EXECUTIVES', 'ADMINS'] as const).map((s) => (
                    <label key={s} className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800 text-amber-500"
                        checked={v.audienceScopes.includes(s)}
                        onChange={() => toggle('audienceScopes', s)}
                      />
                      {s === 'EXECUTIVES' ? 'Executive Leadership' : 'Church Administrators'}
                    </label>
                  ))}
                </div>

                {subTeams.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Target Sub-teams & Departments</p>
                    <div className="flex flex-wrap gap-2">
                      {subTeams.map((st) => (
                        <label key={st.id} className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800 text-amber-500"
                            checked={v.audienceSubTeamIds.includes(st.id)}
                            onChange={() => toggle('audienceSubTeamIds', st.id)}
                          />
                          {st.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Internal Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Internal Admin Notes (Optional)
            </label>
            <textarea
              className={darkInputClass}
              rows={2}
              value={v.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={2000}
              placeholder="Duty guidelines, instructions, or internal notes..."
            />
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800/80 bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? 'Saving Gathering...' : v.id ? 'Save Changes' : 'Confirm & Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

