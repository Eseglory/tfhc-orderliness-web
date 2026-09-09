'use client';
import React, { useEffect, useState } from 'react';
import { Button, Field, Modal, inputClass } from './ui';
import { fetchApi } from '../lib/api';

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
    locationName: v.locationName.trim(),
    address: v.address.trim() || undefined,
    latitude: Number(v.latitude),
    longitude: Number(v.longitude),
    geofenceRadiusMeters: Number(v.geofenceRadiusMeters),
    organizerName: v.organizerName.trim() || undefined,
    notes: v.notes.trim() || undefined,
    visibility: v.visibility,
    audiences,
  };
}

export function meetingToForm(m: any): EventFormValue {
  const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
  return {
    ...emptyEvent,
    id: m.id,
    title: m.title ?? '',
    description: m.description ?? '',
    eventTypeId: m.eventTypeId ?? m.eventType?.id ?? '',
    categoryId: m.categoryId ?? m.category?.id ?? '',
    date: new Date(m.startTime).toISOString().slice(0, 10),
    allDay: Boolean(m.allDay),
    openTime: hhmm(m.attendanceOpenTime),
    arrivalTime: hhmm(m.expectedArrivalTime),
    startTime: hhmm(m.startTime),
    closeTime: hhmm(m.attendanceCloseTime),
    endTime: m.endTime ? hhmm(m.endTime) : '',
    gracePeriodMinutes: m.gracePeriodMinutes ?? 10,
    pointWeight: m.pointWeight ?? 1,
    isCompulsory: Boolean(m.isCompulsory),
    locationName: m.locationName ?? '',
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
  const set = <K extends keyof EventFormValue>(k: K, val: EventFormValue[K]) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    if (open) {
      setV(initial);
      setError('');
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    fetchApi<SubTeamOption[]>('/members/sub-teams').then(setSubTeams).catch(() => setSubTeams([]));
    fetchApi<any[]>('/members').then((rows) => setMembers(rows.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName })))).catch(() => setMembers([]));
  }, [open]);

  const toggle = (k: 'audienceScopes' | 'audienceSubTeamIds' | 'audienceMemberIds', id: string) =>
    setV((s) => {
      const arr = s[k] as string[];
      return { ...s, [k]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });

  const submit = async () => {
    setError('');
    if (v.title.trim().length < 2) return setError('Give the event a title.');
    if (!v.categoryId) return setError('Choose a scoring category.');
    if (!v.date) return setError('Choose a date.');
    if (!v.startTime) return setError('Set a start time.');
    if (
      v.visibility === 'RESTRICTED' &&
      v.audienceScopes.length + v.audienceSubTeamIds.length + v.audienceMemberIds.length === 0
    )
      return setError('A restricted event needs at least one audience.');
    setSaving(true);
    try {
      await onSubmit(eventToPayload(v));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the event.');
    } finally {
      setSaving(false);
    }
  };

  const timeField = (label: string, key: keyof EventFormValue) => (
    <Field label={label}>
      <input type="time" className={inputClass} value={v[key] as string} onChange={(e) => set(key, e.target.value as never)} />
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={v.id ? 'Edit event' : 'Create event'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{v.id ? 'Save changes' : 'Create event'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Title" required>
          <input className={inputClass} value={v.title} onChange={(e) => set('title', e.target.value)} maxLength={160} placeholder="e.g. Saturday Unit Meeting" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event type">
            <select className={inputClass} value={v.eventTypeId} onChange={(e) => {
              const t = eventTypes.find((x) => x.id === e.target.value);
              setV((s) => ({ ...s, eventTypeId: e.target.value, isCompulsory: t ? t.defaultCompulsory : s.isCompulsory }));
            }}>
              <option value="">— None —</option>
              {eventTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Scoring category" required>
            <select className={inputClass} value={v.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Choose —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (×{c.pointWeight})</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <textarea className={inputClass} rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <input type="date" className={inputClass} value={v.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <label className="flex items-end gap-2 pb-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={v.allDay} onChange={(e) => set('allDay', e.target.checked)} />
            All-day event
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          {timeField('Attendance opens', 'openTime')}
          {timeField('Expected arrival', 'arrivalTime')}
          {timeField('Starts', 'startTime')}
          {timeField('Attendance closes', 'closeTime')}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          {timeField('Ends (optional)', 'endTime')}
          <Field label="Grace period (min)">
            <input type="number" min={0} className={inputClass} value={v.gracePeriodMinutes} onChange={(e) => set('gracePeriodMinutes', Number(e.target.value))} />
          </Field>
          <Field label="Points multiplier">
            <input type="number" min={0} step={0.1} className={inputClass} value={v.pointWeight} onChange={(e) => set('pointWeight', Number(e.target.value))} />
          </Field>
          <label className="flex items-end gap-2 pb-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={v.isCompulsory} onChange={(e) => set('isCompulsory', e.target.checked)} />
            Compulsory
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue name" required>
            <input className={inputClass} value={v.locationName} onChange={(e) => set('locationName', e.target.value)} />
          </Field>
          <Field label="Address (optional)">
            <input className={inputClass} value={v.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Latitude"><input type="number" step="any" className={inputClass} value={v.latitude} onChange={(e) => set('latitude', Number(e.target.value))} /></Field>
          <Field label="Longitude"><input type="number" step="any" className={inputClass} value={v.longitude} onChange={(e) => set('longitude', Number(e.target.value))} /></Field>
          <Field label="Geofence radius (m)"><input type="number" className={inputClass} value={v.geofenceRadiusMeters} onChange={(e) => set('geofenceRadiusMeters', Number(e.target.value))} /></Field>
          <Field label="Organiser (optional)"><input className={inputClass} value={v.organizerName} onChange={(e) => set('organizerName', e.target.value)} /></Field>
        </div>

        <fieldset className="rounded-xl border border-outline-variant/30 p-4">
          <legend className="px-1 text-sm font-semibold text-on-surface">Who can see this event</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="vis" checked={v.visibility === 'PUBLIC'} onChange={() => set('visibility', 'PUBLIC')} />
              All members
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="vis" checked={v.visibility === 'RESTRICTED'} onChange={() => set('visibility', 'RESTRICTED')} />
              Restricted
            </label>
          </div>
          {v.visibility === 'RESTRICTED' && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(['EXECUTIVES', 'ADMINS'] as const).map((s) => (
                  <label key={s} className="flex items-center gap-1.5 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-xs">
                    <input type="checkbox" className="h-3.5 w-3.5" checked={v.audienceScopes.includes(s)} onChange={() => toggle('audienceScopes', s)} />
                    {s === 'EXECUTIVES' ? 'Executives' : 'Administrators'}
                  </label>
                ))}
              </div>
              {subTeams.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-on-surface-variant">Sub-teams</p>
                  <div className="flex flex-wrap gap-2">
                    {subTeams.map((st) => (
                      <label key={st.id} className="flex items-center gap-1.5 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-xs">
                        <input type="checkbox" className="h-3.5 w-3.5" checked={v.audienceSubTeamIds.includes(st.id)} onChange={() => toggle('audienceSubTeamIds', st.id)} />
                        {st.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {members.length > 0 && (
                <Field label="Specific members">
                  <select
                    multiple
                    className={`${inputClass} h-28`}
                    value={v.audienceMemberIds}
                    onChange={(e) => set('audienceMemberIds', Array.from(e.target.selectedOptions, (o) => o.value))}
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}
        </fieldset>

        <Field label="Internal notes (optional)">
          <textarea className={inputClass} rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
        </Field>

        {error && <p role="alert" className="text-sm font-medium text-error">{error}</p>}
      </div>
    </Modal>
  );
}
