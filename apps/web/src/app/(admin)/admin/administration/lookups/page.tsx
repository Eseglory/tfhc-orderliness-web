'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../../components/Navbar';
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
} from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

type Kind = 'event-types' | 'meeting-categories' | 'sub-teams';
interface Row {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
  inUse: number;
  deletable: boolean;
  extra: Record<string, any>;
}

const TABS: { kind: Kind; label: string; noun: string; hint: string }[] = [
  { kind: 'event-types', label: 'Event Types', noun: 'event type', hint: 'How events are classified (Service, Wedding, Training…).' },
  { kind: 'meeting-categories', label: 'Scoring Categories', noun: 'category', hint: 'Attendance scoring weights per category of activity.' },
  { kind: 'sub-teams', label: 'Sub-teams & Groups', noun: 'sub-team', hint: 'Unit sub-teams; also used to target restricted events.' },
];

export default function LookupsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<Kind>('event-types');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const meta = TABS.find((t) => t.kind === tab)!;
  const manage = can('lookups.manage');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<Row[]>(`/lookups/${tab}?includeInactive=true`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to lookup tables.' : 'Could not load this table.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, tab]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin" className="hover:text-primary">Dashboard</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Lookup Tables</span>
        </nav>
        <PageHeader
          title="Lookup Tables"
          subtitle="Configurable classifications used across the platform."
          actions={manage ? <Button onClick={() => setEditing('new')}>+ New {meta.noun}</Button> : undefined}
        />

        <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-container p-1">
          {TABS.map((t) => (
            <button
              key={t.kind}
              onClick={() => setTab(t.kind)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.kind ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-on-surface-variant">{meta.hint}</p>

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState title={`No ${meta.label.toLowerCase()} yet`} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="border-b border-outline-variant/20 bg-surface-container-low/60 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">In use</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {tab === 'event-types' && r.extra.color && (
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.extra.color }} />
                        )}
                        <span className="font-semibold text-on-surface">{r.name}</span>
                        {r.isSystem && <Badge tone="info">System</Badge>}
                      </div>
                      {r.description && <div className="text-xs text-on-surface-variant">{r.description}</div>}
                      {tab === 'meeting-categories' && (
                        <div className="text-xs text-on-surface-variant">
                          {r.extra.basePoints} base pts · ×{r.extra.pointWeight} weight
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{r.inUse}</td>
                    <td className="px-4 py-3">
                      {r.active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {manage && (
                          <Button variant="ghost" className="text-xs" onClick={() => setEditing(r)}>
                            Edit
                          </Button>
                        )}
                        {manage && (
                          <Button
                            variant="ghost"
                            className="text-xs text-error"
                            disabled={!r.deletable}
                            title={r.deletable ? '' : r.isSystem ? 'System entries cannot be deleted' : `Used by ${r.inUse} record(s)`}
                            onClick={() => setDeleting(r)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editing && (
        <LookupEditor
          kind={tab}
          noun={meta.noun}
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            notify(msg, 'success');
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name}?`}
        body="This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await fetchApi(`/lookups/${tab}/${deleting.id}`, { method: 'DELETE' });
            notify('Deleted', 'success');
            setDeleting(null);
            load();
          } catch (e) {
            notify(e instanceof Error ? e.message : 'Could not delete', 'error');
          }
        }}
      />
    </div>
  );
}

function LookupEditor({
  kind,
  noun,
  row,
  onClose,
  onSaved,
}: {
  kind: Kind;
  noun: string;
  row: Row | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>({
    name: row?.name ?? '',
    description: row?.description ?? '',
    active: row?.active ?? true,
    color: row?.extra.color ?? '#64748B',
    icon: row?.extra.icon ?? 'event',
    defaultCompulsory: row?.extra.defaultCompulsory ?? false,
    sortOrder: row?.extra.sortOrder ?? 500,
    basePoints: row?.extra.basePoints ?? 10,
    pointWeight: row?.extra.pointWeight ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setFormError('');
    if (String(form.name).trim().length < 2) return setFormError('Enter a name.');
    setSaving(true);
    try {
      const payload: Record<string, any> = { name: form.name.trim(), description: form.description, active: form.active };
      if (kind === 'event-types') Object.assign(payload, { color: form.color, icon: form.icon, defaultCompulsory: form.defaultCompulsory, sortOrder: Number(form.sortOrder) });
      if (kind === 'meeting-categories') Object.assign(payload, { basePoints: Number(form.basePoints), pointWeight: Number(form.pointWeight) });
      if (row) await fetchApi(`/lookups/${kind}/${row.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await fetchApi(`/lookups/${kind}`, { method: 'POST', body: JSON.stringify(payload) });
      onSaved(row ? 'Saved' : 'Created');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Edit ${row.name}` : `New ${noun}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{row ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
        </Field>
        <Field label="Description">
          <input className={inputClass} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={300} />
        </Field>

        {kind === 'event-types' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour">
              <input type="color" className="h-10 w-full rounded-lg border border-outline-variant/50" value={form.color} onChange={(e) => set('color', e.target.value)} />
            </Field>
            <Field label="Sort order">
              <input type="number" className={inputClass} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={form.defaultCompulsory} onChange={(e) => set('defaultCompulsory', e.target.checked)} />
              Attendance is compulsory by default for this type
            </label>
          </div>
        )}

        {kind === 'meeting-categories' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base points" hint="Points awarded for on-time attendance">
              <input type="number" step="any" className={inputClass} value={form.basePoints} onChange={(e) => set('basePoints', e.target.value)} />
            </Field>
            <Field label="Point weight" hint="Multiplier (e.g. Training ×1.5)">
              <input type="number" step="any" className={inputClass} value={form.pointWeight} onChange={(e) => set('pointWeight', e.target.value)} />
            </Field>
          </div>
        )}

        {row && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            Active
          </label>
        )}

        {formError && <p role="alert" className="text-sm font-medium text-error">{formError}</p>}
      </div>
    </Modal>
  );
}
