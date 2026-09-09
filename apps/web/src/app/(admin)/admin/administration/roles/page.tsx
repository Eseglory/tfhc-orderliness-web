'use client';
import React, { useEffect, useMemo, useState } from 'react';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const totalPerms = useMemo(() => catalog.reduce((n, g) => n + g.permissions.length, 0), [catalog]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin" className="hover:text-primary">Dashboard</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Roles &amp; Permissions</span>
        </nav>

        <PageHeader
          title="Roles & Permissions"
          subtitle="Control what each administrator can see and do. Super Admin always has full access."
          actions={
            can('roles.create') ? (
              <Button onClick={() => setEditing('new')}>+ New role</Button>
            ) : undefined
          }
        />

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : roles.length === 0 ? (
          <EmptyState title="No roles yet" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {roles.map((role) => (
              <article key={role.id} className="flex flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-on-surface">{role.name}</h3>
                    <p className="mt-0.5 text-xs text-on-surface-variant">{role.description || '—'}</p>
                  </div>
                  <Badge tone={role.isSystem ? 'info' : 'neutral'}>{role.isSystem ? 'System' : 'Custom'}</Badge>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-on-surface-variant">
                  <span>
                    <strong className="text-on-surface">
                      {role.isSuperAdmin ? 'All' : role.permissions.length}
                    </strong>{' '}
                    {role.isSuperAdmin ? 'permissions' : `of ${totalPerms} permissions`}
                  </span>
                  <span>
                    <strong className="text-on-surface">{role.memberCount}</strong> assigned
                  </span>
                </div>
                <div className="mt-4 flex gap-2 border-t border-outline-variant/20 pt-3">
                  <Button
                    variant="secondary"
                    className="text-xs"
                    onClick={() => setEditing(role)}
                    disabled={!role.editable && !can('roles.read')}
                  >
                    {role.editable && can('roles.update') ? 'Edit' : 'View'}
                  </Button>
                  {can('roles.delete') && (
                    <Button
                      variant="ghost"
                      className="text-xs text-error"
                      disabled={!role.deletable}
                      title={role.deletable ? '' : role.isSystem ? 'System roles cannot be deleted' : 'Role is still assigned to accounts'}
                      onClick={() => setDeleting(role)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

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
    </div>
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
