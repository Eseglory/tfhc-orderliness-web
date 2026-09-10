'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Mail,
  RefreshCw,
  Search,
  Filter,
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

interface TeamMember {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  invitePending: boolean;
  inviteExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; key: string; name: string }[];
  isSuperAdmin: boolean;
}
interface RoleOption {
  id: string;
  key: string;
  name: string;
  isSuperAdmin: boolean;
}

const fullName = (m: TeamMember) => [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never');

export default function AdminTeamPage() {
  const { can, user, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [confirm, setConfirm] = useState<{ member: TeamMember; activate: boolean } | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([
        fetchApi<TeamMember[]>('/admin/team'),
        fetchApi<RoleOption[]>('/access-roles').catch(() => [] as RoleOption[]),
      ]);
      setTeam(t);
      setRoles(r);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to the admin team.' : 'Could not load the team.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const setActive = async (member: TeamMember, activate: boolean) => {
    setBusyId(member.id);
    try {
      await fetchApi(`/admin/team/${member.id}/${activate ? 'reactivate' : 'deactivate'}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      notify(activate ? 'Account reactivated' : 'Account deactivated', 'success');
      setConfirm(null);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const resend = async (member: TeamMember) => {
    setBusyId(member.id);
    try {
      const res = await fetchApi<{ emailDelivered: boolean; inviteUrl?: string }>(
        `/admin/team/${member.id}/resend-invite`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      notify(
        res.emailDelivered ? 'Invitation email resent' : 'Invitation refreshed — link copied to clipboard',
        res.emailDelivered ? 'success' : 'info',
      );
      if (res.inviteUrl) await navigator.clipboard?.writeText(res.inviteUrl).catch(() => undefined);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not resend invite', 'error');
    } finally {
      setBusyId('');
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return team;
    const q = search.toLowerCase();
    return team.filter(
      (m) =>
        fullName(m).toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.roles.some((r) => r.name.toLowerCase().includes(q)),
    );
  }, [team, search]);

  const stats = useMemo(() => {
    const activeCount = team.filter((m) => m.isActive && !m.invitePending).length;
    const pendingCount = team.filter((m) => m.invitePending).length;
    const superAdminCount = team.filter((m) => m.isSuperAdmin || m.roles.some((r) => r.key === 'SUPER_ADMIN')).length;
    return { activeCount, pendingCount, superAdminCount };
  }, [team]);

  return (
    <AdminLayoutShell activeHref="/admin/settings">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">SETTINGS</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">ADMIN TEAM</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Administration Team &amp; Accounts
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Invite pastoral staff, ministry executives, and manage access roles and account status.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {can('roles.read') && (
              <Link
                href="/admin/administration/roles"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-500" />
                Roles &amp; Access
              </Link>
            )}
            {can('users.create') && (
              <button
                onClick={() => setInviting(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
              >
                <UserPlus className="w-4 h-4" />
                Invite Admin
              </button>
            )}
          </div>
        </div>

        {/* 3 Metric KPI Cards */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-3 gap-4 pb-1 sm:pb-0">
          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Active Staff</span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.activeCount}</p>
            <p className="mt-1 text-xs text-slate-500">Authorized active accounts</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Pending Invites</span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Mail className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.pendingCount}</p>
            <p className="mt-1 text-xs text-slate-500">Invitations awaiting setup</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Super Admins</span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.superAdminCount}</p>
            <p className="mt-1 text-xs text-slate-500">Full system governance</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              placeholder="Search staff by name, email or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-slate-400 font-bold">{filtered.length} administrators</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No Administrators Found"
            description="Invite your first administrator or adjust your search filter."
            action={can('users.create') ? <Button onClick={() => setInviting(true)}>+ Invite Admin</Button> : undefined}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Administrator</th>
                    <th className="hidden px-4 py-3.5 sm:table-cell">Assigned Roles</th>
                    <th className="px-4 py-3.5">Account Status</th>
                    <th className="hidden px-4 py-3.5 md:table-cell">Last Sign-in</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-black text-xs flex items-center justify-center shrink-0">
                            {m.firstName ? m.firstName[0] : m.email[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{fullName(m)}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3.5 sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {m.roles.length === 0 ? (
                            <span className="text-slate-400 text-xs">No roles assigned</span>
                          ) : (
                            m.roles.map((r) => (
                              <Badge key={r.id} tone={r.key === 'SUPER_ADMIN' ? 'info' : 'neutral'}>
                                {r.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {m.invitePending ? (
                          <Badge tone="warning">Invite Pending</Badge>
                        ) : m.isActive ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge tone="danger">Deactivated</Badge>
                        )}
                      </td>
                      <td className="hidden px-4 py-3.5 text-slate-400 md:table-cell">{when(m.lastLoginAt)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          {m.invitePending && can('users.create') && (
                            <button
                              disabled={busyId === m.id}
                              className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                              onClick={() => resend(m)}
                            >
                              Resend Invite
                            </button>
                          )}
                          {can('users.update') && !m.invitePending && (
                            <button
                              className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                              onClick={() => setEditing(m)}
                            >
                              Edit
                            </button>
                          )}
                          {can('users.deactivate') && m.id !== user?.userId && (
                            <button
                              disabled={busyId === m.id}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                                m.isActive
                                  ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                                  : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                              }`}
                              onClick={() => setConfirm({ member: m, activate: !m.isActive })}
                            >
                              {m.isActive ? 'Deactivate' : 'Reactivate'}
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

      {inviting && (
        <InviteModal
          roles={roles}
          onClose={() => setInviting(false)}
          onDone={(msg, tone) => {
            setInviting(false);
            notify(msg, tone);
            load();
          }}
        />
      )}

      {editing && (
        <EditModal
          member={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            notify(msg, 'success');
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.activate ? `Reactivate ${confirm && fullName(confirm.member)}?` : `Deactivate ${confirm && fullName(confirm.member)}?`}
        body={
          confirm?.activate
            ? 'They will be able to sign in again with their existing password.'
            : 'They will be signed out immediately and cannot sign in until reactivated.'
        }
        tone={confirm?.activate ? 'primary' : 'danger'}
        confirmLabel={confirm?.activate ? 'Reactivate' : 'Deactivate'}
        loading={Boolean(busyId)}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && setActive(confirm.member, confirm.activate)}
      />
    </AdminLayoutShell>
  );
}

function RolePicker({
  roles,
  selected,
  onChange,
}: {
  roles: RoleOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="space-y-1.5">
      {roles.map((r) => (
        <label key={r.id} className="flex items-start gap-2 rounded-lg border border-outline-variant/30 p-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
            checked={selected.has(r.id)}
            onChange={() => {
              const next = new Set(selected);
              next.has(r.id) ? next.delete(r.id) : next.add(r.id);
              onChange(next);
            }}
          />
          <span>
            <span className="font-semibold text-on-surface">{r.name}</span>
            {r.key === 'SUPER_ADMIN' && <span className="ml-1.5 text-xs text-secondary">full access</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function InviteModal({
  roles,
  onClose,
  onDone,
}: {
  roles: RoleOption[];
  onClose: () => void;
  onDone: (message: string, tone: 'success' | 'info') => void;
}) {
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phoneNumber: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [link, setLink] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setFormError('');
    if (!form.email.includes('@')) return setFormError('Enter a valid email.');
    if (!form.firstName.trim() || !form.lastName.trim()) return setFormError('Enter their name.');
    if (form.phoneNumber.trim().length < 7) return setFormError('Enter a phone number.');
    if (selected.size === 0) return setFormError('Assign at least one role.');
    setSaving(true);
    try {
      const res = await fetchApi<{ emailDelivered: boolean; inviteUrl?: string }>('/admin/team', {
        method: 'POST',
        body: JSON.stringify({ ...form, email: form.email.trim(), roleIds: [...selected] }),
      });
      if (res.emailDelivered) {
        onDone(`Invitation sent to ${form.email.trim()}`, 'success');
      } else if (res.inviteUrl) {
        setLink(res.inviteUrl);
      } else {
        onDone('Administrator invited', 'success');
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not send the invitation.');
    } finally {
      setSaving(false);
    }
  };

  if (link) {
    return (
      <Modal
        open
        onClose={() => onDone('Administrator invited — share the link', 'info')}
        title="Invitation created"
        description="Email delivery is unavailable right now. Share this one-time link with the new administrator."
        footer={<Button onClick={() => onDone('Administrator invited — share the link', 'info')}>Done</Button>}
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <input readOnly value={link} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(link).catch(() => undefined)}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant">The link expires in 7 days and can only be used once.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite administrator"
      description="They receive an email to set a password and sign in."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Send invitation</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input className={inputClass} value={form.firstName} onChange={set('firstName')} maxLength={80} />
          </Field>
          <Field label="Last name" required>
            <input className={inputClass} value={form.lastName} onChange={set('lastName')} maxLength={80} />
          </Field>
        </div>
        <Field label="Email" required>
          <input className={inputClass} type="email" value={form.email} onChange={set('email')} maxLength={254} />
        </Field>
        <Field label="Phone number" required>
          <input className={inputClass} value={form.phoneNumber} onChange={set('phoneNumber')} maxLength={32} />
        </Field>
        <Field label="Roles" required hint="Determines what this administrator can access.">
          <RolePicker roles={roles} selected={selected} onChange={setSelected} />
        </Field>
        {formError && <p role="alert" className="text-sm font-medium text-error">{formError}</p>}
      </div>
    </Modal>
  );
}

function EditModal({
  member,
  roles,
  onClose,
  onDone,
}: {
  member: TeamMember;
  roles: RoleOption[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [form, setForm] = useState({
    firstName: member.firstName ?? '',
    lastName: member.lastName ?? '',
    phoneNumber: member.phoneNumber ?? '',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set(member.roles.map((r) => r.id)));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setFormError('');
    if (selected.size === 0) return setFormError('Assign at least one role.');
    setSaving(true);
    try {
      await fetchApi(`/admin/team/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, roleIds: [...selected] }),
      });
      onDone('Administrator updated');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${fullName(member)}`}
      description={member.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input className={inputClass} value={form.firstName} onChange={set('firstName')} maxLength={80} />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={form.lastName} onChange={set('lastName')} maxLength={80} />
          </Field>
        </div>
        <Field label="Phone number">
          <input className={inputClass} value={form.phoneNumber} onChange={set('phoneNumber')} maxLength={32} />
        </Field>
        <Field label="Roles" required>
          <RolePicker roles={roles} selected={selected} onChange={setSelected} />
        </Field>
        {formError && <p role="alert" className="text-sm font-medium text-error">{formError}</p>}
      </div>
    </Modal>
  );
}
