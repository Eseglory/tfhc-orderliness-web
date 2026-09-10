'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Lock,
  Users,
  KeyRound,
  RefreshCw,
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

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isSuperAdmin: boolean;
  editable: boolean;
  deletable: boolean;
  memberCount: number;
  permissions: string[];
}
interface PermGroup {
  group: string;
  permissions: { key: string; label: string; finance: boolean }[];
}

export default function RolesPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        fetchApi<Role[]>('/access-roles'),
        fetchApi<PermGroup[]>('/access-roles/permissions'),
      ]);
      setRoles(r);
      setCatalog(c);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to roles & permissions.' : 'Could not load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const totalPerms = useMemo(() => catalog.reduce((n, g) => n + g.permissions.length, 0), [catalog]);

  return (
    <AdminLayoutShell activeHref="/admin/settings">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">SETTINGS</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">ROLES &amp; PERMISSIONS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Roles &amp; Access Governance
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure granular module permissions and security roles for staff and administrators.
            </p>
          </div>

          {can('roles.create') && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing('new')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                New Role
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : roles.length === 0 ? (
          <EmptyState title="No roles yet" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <article
                key={role.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl ${role.isSuperAdmin ? 'bg-amber-50 dark:bg-amber-950 text-amber-600' : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600'}`}>
                        <Shield className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">{role.name}</h3>
                        <p className="text-xs text-slate-400">{role.description || 'Custom administrative role'}</p>
                      </div>
                    </div>
                    <Badge tone={role.isSystem ? 'info' : 'neutral'}>
                      {role.isSystem ? 'System' : 'Custom'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Permissions</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {role.isSuperAdmin ? 'Full Access' : `${role.permissions.length} of ${totalPerms}`}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Staff Assigned</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {role.memberCount} administrators
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                  <button
                    className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                    onClick={() => setEditing(role)}
                    disabled={!role.editable && !can('roles.read')}
                  >
                    {role.editable && can('roles.update') ? 'Edit Permissions' : 'View Access'}
                  </button>
                  {can('roles.delete') && (
                    <button
                      className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      disabled={!role.deletable}
                      title={role.deletable ? '' : role.isSystem ? 'System roles cannot be deleted' : 'Role is still assigned to accounts'}
                      onClick={() => setDeleting(role)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <RoleEditor
          role={editing === 'new' ? null : editing}
          catalog={catalog}
          canEdit={editing === 'new' ? can('roles.create') : editing.editable && can('roles.update')}
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
        body="This permanently removes the role. Accounts must be reassigned first."
        confirmLabel="Delete role"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await fetchApi(`/access-roles/${deleting.id}`, { method: 'DELETE' });
            notify('Role deleted', 'success');
            setDeleting(null);
            load();
          } catch (e) {
            notify(e instanceof Error ? e.message : 'Could not delete role', 'error');
          }
        }}
      />
    </AdminLayoutShell>
  );
}

function RoleEditor({
  role,
  catalog,
  canEdit,
  onClose,
  onSaved,
}: {
  role: Role | null;
  catalog: PermGroup[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const readOnly = !canEdit || role?.isSuperAdmin;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleGroup = (group: PermGroup, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      group.permissions.forEach((p) => (on ? next.add(p.key) : next.delete(p.key)));
      return next;
    });

  const submit = async () => {
    setFormError('');
    if (name.trim().length < 2) return setFormError('Give the role a name.');
    if (selected.size === 0) return setFormError('Select at least one permission.');
    setSaving(true);
    try {
      const body = JSON.stringify({ name: name.trim(), description: description.trim(), permissions: [...selected] });
      if (role) {
        await fetchApi(`/access-roles/${role.id}`, { method: 'PATCH', body });
        onSaved('Role updated');
      } else {
        await fetchApi('/access-roles', { method: 'POST', body });
        onSaved('Role created');
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save the role.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={role ? role.name : 'New role'}
      description={role?.isSuperAdmin ? 'The Super Admin role always has every permission and cannot be changed.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button onClick={submit} loading={saving}>
              {role ? 'Save changes' : 'Create role'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!role?.isSystem && (
          <>
            <Field label="Role name" required>
              <input className={inputClass} value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
            <Field label="Description">
              <input
                className={inputClass}
                value={description}
                disabled={readOnly}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                placeholder="What is this role for?"
              />
            </Field>
          </>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-on-surface">Permissions</p>
          {role?.isSuperAdmin ? (
            <p className="rounded-lg bg-surface-container-low p-4 text-sm text-on-surface-variant">
              Full access to every current and future module.
            </p>
          ) : (
            <div className="space-y-3">
              {catalog.map((g) => {
                const groupKeys = g.permissions.map((p) => p.key);
                const allOn = groupKeys.every((k) => selected.has(k));
                const someOn = groupKeys.some((k) => selected.has(k));
                return (
                  <fieldset key={g.group} className="rounded-xl border border-outline-variant/30 p-3">
                    <legend className="flex w-full items-center justify-between gap-2 px-1">
                      <span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{g.group}</span>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => toggleGroup(g, !allOn)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          {allOn ? 'Clear' : 'Select all'}
                        </button>
                      )}
                    </legend>
                    <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                      {g.permissions.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                            checked={selected.has(p.key)}
                            disabled={readOnly}
                            onChange={() => toggle(p.key)}
                          />
                          <span className="text-on-surface">{p.label}</span>
                          {p.finance && <span className="text-[10px] font-bold uppercase text-secondary">$</span>}
                        </label>
                      ))}
                    </div>
                    {someOn && !allOn && <span className="sr-only">Partially selected</span>}
                  </fieldset>
                );
              })}
            </div>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-error">
            {formError}
          </p>
        )}
      </div>
    </Modal>
  );
}
