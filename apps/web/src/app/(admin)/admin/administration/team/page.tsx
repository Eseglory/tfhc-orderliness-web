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
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function AdminTeamPage() {
  const { can, user, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        res.emailDelivered ? 'Invitation email resent' : 'Invitation refreshed — share the link manually',
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin" className="hover:text-primary">Dashboard</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Admin Team</span>
        </nav>

        <PageHeader
          title="Admin Team"
          subtitle="Invite administrators and control their access with roles."
          actions={
            <div className="flex gap-2">
              {can('roles.read') && (
                <Link href="/admin/administration/roles">
                  <Button variant="secondary">Roles &amp; permissions</Button>
                </Link>
              )}
              {can('users.create') && <Button onClick={() => setInviting(true)}>+ Invite admin</Button>}
            </div>
          }
        />

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : team.length === 0 ? (
          <EmptyState
            title="No administrators yet"
            description="Invite your first administrator to help manage the church."
            action={can('users.create') ? <Button onClick={() => setInviting(true)}>+ Invite admin</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-outline-variant/20 bg-surface-container-low/60 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-semibold">Administrator</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Roles</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Last sign-in</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {team.map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-on-surface">{fullName(m)}</div>
                      <div className="text-xs text-on-surface-variant">{m.email}</div>
                      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                        {m.roles.map((r) => (
                          <Badge key={r.id} tone={r.key === 'SUPER_ADMIN' ? 'info' : 'neutral'}>{r.name}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {m.roles.length === 0 ? (
                          <span className="text-xs text-on-surface-variant">No roles</span>
                        ) : (
                          m.roles.map((r) => (
                            <Badge key={r.id} tone={r.key === 'SUPER_ADMIN' ? 'info' : 'neutral'}>{r.name}</Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.invitePending ? (
                        <Badge tone="warning">Invite pending</Badge>
                      ) : m.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="danger">Deactivated</Badge>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-on-surface-variant md:table-cell">{when(m.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {m.invitePending && can('users.create') && (
                          <Button variant="ghost" className="text-xs" loading={busyId === m.id} onClick={() => resend(m)}>
                            Resend
                          </Button>
                        )}
                        {can('users.update') && !m.invitePending && (
                          <Button variant="ghost" className="text-xs" onClick={() => setEditing(m)}>
                            Edit
                          </Button>
                        )}
                        {can('users.deactivate') && m.id !== user?.userId && (
                          <Button
                            variant="ghost"
                            className={`text-xs ${m.isActive ? 'text-error' : 'text-tertiary'}`}
                            loading={busyId === m.id}
                            onClick={() => setConfirm({ member: m, activate: !m.isActive })}
                          >
                            {m.isActive ? 'Deactivate' : 'Reactivate'}
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
    </div>
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
