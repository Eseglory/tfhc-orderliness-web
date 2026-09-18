'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Filter,
  Plus,
  Download,
  Shield,
  Edit,
  Eye,
  Phone,
  Mail,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Copy,
  Check,
  LayoutGrid,
  Table as TableIcon,
  List,
  CreditCard,
  Building2,
  Calendar,
  Sparkles,
  RefreshCw,
  UserPlus,
  Send,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { ProfilePhoto } from '../../../../components/ProfilePhoto';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useToast } from '../../../../components/ui';

type MemberViewMode = 'table' | 'grid' | 'cards' | 'compact';

export default function AdminMembersPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const isSuperOwner = user?.email?.toLowerCase() === 'engreseglory@gmail.com';

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedRegistration, setSelectedRegistration] = useState('');

  // 4 View Modes
  const [viewMode, setViewMode] = useState<MemberViewMode>('table');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [accessMember, setAccessMember] = useState<any>(null);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessStatus, setAccessStatus] = useState('ACTIVE');
  const [accessError, setAccessError] = useState('');

  // Sub-teams
  const [subTeams, setSubTeams] = useState<any[]>([]);

  // Invite Form state
  const [inviteForm, setInviteForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    subTeamId: '',
    roleInUnit: 'Member',
    gender: 'Male',
  });
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [quickInvitingId, setQuickInvitingId] = useState<string | null>(null);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || true;
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState('Male');
  const [roleInUnit, setRoleInUnit] = useState('Member');
  const [editingMember, setEditingMember] = useState<any>(null);
  const [status, setStatus] = useState('ACTIVE');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load view mode preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tfhc_members_view_mode') as MemberViewMode;
      if (saved && ['table', 'grid', 'cards', 'compact'].includes(saved)) {
        setViewMode(saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleSetViewMode = (mode: MemberViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('tfhc_members_view_mode', mode);
    } catch {
      // Ignore
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) {
      try {
        const cached = sessionStorage.getItem('tfhc_cached_members_list');
        const cachedTeams = sessionStorage.getItem('tfhc_cached_subteams_list');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMembers(parsed);
            if (cachedTeams) setSubTeams(JSON.parse(cachedTeams));
            setLoading(false);
          }
        }
      } catch {}
      setLoading((prev) => (members.length > 0 ? false : true));
    }
    try {
      const [memData, teamData] = await Promise.all([
        fetchApi<any[]>('/members'),
        fetchApi<any[]>('/members/sub-teams').catch(() => []),
      ]);
      setMembers(memData || []);
      setSubTeams(teamData || []);
      setPageError('');
      try {
        sessionStorage.setItem('tfhc_cached_members_list', JSON.stringify(memData || []));
        sessionStorage.setItem('tfhc_cached_subteams_list', JSON.stringify(teamData || []));
      } catch {}
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Could not load members. Click refresh to retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) {
      setInviteError('Email address is required to send an invitation.');
      return;
    }
    setInviting(true);
    setInviteError('');
    try {
      const res = await fetchApi<{ status: string; message: string }>('/members/invite', {
        method: 'POST',
        body: JSON.stringify({
          firstName: inviteForm.firstName.trim(),
          lastName: inviteForm.lastName.trim(),
          email: inviteForm.email.trim(),
          phoneNumber: inviteForm.phoneNumber.trim() || undefined,
          subTeamId: inviteForm.subTeamId || undefined,
          roleInUnit: inviteForm.roleInUnit || 'Member',
          gender: inviteForm.gender || 'Male',
        }),
      });
      notify(res.message || 'Platform invitation sent successfully.', 'success');
      setShowInviteModal(false);
      setInviteForm({
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        subTeamId: '',
        roleInUnit: 'Member',
        gender: 'Male',
      });
      loadData();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleQuickInvite = async (m: any) => {
    setQuickInvitingId(m.id);
    try {
      const res = await fetchApi<{ status: string; message: string }>(`/members/${m.id}/invite`, {
        method: 'POST',
      });
      notify(res.message || `Invitation sent to ${m.firstName}.`, 'success');
      loadData();
    } catch (err: any) {
      notify(err.message || 'Failed to send invitation', 'error');
    } finally {
      setQuickInvitingId(null);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStatus, selectedRegistration]);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await fetchApi(editingMember ? `/members/${editingMember.id}` : '/members', {
        method: editingMember ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...(editingMember ? { ...details, status } : {}),
          firstName,
          lastName,
          phoneNumber,
          email: !editingMember && isAdmin && email.trim() ? email.trim() : undefined,
          gender,
          roleInUnit,
        }),
      });

      setShowMemberModal(false);
      setFirstName('');
      setLastName('');
      setPhoneNumber('');
      setEmail('');
      setEditingMember(null);
      notify(editingMember ? 'Member profile updated successfully.' : 'Member registered successfully.', 'success');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save member');
    } finally {
      setSubmitting(false);
    }
  };

  // Export CSV helper
  const handleExportCSV = () => {
    if (members.length === 0) return;
    const headers = ['Member Code', 'First Name', 'Last Name', 'Phone', 'Lookup Email', 'Login Email', 'Role', 'Status', 'Registered', 'Attendance Count', 'Joined Date'];
    const rows = filteredMembers.map((m) => {
      const isRegistered = Boolean(m.user?.emailVerifiedAt || m.user?.googleSubject || m.user?.passwordAuthEnabled);
      return [
        `"${m.memberCode || ''}"`,
        `"${m.firstName || ''}"`,
        `"${m.lastName || ''}"`,
        `"${m.phoneNumber || ''}"`,
        `"${m.approvedMember?.email || ''}"`,
        `"${m.user?.email || ''}"`,
        `"${m.roleInUnit || 'Member'}"`,
        `"${m.status || 'ACTIVE'}"`,
        `"${isRegistered ? 'Yes' : 'No'}"`,
        `"${m._count?.attendanceRecords ?? 0}"`,
        `"${m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ''}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TFHC_Members_Registry_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenEdit = (m: any) => {
    setEditingMember(m);
    setFirstName(m.firstName || '');
    setLastName(m.lastName || '');
    setPhoneNumber(m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : '');
    setEmail(m.approvedMember?.email || m.user?.email || '');
    setGender(m.gender || 'Male');
    setRoleInUnit(m.roleInUnit || 'Member');
    setStatus(m.status || 'ACTIVE');
    setDetails(
      Object.fromEntries(
        [
          'middleName',
          'preferredName',
          'alternatePhoneNumber',
          'profession',
          'birthday',
          'dateOfBirth',
        ].map((k) => [
          k,
          k === 'dateOfBirth'
            ? m[k]?.slice(0, 10) || ''
            : m[k] || '',
        ])
      )
    );
    setFormError('');
    setShowMemberModal(true);
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const q = search.trim().toLowerCase();
      const lookupEmail = (m.approvedMember?.email || '').toLowerCase();
      const loginEmail = (m.user?.email || '').toLowerCase();
      const matchesSearch =
        !q ||
        (m.firstName || '').toLowerCase().includes(q) ||
        (m.lastName || '').toLowerCase().includes(q) ||
        (m.middleName || '').toLowerCase().includes(q) ||
        (m.memberCode || '').toLowerCase().includes(q) ||
        (m.phoneNumber || '').toLowerCase().includes(q) ||
        lookupEmail.includes(q) ||
        loginEmail.includes(q);

      const matchesStatus = selectedStatus ? m.status === selectedStatus : true;

      const isRegistered = Boolean(m.user?.emailVerifiedAt || m.user?.googleSubject || m.user?.passwordAuthEnabled);
      let matchesReg = true;
      if (selectedRegistration === 'registered') matchesReg = isRegistered;
      if (selectedRegistration === 'unregistered') matchesReg = !isRegistered;

      return matchesSearch && matchesStatus && matchesReg;
    });
  }, [members, search, selectedStatus, selectedRegistration]);

  // Paginated records
  const totalRecords = filteredMembers.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

  // Compute active velocity and registered count
  const activeMembersCount = members.filter((m) => m.status === 'ACTIVE').length;
  const registeredCount = members.filter((m) => m.user?.emailVerifiedAt || m.user?.googleSubject || m.user?.passwordAuthEnabled).length;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60',
    NEW_MEMBER: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-800/60',
    ON_LEAVE: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60',
    INACTIVE: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    SUSPENDED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200/60 dark:border-rose-800/60',
  };

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              OPERATIONS DIRECTORY
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Members Directory
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Verified corporate member roster with directory allowlist enforcement, attendance histories, and account status.
            </p>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Total Enrolled Pill */}
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Enrolled</p>
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">{members.length.toLocaleString()}</p>
              </div>
            </div>

            {/* Registered Users Pill */}
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portal Accounts</p>
                <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{registeredCount} / {members.length}</p>
              </div>
            </div>

            {/* Invite Member to Platform button */}
            {isSuperOwner && (
              <button
                onClick={() => {
                  setInviteForm({
                    firstName: '',
                    lastName: '',
                    email: '',
                    phoneNumber: '',
                    subTeamId: '',
                    roleInUnit: 'Member',
                    gender: 'Male',
                  });
                  setInviteError('');
                  setShowInviteModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite Member to Platform</span>
              </button>
            )}

            {/* Lookup Directory link */}
            <Link
              href="/admin/administration/lookups?tab=approved-members"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 transition-all"
            >
              <Users className="w-4 h-4" />
              <span>Lookup Roster &rarr;</span>
            </Link>
          </div>
        </div>

        {pageError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <span>{pageError}</span>
            <button
              onClick={() => loadData(false)}
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all"
            >
              Retry Now
            </button>
          </div>
        )}

        {/* Action & Filter Bar */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, directory email, phone, or membership ID (e.g. TFHC-)..."
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-2.5 p-0.5 rounded text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Action Buttons & 4 View Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => loadData(false)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                title="Refresh Member Registry"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => {
                  setEditingMember(null);
                  setFirstName('');
                  setLastName('');
                  setPhoneNumber('');
                  setEmail('');
                  setRoleInUnit('Member');
                  setGender('Male');
                  setFormError('');
                  setShowMemberModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>

              {/* 4 VIEW MODE TOGGLE BUTTONS */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-950 rounded-xl p-0.5 border border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => handleSetViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Table View"
                >
                  <TableIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSetViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSetViewMode('cards')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Detailed Cards View"
                >
                  <CreditCard className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSetViewMode('compact')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter Pills Row */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1 text-slate-400 font-semibold mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters:</span>
            </div>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="">Status: All</option>
              <option value="ACTIVE">Active Member</option>
              <option value="NEW_MEMBER">New Member</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>

            {/* Registration Status Filter */}
            <select
              value={selectedRegistration}
              onChange={(e) => setSelectedRegistration(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="">Account: All</option>
              <option value="registered">Registered Portal Account</option>
              <option value="unregistered">Directory Only</option>
            </select>

            {/* Reset Filters button */}
            {(selectedStatus || selectedRegistration || search) && (
              <button
                onClick={() => {
                  setSelectedStatus('');
                  setSelectedRegistration('');
                  setSearch('');
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-auto cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PRESENTATION MODES                                                        */}
        {/* ========================================================================= */}

        {loading ? (
          <div className="py-24 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Loading member registry…</p>
          </div>
        ) : paginatedMembers.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No members found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No records match your active search and filter criteria. Adjust your filters or add a new member.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. TABLE VIEW */}
            {viewMode === 'table' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    <thead className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">MEMBER</th>
                        <th className="px-5 py-3.5">DIRECTORY / LOOKUP EMAIL</th>
                        <th className="px-5 py-3.5">PHONE</th>
                        <th className="px-5 py-3.5">STATUS</th>
                        <th className="px-5 py-3.5">ATTENDANCE</th>
                        <th className="px-5 py-3.5 text-right">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {paginatedMembers.map((m) => {
                        const attendanceCount = m._count?.attendanceRecords ?? (m.attendanceRecords?.length ?? 0);
                        const lastAttendance = m.attendanceRecords?.[0]?.createdAt
                          ? new Date(m.attendanceRecords[0].createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : null;

                        return (
                          <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            {/* Member Column */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <Link
                                  href={`/admin/members/${m.id}`}
                                  className="group flex items-center gap-3 hover:opacity-90 transition-opacity"
                                >
                                  {m.profilePhotoUrl ? (
                                    <img
                                      src={m.profilePhotoUrl}
                                      alt={`${m.firstName} avatar`}
                                      className="w-9 h-9 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center text-xs ring-1 ring-indigo-200/70 dark:ring-indigo-800/60 shrink-0">
                                      {m.firstName?.[0] || 'M'}
                                      {m.lastName?.[0] || ''}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate flex items-center gap-1.5">
                                      <span>{m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}</span>
                                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                                        {m.memberCode}
                                      </span>
                                      {m.roleInUnit === 'Executive' || m.user?.role === 'ADMIN' || m.user?.role === 'LEADER' ? (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30">
                                          <Shield className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                          Executive
                                        </span>
                                      ) : m.roleInUnit ? (
                                        <span className="text-[10px] text-slate-400">{m.roleInUnit}</span>
                                      ) : null}
                                      {m.profession && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[150px]">
                                          • {m.profession}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                              </div>
                            </td>

                            {/* Directory Email Column */}
                            <td className="px-5 py-3.5">
                              <div className="space-y-0.5 min-w-[140px]">
                                <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                                  <Mail className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span className="font-medium text-slate-900 dark:text-white truncate max-w-[180px]">
                                    {m.approvedMember?.email || 'Not in lookup table'}
                                  </span>
                                </div>
                                {m.user?.email && m.user.email.toLowerCase() !== (m.approvedMember?.email || '').toLowerCase() && (
                                  <p className="text-[10px] text-slate-400">Login: {m.user.email}</p>
                                )}
                              </div>
                            </td>

                            {/* Phone Column */}
                            <td className="px-5 py-3.5">
                              {m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? (
                                <a href={`tel:${m.phoneNumber}`} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-colors">
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="font-mono font-medium">{m.phoneNumber}</span>
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Not provided</span>
                              )}
                            </td>

                            {/* Member Status Column */}
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full border ${
                                  statusColors[m.status] || statusColors.ACTIVE
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                {m.status?.replace('_', ' ') || 'ACTIVE'}
                              </span>
                            </td>

                            {/* Attendance Column */}
                            <td className="px-5 py-3.5">
                              <div>
                                <p className="font-bold text-xs text-slate-900 dark:text-white">
                                  {attendanceCount > 0 ? `${attendanceCount} Service${attendanceCount > 1 ? 's' : ''}` : '0 Services'}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {lastAttendance ? `Last: ${lastAttendance}` : 'Last seen: Never'}
                                </p>
                              </div>
                            </td>

                              {/* Actions Column */}
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isSuperOwner && !Boolean(m.user?.emailVerifiedAt || m.user?.googleSubject || m.user?.passwordAuthEnabled) && (
                                  <button
                                    onClick={() => handleQuickInvite(m)}
                                    disabled={quickInvitingId === m.id}
                                    className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition-colors cursor-pointer disabled:opacity-50"
                                    title="Send Platform Invitation Email"
                                    aria-label={`Send invitation to ${m.firstName}`}
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                )}

                                <Link
                                  href={`/admin/members/${m.id}`}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="View Profile Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </Link>

                                <button
                                  onClick={() => handleOpenEdit(m)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Edit Member"
                                  aria-label={`Edit ${m.firstName} ${m.lastName}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </button>

                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      setAccessMember(m);
                                      setAccessEmail(m.approvedMember?.email || m.user?.email || '');
                                      setAccessStatus(m.approvedMember?.status || 'ACTIVE');
                                      setAccessError('');
                                    }}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    title="Manage Google Access"
                                    aria-label={`Manage Google access for ${m.firstName} ${m.lastName}`}
                                  >
                                    <Shield className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. GRID VIEW */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedMembers.map((m) => {
                  const attendanceCount = m._count?.attendanceRecords ?? (m.attendanceRecords?.length ?? 0);
                  return (
                    <div
                      key={m.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          {m.profilePhotoUrl ? (
                            <img
                              src={m.profilePhotoUrl}
                              alt={`${m.firstName} avatar`}
                              className="w-12 h-12 rounded-2xl object-cover ring-2 ring-indigo-500/20"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center text-sm ring-1 ring-indigo-200/70 dark:ring-indigo-800/60">
                              {m.firstName?.[0] || 'M'}
                              {m.lastName?.[0] || ''}
                            </div>
                          )}
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              statusColors[m.status] || statusColors.ACTIVE
                            }`}
                          >
                            {m.status?.replace('_', ' ') || 'ACTIVE'}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white line-clamp-1">
                            {m.firstName} {m.lastName}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                              {m.memberCode}
                            </span>
                            {m.roleInUnit === 'Executive' || m.user?.role === 'ADMIN' || m.user?.role === 'LEADER' ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30">
                                <Shield className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                Executive
                              </span>
                            ) : null}
                          </div>
                          {m.profession && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                              {m.profession}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{m.approvedMember?.email || m.user?.email || 'No email registered'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono">{m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : 'No phone'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[11px] font-bold text-slate-400">
                          {attendanceCount} Services
                        </span>
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/admin/members/${m.id}`}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                          >
                            Profile
                          </Link>
                          <button
                            onClick={() => handleOpenEdit(m)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3. CARDS VIEW (Detailed) */}
            {viewMode === 'cards' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paginatedMembers.map((m) => {
                  const attendanceCount = m._count?.attendanceRecords ?? (m.attendanceRecords?.length ?? 0);
                  const isRegistered = Boolean(m.user?.emailVerifiedAt || m.user?.googleSubject || m.user?.passwordAuthEnabled);
                  return (
                    <div
                      key={m.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {m.profilePhotoUrl ? (
                            <img
                              src={m.profilePhotoUrl}
                              alt={`${m.firstName} avatar`}
                              className="w-12 h-12 rounded-2xl object-cover ring-2 ring-indigo-500/20"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center text-sm ring-1 ring-indigo-200/70 dark:ring-indigo-800/60">
                              {m.firstName?.[0] || 'M'}
                              {m.lastName?.[0] || ''}
                            </div>
                          )}
                          <div>
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                              {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                {m.memberCode}
                              </span>
                              {m.roleInUnit === 'Executive' || m.user?.role === 'ADMIN' || m.user?.role === 'LEADER' ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30">
                                  <Shield className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                  Executive
                                </span>
                              ) : m.roleInUnit ? (
                                <span className="text-xs text-slate-400">· {m.roleInUnit}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                            statusColors[m.status] || statusColors.ACTIVE
                          }`}
                        >
                          {m.status?.replace('_', ' ') || 'ACTIVE'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Directory Email</span>
                          <span className="font-semibold text-slate-900 dark:text-white block truncate">
                            {m.approvedMember?.email || 'None'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Phone</span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white block truncate">
                            {m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : 'Not provided'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Profession</span>
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400 block truncate">
                            {m.profession || 'Not specified'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Attendance</span>
                          <span className="font-semibold text-slate-900 dark:text-white block truncate">
                            {attendanceCount} Services logged
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Link
                          href={`/admin/members/${m.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <span>Full Member File</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(m)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setAccessMember(m);
                                setAccessEmail(m.approvedMember?.email || m.user?.email || '');
                                setAccessStatus(m.approvedMember?.status || 'ACTIVE');
                                setAccessError('');
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            >
                              Access
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4. COMPACT VIEW */}
            {viewMode === 'compact' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                {paginatedMembers.map((m) => {
                  const attendanceCount = m._count?.attendanceRecords ?? (m.attendanceRecords?.length ?? 0);
                  return (
                    <div
                      key={m.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-indigo-500" />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {m.firstName} {m.lastName}
                            </span>
                            <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.2 rounded">
                              {m.memberCode}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span>{m.approvedMember?.email || m.user?.email || 'No email'}</span>
                            <span>•</span>
                            <span>{m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : 'No phone'}</span>
                            <span>•</span>
                            <span>{attendanceCount} Services</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${
                            statusColors[m.status] || statusColors.ACTIVE
                          }`}
                        >
                          {m.status?.replace('_', ' ') || 'ACTIVE'}
                        </span>
                        <Link
                          href={`/admin/members/${m.id}`}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls Footer */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-medium">
                Showing{' '}
                <span className="font-bold text-slate-900 dark:text-white">
                  {totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-slate-900 dark:text-white">
                  {Math.min(currentPage * pageSize, totalRecords)}
                </span>{' '}
                of <span className="font-bold text-slate-900 dark:text-white">{totalRecords}</span> members
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Per Page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="px-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Google Access Modal */}
        {accessMember && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="google-access-title"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
              onSubmit={async (e) => {
                e.preventDefault();
                setSubmitting(true);
                setAccessError('');
                try {
                  await fetchApi(`/members/${accessMember.id}/google-access`, {
                    method: 'PUT',
                    body: JSON.stringify({ email: accessEmail, status: accessStatus }),
                  });
                  setAccessMember(null);
                  notify('Google access updated successfully.', 'success');
                  await loadData();
                } catch (error: any) {
                  setAccessError(error.message);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <h2 id="google-access-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Manage Sign-In Access
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authorized identity for {accessMember.firstName} {accessMember.lastName} ({accessMember.memberCode})
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="access-email">
                  Google / Corporate Email Address
                </label>
                <input
                  id="access-email"
                  type="email"
                  required
                  value={accessEmail}
                  readOnly={Boolean(accessMember.user || accessMember.approvedMember)}
                  onChange={(e) => setAccessEmail(e.target.value)}
                  className="w-full rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="access-status">
                  Access Status
                </label>
                <select
                  id="access-status"
                  value={accessStatus}
                  onChange={(e) => setAccessStatus(e.target.value)}
                  className="w-full rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="ACTIVE">Approved &amp; Active</option>
                  <option value="REVOKED">Revoked / Suspended</option>
                </select>
              </div>

              {accessError && <p role="alert" className="text-xs text-rose-500 font-semibold">{accessError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setAccessMember(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Access'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Create/Edit Member Modal */}
        {showMemberModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90dvh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingMember ? 'Edit Member Profile' : 'Register New Member'}
                </h2>
                <button
                  onClick={() => setShowMemberModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {editingMember && (
                <ProfilePhoto
                  value={editingMember.profilePhotoUrl}
                  endpoint={`/members/${editingMember.id}/photo`}
                  onChange={(url) => {
                    setEditingMember((m: any) => ({ ...m, profilePhotoUrl: url }));
                    void loadData();
                  }}
                />
              )}

              <form onSubmit={handleCreateMember} className="space-y-4">
                {formError && <p role="alert" className="text-xs text-rose-500 font-semibold">{formError}</p>}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="firstName">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="lastName">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="phoneNumber">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    required
                    id="phoneNumber"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+234..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {isAdmin && (
                  <div>
                    <label htmlFor="member-google-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Directory / Email Address
                    </label>
                    <input
                      id="member-google-email"
                      type="email"
                      required={!editingMember}
                      readOnly={Boolean(editingMember)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Gender</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="roleInUnit">
                      Role in Unit / Executive Flag
                    </label>
                    <input
                      type="text"
                      id="roleInUnit"
                      list="executive-roles-list"
                      value={roleInUnit}
                      onChange={(e) => setRoleInUnit(e.target.value)}
                      placeholder="e.g. Member, Executive, Unit Head, Secretary..."
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none"
                    />
                    <datalist id="executive-roles-list">
                      <option value="Member" />
                      <option value="Executive" />
                      <option value="Unit Head" />
                      <option value="President" />
                      <option value="Vice President" />
                      <option value="Secretary" />
                      <option value="Financial Secretary" />
                      <option value="Coordinator" />
                      <option value="Director" />
                    </datalist>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Setting an executive role grants access to the private <strong>Executive chat room</strong> and leadership channels.
                    </p>
                  </div>
                </div>

                {editingMember && (
                  <div>
                    <label htmlFor="member-status-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                    <select
                      id="member-status-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none"
                    >
                      {['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXEMPT', 'NEW_MEMBER'].map((v) => (
                        <option key={v} value={v}>
                          {v.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowMemberModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white shadow-sm shadow-indigo-600/20 cursor-pointer"
                  >
                    {submitting ? 'Saving...' : 'Save Member Record'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invite Member to Platform Modal */}
        {isSuperOwner && showInviteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[90dvh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                      Invite Member to Platform
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Send an official registration invitation to a church member
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-300 leading-relaxed">
                <strong>Platform Member Invitation:</strong> The recipient will receive an email with a secure, 1-click magic invite link to complete their member profile and access the member dashboard.
              </div>

              <form onSubmit={handleInviteMemberSubmit} className="space-y-4">
                {inviteError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    {inviteError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" htmlFor="inv-firstName">
                      First Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      id="inv-firstName"
                      value={inviteForm.firstName}
                      onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                      placeholder="e.g. Samuel"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" htmlFor="inv-lastName">
                      Last Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      id="inv-lastName"
                      value={inviteForm.lastName}
                      onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                      placeholder="e.g. Adebayo"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" htmlFor="inv-email">
                    Member Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    id="inv-email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="member@gmail.com"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Invitation link will be dispatched to this email address.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" htmlFor="inv-phone">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      id="inv-phone"
                      value={inviteForm.phoneNumber}
                      onChange={(e) => setInviteForm({ ...inviteForm, phoneNumber: e.target.value })}
                      placeholder="+234..."
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" htmlFor="inv-subteam">
                      Sub-Team
                    </label>
                    <select
                      id="inv-subteam"
                      value={inviteForm.subTeamId}
                      onChange={(e) => setInviteForm({ ...inviteForm, subTeamId: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">No sub-team assigned</option>
                      {subTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Gender
                    </label>
                    <select
                      value={inviteForm.gender}
                      onChange={(e) => setInviteForm({ ...inviteForm, gender: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" htmlFor="inv-role">
                      Role in Unit
                    </label>
                    <input
                      type="text"
                      id="inv-role"
                      list="inv-roles-list"
                      value={inviteForm.roleInUnit}
                      onChange={(e) => setInviteForm({ ...inviteForm, roleInUnit: e.target.value })}
                      placeholder="e.g. Member, Executive..."
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none"
                    />
                    <datalist id="inv-roles-list">
                      <option value="Member" />
                      <option value="Executive" />
                      <option value="Unit Head" />
                      <option value="Secretary" />
                      <option value="Financial Secretary" />
                      <option value="Coordinator" />
                    </datalist>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-extrabold text-xs text-white shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{inviting ? 'Sending Invitation...' : 'Send Platform Invitation'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
