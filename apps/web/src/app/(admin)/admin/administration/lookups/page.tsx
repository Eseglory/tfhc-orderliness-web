'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Database,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Sliders,
  Layers,
  Tag,
  Users,
  Award,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
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

const TABS: { kind: Kind; label: string; noun: string; hint: string; icon: any }[] = [
  { kind: 'event-types', label: 'Event Types', noun: 'event type', hint: 'How gatherings are classified (Services, Vigils, Rehearsals, Conferences).', icon: Tag },
  { kind: 'meeting-categories', label: 'Scoring Categories', noun: 'category', hint: 'Attendance points & weight multipliers awarded per gathering classification.', icon: Award },
  { kind: 'sub-teams', label: 'Sub-teams & Groups', noun: 'sub-team', hint: 'Unit departments, sub-teams, and group assignments.', icon: Users },
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
  }, [authLoading, tab]);

  return (
    <AdminLayoutShell activeHref="/admin/settings">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">SETTINGS</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">CLASSIFICATIONS &amp; LOOKUPS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                System Classifications &amp; Lookups
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage system taxonomy, meeting scoring weights, sub-teams, and platform classifications.
            </p>
          </div>

          {manage && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing('new')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                New {meta.noun}
              </button>
            </div>
          )}
        </div>

        {/* Tab Strip */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isSelected = tab === t.kind;
              return (
                <button
                  key={t.kind}
                  onClick={() => setTab(t.kind)}
                  className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 pl-1">{meta.hint}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState title={`No ${meta.label.toLowerCase()} yet`} action={manage ? <Button onClick={() => setEditing('new')}>+ New {meta.noun}</Button> : undefined} />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Classification Name</th>
                    <th className="px-4 py-3.5">Associated Records</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {tab === 'event-types' && r.extra.color && (
                            <span className="h-3 w-3 shrink-0 rounded-full shadow-xs" style={{ background: r.extra.color }} />
                          )}
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{r.name}</span>
                          {r.isSystem && <Badge tone="info">System</Badge>}
                        </div>
                        {r.description && <div className="text-[11px] text-slate-400 mt-0.5">{r.description}</div>}
                        {tab === 'meeting-categories' && (
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                            {r.extra.basePoints} base pts · ×{r.extra.pointWeight} score multiplier
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 font-bold">
                        {r.inUse} <span className="font-normal text-slate-400 text-[11px]">in use</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {r.active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          {manage && (
                            <button
                              className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                              onClick={() => setEditing(r)}
                            >
                              Edit
                            </button>
                          )}
                          {manage && (
                            <button
                              className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                              disabled={!r.deletable}
                              title={r.deletable ? '' : r.isSystem ? 'System entries cannot be deleted' : `Used by ${r.inUse} record(s)`}
                              onClick={() => setDeleting(r)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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
    </AdminLayoutShell>
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
