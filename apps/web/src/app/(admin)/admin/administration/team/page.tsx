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
  AlertTriangle,
  Ban,
  Check,
  Lock,
  Unlock,
  MoreVertical,
  SlidersHorizontal,
  ExternalLink,
  Phone,
  Calendar,
  Key,
  Download,
  Eye,
  FileText,
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
  photoUrl?: string | null;
  isActive: boolean;
  invitePending: boolean;
  inviteExpiresAt: string | null;
  invitedAt?: string | null;
  inviteAcceptedAt?: string | null;
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

type FilterTab = 'all' | 'active' | 'pending' | 'blocked';

const fullName = (m: TeamMember) =>
  [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Never';

export default function AdminUsersAndTeamPage() {
  const { can, user, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const isSuperOwner = user?.email?.toLowerCase() === 'engreseglory@gmail.com';

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals and Drawers
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [viewingUser, setViewingUser] = useState<TeamMember | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<{
    member: TeamMember;
    block: boolean;
  } | null>(null);
  const [blockReason, setBlockReason] = useState('');
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
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have access to the admin team.'
          : 'Could not load users and team accounts.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const handleToggleActive = async (member: TeamMember, block: boolean) => {
    setBusyId(member.id);
    try {
      await fetchApi(
        `/admin/team/${member.id}/${block ? 'deactivate' : 'reactivate'}`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: blockReason.trim() || undefined }),
        },
      );
      notify(
        block
          ? `User ${fullName(member)} has been blocked & deactivated.`
          : `User ${fullName(member)} has been reactivated & unblocked.`,
        'success',
      );
      setConfirmBlock(null);
      setBlockReason('');
      if (viewingUser?.id === member.id) {
        setViewingUser(null);
      }
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Operation failed.', 'error');
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
        res.emailDelivered
          ? `Invitation email resent to ${member.email}`
          : 'Invitation refreshed — one-time link copied to clipboard.',
        'info',
      );
      if (res.inviteUrl) {
        await navigator.clipboard?.writeText(res.inviteUrl).catch(() => undefined);
      }
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not resend invite.', 'error');
    } finally {
      setBusyId('');
    }
  };

  // Stats calculation
  const stats = useMemo(() => {
    const activeCount = team.filter((m) => m.isActive && !m.invitePending).length;
    const pendingCount = team.filter((m) => m.invitePending).length;
    const blockedCount = team.filter((m) => !m.isActive).length;
    const superAdminCount = team.filter(
      (m) => m.isSuperAdmin || m.roles.some((r) => r.key === 'SUPER_ADMIN'),
    ).length;
    return { activeCount, pendingCount, blockedCount, superAdminCount };
  }, [team]);

  // Filtered dataset
  const filtered = useMemo(() => {
    return team.filter((m) => {
      // Tab filter
      if (activeTab === 'active' && (!m.isActive || m.invitePending)) return false;
      if (activeTab === 'pending' && !m.invitePending) return false;
      if (activeTab === 'blocked' && m.isActive) return false;

      // Role filter
      if (roleFilter !== 'ALL') {
        const hasRole = m.roles.some((r) => r.id === roleFilter || r.key === roleFilter);
        if (!hasRole) return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          fullName(m).toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.phoneNumber && m.phoneNumber.includes(q)) ||
          m.roles.some((r) => r.name.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [team, activeTab, roleFilter, search]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">
                ADMINISTRATION
              </Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                USERS &amp; TEAM GOVERNANCE
              </span>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                User Management &amp; Administrative Team
              </h1>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage system users, invite administrators and team leads, configure RBAC role assignments, and enforce account security controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {can('roles.read') && (
              <Link
                href="/admin/administration/roles"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-500" />
                <span>Roles &amp; Permissions</span>
              </Link>
            )}

            {isSuperOwner && can('users.create') && (
              <button
                onClick={() => setInviting(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite Administrator</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Real-time KPI Metric Cards */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-1 sm:pb-0">
          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                ACTIVE ACCOUNTS
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {stats.activeCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">Authorized &amp; active users</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                PENDING INVITATIONS
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Mail className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {stats.pendingCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">Awaiting password setup</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                BLOCKED / DEACTIVATED
              </span>
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600">
                <Ban className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {stats.blockedCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">Access revoked &amp; locked</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                SUPER ADMINS
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {stats.superAdminCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">Full system governance</p>
          </div>
        </div>

        {/* Tab & Search Filtering Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar">
              {[
                { key: 'all', label: `All Users (${team.length})` },
                { key: 'active', label: `Active (${stats.activeCount})` },
                { key: 'pending', label: `Pending Invites (${stats.pendingCount})` },
                { key: 'blocked', label: `Blocked / Deactivated (${stats.blockedCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as FilterTab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    activeTab === tab.key
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Role Filter & Search */}
            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none"
              >
                <option value="ALL">All Roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                  placeholder="Search by name, email, role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* User Table */}
        {loading ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState
            title="Unavailable"
            description={error}
            action={
              <Button variant="secondary" onClick={load}>
                Retry
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No Users Found"
            description="Adjust your search query or invite a new administrator."
            action={
              can('users.create') ? (
                <Button onClick={() => setInviting(true)}>+ Invite Administrator</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">User Profile</th>
                    <th className="hidden px-4 py-3.5 sm:table-cell">Phone Number</th>
                    <th className="hidden px-4 py-3.5 md:table-cell">Assigned Roles</th>
                    <th className="px-4 py-3.5">Account Status</th>
                    <th className="hidden px-4 py-3.5 lg:table-cell">Last Login</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filtered.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-2xl text-white font-black text-xs flex items-center justify-center shrink-0 ${
                              m.isActive
                                ? 'bg-indigo-600'
                                : 'bg-slate-400 dark:bg-slate-700'
                            }`}
                          >
                            {m.firstName ? m.firstName[0] : m.email[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <button
                              onClick={() => setViewingUser(m)}
                              className="font-bold text-slate-900 dark:text-white text-sm hover:text-indigo-600 text-left truncate block"
                            >
                              {fullName(m)}
                            </button>
                            <div className="text-[11px] text-slate-400 truncate">{m.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="hidden px-4 py-3.5 text-slate-500 sm:table-cell">
                        {m.phoneNumber || <span className="text-slate-400">—</span>}
                      </td>

                      <td className="hidden px-4 py-3.5 md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {m.roles.length === 0 ? (
                            <span className="text-slate-400 text-xs">No roles</span>
                          ) : (
                            m.roles.map((r) => (
                              <Badge
                                key={r.id}
                                tone={r.key === 'SUPER_ADMIN' ? 'info' : 'neutral'}
                              >
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
                          <Badge tone="danger">Blocked / Inactive</Badge>
                        )}
                      </td>

                      <td className="hidden px-4 py-3.5 text-slate-400 lg:table-cell">
                        {when(m.lastLoginAt)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end items-center gap-1.5">
                          <button
                            onClick={() => setViewingUser(m)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="View User Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {isSuperOwner && m.invitePending && can('users.create') && (
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
                              Edit Roles
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
                              onClick={() =>
                                setConfirmBlock({ member: m, block: m.isActive })
                              }
                            >
                              {m.isActive ? 'Block User' : 'Unblock User'}
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

      {/* ============================================================ */}
      {/* USER DETAILS DRAWER / MODAL */}
      {/* ============================================================ */}
      {viewingUser && (
        <Modal
          open
          onClose={() => setViewingUser(null)}
          size="lg"
          title={`User Profile: ${fullName(viewingUser)}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <div>
                {can('users.deactivate') && viewingUser.id !== user?.userId && (
                  <button
                    onClick={() => {
                      setConfirmBlock({
                        member: viewingUser,
                        block: viewingUser.isActive,
                      });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      viewingUser.isActive
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    {viewingUser.isActive ? 'Block / Deactivate Account' : 'Unblock Account'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setViewingUser(null)}>
                  Close
                </Button>
                {can('users.update') && (
                  <Button
                    onClick={() => {
                      setEditing(viewingUser);
                      setViewingUser(null);
                    }}
                  >
                    Edit Roles
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-xs">
            {/* User Profile Header Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-4">
              <div
                className={`w-14 h-14 rounded-2xl text-white font-black text-xl flex items-center justify-center shrink-0 shadow-md ${
                  viewingUser.isActive ? 'bg-indigo-600' : 'bg-slate-500'
                }`}
              >
                {viewingUser.firstName ? viewingUser.firstName[0] : viewingUser.email[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {fullName(viewingUser)}
                  </h3>
                  {viewingUser.isActive ? (
                    <span className="px-2 py-0.2 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      ACTIVE
                    </span>
                  ) : (
                    <span className="px-2 py-0.2 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      BLOCKED / INACTIVE
                    </span>
                  )}
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">{viewingUser.email}</p>
                {viewingUser.phoneNumber && (
                  <p className="text-slate-400 mt-0.5">{viewingUser.phoneNumber}</p>
                )}
              </div>
            </div>

            {/* Account Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  ACCOUNT CREATED
                </span>
                <span className="font-bold text-slate-900 dark:text-white mt-1 block">
                  {when(viewingUser.createdAt)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  LAST SIGN-IN
                </span>
                <span className="font-bold text-slate-900 dark:text-white mt-1 block">
                  {when(viewingUser.lastLoginAt)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  SUPER ADMIN ACCESS
                </span>
                <span className="font-bold text-slate-900 dark:text-white mt-1 block">
                  {viewingUser.isSuperAdmin ? 'YES (Full Root)' : 'No'}
                </span>
              </div>
            </div>

            {/* Assigned Roles List */}
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                ASSIGNED ACCESS ROLES &amp; PERMISSIONS
              </span>
              <div className="space-y-2">
                {viewingUser.roles.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-500" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{r.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{r.key}</p>
                      </div>
                    </div>
                    {r.key === 'SUPER_ADMIN' && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                        ALL MODULES
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Invite Modal */}
      {isSuperOwner && inviting && (
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

      {/* Edit Roles Modal */}
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

      {/* Block / Deactivate Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmBlock)}
        title={
          confirmBlock?.block
            ? `Block user ${confirmBlock && fullName(confirmBlock.member)}?`
            : `Unblock user ${confirmBlock && fullName(confirmBlock.member)}?`
        }
        body={
          confirmBlock?.block
            ? 'Blocking this user immediately revokes all active session tokens and prohibits them from logging in or performing any operations on the platform.'
            : 'Unblocking this user restores their active access and allows them to sign in with their existing credentials.'
        }
        tone={confirmBlock?.block ? 'danger' : 'primary'}
        confirmLabel={confirmBlock?.block ? 'Block & Deactivate' : 'Unblock Account'}
        loading={Boolean(busyId)}
        onCancel={() => {
          setConfirmBlock(null);
          setBlockReason('');
        }}
        onConfirm={() =>
          confirmBlock && handleToggleActive(confirmBlock.member, confirmBlock.block)
        }
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
        <label
          key={r.id}
          className="flex items-start gap-2 rounded-lg border border-outline-variant/30 p-2.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
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
            <span className="font-semibold text-slate-900 dark:text-white">{r.name}</span>
            {r.key === 'SUPER_ADMIN' && (
              <span className="ml-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                (Full Root System Access)
              </span>
            )}
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
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [link, setLink] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setFormError('');
    if (!form.email.includes('@')) return setFormError('Enter a valid email.');
    if (!form.firstName.trim() || !form.lastName.trim())
      return setFormError('Enter their name.');
    if (form.phoneNumber.trim().length < 7)
      return setFormError('Enter a valid phone number.');
    if (selected.size === 0) return setFormError('Assign at least one role.');
    setSaving(true);
    try {
      const res = await fetchApi<{ emailDelivered: boolean; inviteUrl?: string }>(
        '/admin/team',
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            email: form.email.trim(),
            roleIds: [...selected],
          }),
        },
      );
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
        title="Invitation Created"
        description="Share this one-time setup link with the new administrator."
        footer={
          <Button onClick={() => onDone('Administrator invited — share the link', 'info')}>
            Done
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              className={`${inputClass} font-mono text-xs`}
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(link).catch(() => undefined)}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            The link expires in 7 days and can only be used once.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite Administrator / Staff"
      description="The user will receive an email to set a password and activate their account."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Send Invitation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input
              className={inputClass}
              value={form.firstName}
              onChange={set('firstName')}
              maxLength={80}
            />
          </Field>
          <Field label="Last name" required>
            <input
              className={inputClass}
              value={form.lastName}
              onChange={set('lastName')}
              maxLength={80}
            />
          </Field>
        </div>
        <Field label="Email" required>
          <input
            className={inputClass}
            type="email"
            value={form.email}
            onChange={set('email')}
            maxLength={254}
          />
        </Field>
        <Field label="Phone number" required>
          <input
            className={inputClass}
            value={form.phoneNumber}
            onChange={set('phoneNumber')}
            maxLength={32}
          />
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold">Access Roles *</legend>
          <RolePicker roles={roles} selected={selected} onChange={setSelected} />
          <p className="text-xs text-on-surface-variant">Determines administrative permissions and module access.</p>
        </fieldset>
        {formError && (
          <p role="alert" className="text-sm font-medium text-rose-600">
            {formError}
          </p>
        )}
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
  const [selected, setSelected] = useState<Set<string>>(
    new Set(member.roles.map((r) => r.id)),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input
              className={inputClass}
              value={form.firstName}
              onChange={set('firstName')}
              maxLength={80}
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputClass}
              value={form.lastName}
              onChange={set('lastName')}
              maxLength={80}
            />
          </Field>
        </div>
        <Field label="Phone number">
          <input
            className={inputClass}
            value={form.phoneNumber}
            onChange={set('phoneNumber')}
            maxLength={32}
          />
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold">Roles *</legend>
          <RolePicker roles={roles} selected={selected} onChange={setSelected} />
        </fieldset>
        {formError && (
          <p role="alert" className="text-sm font-medium text-rose-600">
            {formError}
          </p>
        )}
      </div>
    </Modal>
  );
}
