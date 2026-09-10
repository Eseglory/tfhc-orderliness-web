'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  inputClass,
  useToast,
} from '../../../../components/ui';
import {
  EventForm,
  EventTypeOption,
  CategoryOption,
  emptyEvent,
  meetingToForm,
} from '../../../../components/EventForm';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  status: string;
  locationName: string;
  geofenceRadiusMeters: number;
  isCompulsory: boolean;
  visibility: string;
  archivedAt: string | null;
  cancelReason: string | null;
  category?: { name: string };
  eventType?: { name: string; color: string | null } | null;
  _count?: { attendanceRecords: number; invitations: number };
}

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'info' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  CLOSED: 'neutral',
  SCHEDULED: 'info',
  CANCELLED: 'danger',
};

export default function AdminEventsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null);
  const [busyId, setBusyId] = useState('');

  const canCreate = can('events.create');
  const canEdit = can('events.update');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (typeFilter) params.set('eventTypeId', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      if (showArchived) params.set('includeArchived', 'true');
      const [m, t, c] = await Promise.all([
        fetchApi<Meeting[]>(`/meetings?${params}`),
        fetchApi<EventTypeOption[]>('/meetings/event-types'),
        fetchApi<CategoryOption[]>('/meetings/categories'),
      ]);
      setMeetings(m);
      setEventTypes(t);
      setCategories(c);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    const h = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, status, typeFilter, search, showArchived]);

  const initialForm = useMemo(
    () => (editing ? meetingToForm(editing) : { ...emptyEvent, categoryId: categories[0]?.id ?? '' }),
    [editing, categories],
  );

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      notify(ok, 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          title="Events"
          subtitle="Services, meetings and every other church activity."
          actions={
            <div className="flex gap-2">
              <Link href="/admin/calendar">
                <Button variant="secondary">Calendar</Button>
              </Link>
              <Link href="/admin/services">
                <Button variant="secondary">Recurring</Button>
              </Link>
              {canCreate && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  + New event
                </Button>
              )}
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} max-w-xs`}
            placeholder="Search title or venue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={`${inputClass} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <select className={`${inputClass} w-auto`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {eventTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-on-surface-variant">
            <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : meetings.length === 0 ? (
          <EmptyState
            title="No events found"
            description={search || status || typeFilter ? 'Try clearing the filters.' : 'Create your first event to get started.'}
            action={canCreate && !search && !status ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ New event</Button> : undefined}
          />
        ) : (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm overflow-hidden">
            {/* Desktop & Tablet Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="border-b border-outline-variant/20 bg-surface-container-low/60 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">When</th>
                    <th className="px-4 py-3 font-semibold">Venue</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15">
                  {meetings.map((m) => (
                    <tr key={m.id} className={m.archivedAt ? 'opacity-60' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {m.eventType?.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.eventType.color }} />}
                          <span className="font-semibold text-on-surface">{m.title}</span>
                          {m.visibility === 'RESTRICTED' && <Badge tone="warning">Restricted</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-on-surface-variant">
                          <span>{m.eventType?.name ?? m.category?.name ?? '—'}</span>
                          <span>{m._count?.attendanceRecords ?? 0} checked in</span>
                          {!m.isCompulsory && <span>Optional</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {new Date(m.startTime).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        <span className="block text-xs">
                          {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {m.locationName}
                        <span className="block text-xs">{m.geofenceRadiusMeters} m radius</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{m.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link href={`/admin/live-meeting/${m.id}`}>
                            <Button variant="ghost" className="text-xs">Monitor</Button>
                          </Link>
                          {canEdit && (m.status === 'ACTIVE' || m.status === 'SCHEDULED') && (
                            <Button
                              variant="ghost"
                              className="text-xs"
                              loading={busyId === m.id}
                              onClick={() =>
                                act(
                                  m.id,
                                  () => fetchApi(`/meetings/${m.id}/status`, { method: 'PUT', body: JSON.stringify({ status: m.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE' }) }),
                                  m.status === 'ACTIVE' ? 'Attendance closed' : 'Attendance open',
                                )
                              }
                            >
                              {m.status === 'ACTIVE' ? 'Close' : 'Open'}
                            </Button>
                          )}
                          {canEdit && ['SCHEDULED', 'ACTIVE'].includes(m.status) && (
                            <Button variant="ghost" className="text-xs" onClick={() => { setEditing(m); setFormOpen(true); }}>Edit</Button>
                          )}
                          {canCreate && (
                            <Button variant="ghost" className="text-xs" loading={busyId === m.id} onClick={() => act(m.id, () => fetchApi(`/meetings/${m.id}/duplicate`, { method: 'POST', body: '{}' }), 'Event duplicated')}>
                              Duplicate
                            </Button>
                          )}
                          {can('events.cancel') && m.status !== 'CLOSED' && m.status !== 'CANCELLED' && (
                            <Button variant="ghost" className="text-xs text-error" onClick={() => setCancelTarget(m)}>Cancel</Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              className="text-xs"
                              loading={busyId === m.id}
                              onClick={() => act(m.id, () => fetchApi(`/meetings/${m.id}/archive`, { method: m.archivedAt ? 'DELETE' : 'POST' }), m.archivedAt ? 'Restored' : 'Archived')}
                            >
                              {m.archivedAt ? 'Restore' : 'Archive'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (< 768px) */}
            <div className="block md:hidden divide-y divide-outline-variant/15">
              {meetings.map((m) => (
                <div key={m.id} className={`p-4 space-y-3 ${m.archivedAt ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {m.eventType?.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.eventType.color }} />}
                        <h3 className="font-bold text-sm text-on-surface leading-tight">{m.title}</h3>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {m.eventType?.name ?? m.category?.name ?? 'General'} • {m._count?.attendanceRecords ?? 0} checked in
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{m.status}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-surface-container-low/50 border border-outline-variant/20">
                    <div>
                      <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">When</span>
                      <span className="font-semibold text-on-surface block">
                        {new Date(m.startTime).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })},{' '}
                        {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">Venue</span>
                      <span className="font-semibold text-on-surface block truncate">
                        {m.locationName}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Link href={`/admin/live-meeting/${m.id}`} className="flex-1">
                      <Button variant="secondary" className="w-full text-xs justify-center min-h-[38px]">Monitor</Button>
                    </Link>
                    {canEdit && (m.status === 'ACTIVE' || m.status === 'SCHEDULED') && (
                      <Button
                        variant="secondary"
                        className="text-xs min-h-[38px]"
                        loading={busyId === m.id}
                        onClick={() =>
                          act(
                            m.id,
                            () => fetchApi(`/meetings/${m.id}/status`, { method: 'PUT', body: JSON.stringify({ status: m.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE' }) }),
                            m.status === 'ACTIVE' ? 'Attendance closed' : 'Attendance open',
                          )
                        }
                      >
                        {m.status === 'ACTIVE' ? 'Close' : 'Open'}
                      </Button>
                    )}
                    {canEdit && ['SCHEDULED', 'ACTIVE'].includes(m.status) && (
                      <Button variant="ghost" className="text-xs min-h-[38px]" onClick={() => { setEditing(m); setFormOpen(true); }}>Edit</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {formOpen && (
        <EventForm
          open={formOpen}
          initial={initialForm}
          eventTypes={eventTypes}
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSubmit={async (payload) => {
            if (editing) await fetchApi(`/meetings/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
            else await fetchApi('/meetings', { method: 'POST', body: JSON.stringify(payload) });
            setFormOpen(false);
            notify(editing ? 'Event updated' : 'Event created', 'success');
            load();
          }}
        />
      )}

      <CancelDialog
        meeting={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={() => {
          setCancelTarget(null);
          notify('Event cancelled', 'success');
          load();
        }}
      />
    </div>
  );
}

function CancelDialog({ meeting, onClose, onDone }: { meeting: Meeting | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
  useEffect(() => setReason(''), [meeting]);
  if (!meeting) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${meeting.title}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Keep event</Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await fetchApi(`/meetings/${meeting.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
                onDone();
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Could not cancel', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            Cancel event
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-on-surface-variant">Members will see this event as cancelled. Attendance already recorded is kept.</p>
        <Field label="Reason (optional)">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Venue unavailable" />
        </Field>
      </div>
    </Modal>
  );
}
