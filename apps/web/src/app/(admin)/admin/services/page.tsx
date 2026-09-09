'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  inputClass,
  useToast,
} from '../../../../components/ui';
import { RecurrenceBuilder, RecurrenceRule, ruleToPreset } from '../../../../components/RecurrenceBuilder';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const toMin = (v: string) => (v ? Number(v.split(':')[0]) * 60 + Number(v.split(':')[1]) : null);

interface Schedule {
  id?: string;
  title: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number | null;
  categoryName: string;
  enabled: boolean;
  recurrenceRule?: RecurrenceRule | null;
  recurrenceSummary?: string;
  eventTypeKey?: string | null;
  visibility?: 'PUBLIC' | 'RESTRICTED';
  horizonDays?: number;
  exceptions?: { id: string; occurrenceStart: string; kind: string; reason: string | null }[];
  _count?: { meetings: number };
}

export default function RecurringServicesPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [eventTypes, setEventTypes] = useState<{ key: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Schedule | null>(null);
  const [occurrencesFor, setOccurrencesFor] = useState<Schedule | null>(null);
  const canManage = can('events.create') || can('events.update');

  const load = async () => {
    try {
      const [data, types] = await Promise.all([
        fetchApi<{ schedules: Schedule[]; config: any }>('/service-schedules'),
        fetchApi<{ key: string; name: string }[]>('/meetings/event-types').catch(() => []),
      ]);
      setSchedules(data.schedules);
      setConfig(data.config);
      setEventTypes(types);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to recurring events.' : 'Could not load recurring events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const saveSchedule = async (s: Schedule) => {
    const body = {
      title: s.title.trim(),
      categoryName: s.categoryName.trim(),
      dayOfWeek: s.dayOfWeek,
      startMinutes: s.startMinutes,
      endMinutes: s.endMinutes,
      enabled: s.enabled,
      eventTypeKey: s.eventTypeKey || null,
      visibility: s.visibility ?? 'PUBLIC',
      horizonDays: s.horizonDays ?? 28,
      recurrenceRule: s.recurrenceRule ?? null,
    };
    await fetchApi(s.id ? `/service-schedules/${s.id}` : '/service-schedules', {
      method: s.id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    });
    setEdit(null);
    notify('Saved. Upcoming events updated.', 'success');
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin/meetings" className="hover:text-primary">Events</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Recurring</span>
        </nav>
        <PageHeader
          title="Recurring Events"
          subtitle="Series that generate events automatically. All times use Africa/Lagos."
          actions={
            can('events.create') ? (
              <Button onClick={() => setEdit({ title: '', dayOfWeek: 0, startMinutes: 420, endMinutes: null, categoryName: 'Sunday Service', enabled: true, recurrenceRule: null, visibility: 'PUBLIC', horizonDays: 28 })}>
                + New series
              </Button>
            ) : undefined
          }
        />

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {schedules.map((s) => (
                <article key={s.id} className="space-y-2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-on-surface">{s.title}</h3>
                    <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? 'Active' : 'Paused'}</Badge>
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    {s.recurrenceSummary} · {clock(s.startMinutes)}
                    {s.endMinutes !== null ? `–${clock(s.endMinutes)}` : ''}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {s._count?.meetings ?? 0} generated
                    {s.exceptions?.length ? ` · ${s.exceptions.length} exception${s.exceptions.length > 1 ? 's' : ''}` : ''}
                    {s.visibility === 'RESTRICTED' ? ' · Restricted' : ''}
                  </p>
                  {canManage && (
                    <div className="flex gap-2 border-t border-outline-variant/15 pt-2">
                      <Button variant="secondary" className="text-xs" onClick={() => setEdit({ ...s })}>Edit series</Button>
                      <Button variant="ghost" className="text-xs" onClick={() => setOccurrencesFor(s)}>Occurrences</Button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            {config && can('events.update') && <VenueConfig config={config} onSaved={load} />}
          </>
        )}
      </main>

      {edit && (
        <SeriesEditor
          value={edit}
          eventTypes={eventTypes}
          onClose={() => setEdit(null)}
          onSave={saveSchedule}
        />
      )}

      {occurrencesFor && (
        <OccurrencesModal
          schedule={occurrencesFor}
          onClose={() => setOccurrencesFor(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function SeriesEditor({
  value,
  eventTypes,
  onClose,
  onSave,
}: {
  value: Schedule;
  eventTypes: { key: string; name: string }[];
  onClose: () => void;
  onSave: (s: Schedule) => Promise<void>;
}) {
  const [s, setS] = useState<Schedule>({ ...value });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof Schedule>(k: K, v: Schedule[K]) => setS((p) => ({ ...p, [k]: v }));
  const { rule } = ruleToPreset(s.recurrenceRule ?? null, s.dayOfWeek);

  const submit = async () => {
    setErr('');
    if (s.title.trim().length < 2) return setErr('Give the series a name.');
    if (s.endMinutes !== null && s.endMinutes <= s.startMinutes) return setErr('End time must be after the start time.');
    setSaving(true);
    try {
      await onSave(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={s.id ? 'Edit series' : 'New series'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{s.id ? 'Save series' : 'Create series'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Series name" required>
          <input className={inputClass} value={s.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event type">
            <select className={inputClass} value={s.eventTypeKey ?? ''} onChange={(e) => set('eventTypeKey', e.target.value || null)}>
              <option value="">— None —</option>
              {eventTypes.map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Scoring category" required>
            <input className={inputClass} value={s.categoryName} onChange={(e) => set('categoryName', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Anchor weekday">
            <select className={inputClass} value={s.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
              {WD.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Visibility">
            <select className={inputClass} value={s.visibility ?? 'PUBLIC'} onChange={(e) => set('visibility', e.target.value as 'PUBLIC' | 'RESTRICTED')}>
              <option value="PUBLIC">All members</option>
              <option value="RESTRICTED">Restricted</option>
            </select>
          </Field>
          <Field label="Start time" required>
            <input type="time" className={inputClass} value={clock(s.startMinutes)} onChange={(e) => set('startMinutes', toMin(e.target.value) ?? 0)} />
          </Field>
          <Field label="End time (optional)">
            <input type="time" className={inputClass} value={clock(s.endMinutes)} onChange={(e) => set('endMinutes', toMin(e.target.value))} />
          </Field>
        </div>

        <RecurrenceBuilder value={rule} dayOfWeek={s.dayOfWeek} onChange={(r) => set('recurrenceRule', r)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Generate ahead (days)" hint="7–120">
            <input type="number" min={7} max={120} className={inputClass} value={s.horizonDays ?? 28} onChange={(e) => set('horizonDays', Number(e.target.value))} />
          </Field>
          <label className="flex items-end gap-2 pb-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            Active (generate upcoming events)
          </label>
        </div>

        {err && <p role="alert" className="text-sm font-medium text-error">{err}</p>}
      </div>
    </Modal>
  );
}

function OccurrencesModal({
  schedule,
  onClose,
  onChanged,
}: {
  schedule: Schedule;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const to = new Date(Date.now() + 120 * 864e5).toISOString();
      const list = await fetchApi<any[]>(`/meetings?from=${encodeURIComponent(now)}&to=${encodeURIComponent(to)}&includeArchived=true`);
      setRows(list.filter((m) => m.serviceScheduleId === schedule.id || m.serviceSchedule?.id === schedule.id));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelOne = async (m: any) => {
    setBusy(m.id);
    try {
      await fetchApi(`/service-schedules/${schedule.id}/occurrences/${m.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled for this date' }) });
      notify('Occurrence cancelled', 'success');
      load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not cancel', 'error');
    } finally {
      setBusy('');
    }
  };
  const restoreOne = async (m: any) => {
    setBusy(m.id);
    try {
      await fetchApi(`/service-schedules/${schedule.id}/occurrences/${m.id}/cancel`, { method: 'DELETE' });
      notify('Occurrence restored', 'success');
      load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not restore', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`${schedule.title} — occurrences`} description="Cancel or restore a single date without affecting the rest of the series.">
      {loading ? (
        <div className="flex justify-center py-10 text-on-surface-variant"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-on-surface-variant">No upcoming occurrences.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/15">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-on-surface">
                  {new Date(m.startTime).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {m.status}
                  {m.isException ? ' · edited' : ''}
                  {m.title !== schedule.title ? ` · "${m.title}"` : ''}
                </p>
              </div>
              {m.status === 'CANCELLED' ? (
                <Button variant="ghost" className="text-xs" loading={busy === m.id} onClick={() => restoreOne(m)}>Restore</Button>
              ) : m.status === 'CLOSED' ? (
                <span className="text-xs text-on-surface-variant">closed</span>
              ) : (
                <Button variant="ghost" className="text-xs text-error" loading={busy === m.id} onClick={() => cancelOne(m)}>Cancel this date</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function VenueConfig({ config: initial, onSaved }: { config: any; onSaved: () => void }) {
  const { notify } = useToast();
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetchApi('/service-schedules/config', { method: 'PUT', body: JSON.stringify(config) });
      notify('Settings saved', 'success');
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface">Default venue &amp; reminders</h2>
      <p className="text-sm text-on-surface-variant">Applied to every generated recurring event. One-off events set their own venue.</p>
      <Field label="Venue name" required>
        <input className={inputClass} value={config.venue.name} onChange={(e) => setConfig({ ...config, venue: { ...config.venue, name: e.target.value } })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {(['latitude', 'longitude', 'radiusMeters'] as const).map((k) => (
          <Field key={k} label={k === 'radiusMeters' ? 'Check-in radius (m)' : k[0].toUpperCase() + k.slice(1)}>
            <input type="number" step="any" className={inputClass} value={config.venue[k]} onChange={(e) => setConfig({ ...config, venue: { ...config.venue, [k]: Number(e.target.value) } })} />
          </Field>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Arrive minutes before">
          <input type="number" min={0} max={180} className={inputClass} value={config.arrivalMinutesBefore} onChange={(e) => setConfig({ ...config, arrivalMinutesBefore: Number(e.target.value) })} />
        </Field>
        <Field label="Reminder minutes before">
          <input type="number" min={1} max={10080} className={inputClass} value={config.reminderMinutes[0] || 60} onChange={(e) => setConfig({ ...config, reminderMinutes: [Number(e.target.value)] })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={config.remindersEnabled} onChange={(e) => setConfig({ ...config, remindersEnabled: e.target.checked })} />
        Send email reminders
      </label>
      <Field label="Send reminders to">
        <select className={inputClass} value={config.recipients} onChange={(e) => setConfig({ ...config, recipients: e.target.value })}>
          <option value="all">All active approved members</option>
          <option value="committed">Only members committed to the event</option>
        </select>
      </Field>
      <Button onClick={save} loading={saving}>Save settings</Button>
    </section>
  );
}
