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
  Phone,
  Mail,
  MoreVertical,
  CheckCircle2,
  Clock,
  UserX,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Building2,
  Copy,
  Check,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { ProfilePhoto } from '../../../../components/ProfilePhoto';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

export default function AdminMembersPage() {
  const { user } = useAuth();

  const [members, setMembers] = useState<any[]>([]);
  const [subTeams, setSubTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSubTeam, setSelectedSubTeam] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showSubTeamModal, setShowSubTeamModal] = useState(false);
  const [viewingMember, setViewingMember] = useState<any>(null);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessMember, setAccessMember] = useState<any>(null);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessStatus, setAccessStatus] = useState('ACTIVE');
  const [accessError, setAccessError] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState('Male');
  const [subTeamId, setSubTeamId] = useState('');
  const [roleInUnit, setRoleInUnit] = useState('Member');
  const [subTeamName, setSubTeamName] = useState('');
  const [editingMember, setEditingMember] = useState<any>(null);
  const [status, setStatus] = useState('ACTIVE');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [memData, stData, meUser] = await Promise.all([
        fetchApi<any[]>('/members'),
        fetchApi<any[]>('/members/sub-teams'),
        fetchApi<any>('/auth/me'),
      ]);
      setIsAdmin(meUser.role === 'ADMIN' || meUser.isSuperAdmin);
      setMembers(memData || []);
      setSubTeams(stData || []);
      setPageError('');
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Could not load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
          subTeamId: subTeamId || (editingMember ? null : undefined),
          roleInUnit,
        }),
      });

      setShowMemberModal(false);
      setFirstName('');
      setLastName('');
      setPhoneNumber('');
      setEmail('');
      setEditingMember(null);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTeamName.trim()) return;
    setSubmitting(true);
    try {
      await fetchApi('/members/sub-teams', {
        method: 'POST',
        body: JSON.stringify({ name: subTeamName }),
      });

      setShowSubTeamModal(false);
      setSubTeamName('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create sub-team');
    } finally {
      setSubmitting(false);
    }
  };

  // Export CSV helper
  const handleExportCSV = () => {
    if (members.length === 0) return;
    const headers = ['Member Code', 'First Name', 'Last Name', 'Phone', 'Email', 'Sub Team', 'Role', 'Status', 'Joined Date'];
    const rows = filteredMembers.map((m) => [
      `"${m.memberCode || ''}"`,
      `"${m.firstName || ''}"`,
      `"${m.lastName || ''}"`,
      `"${m.phoneNumber || ''}"`,
      `"${m.approvedMember?.email || m.user?.email || ''}"`,
      `"${m.subTeam?.name || 'Unassigned'}"`,
      `"${m.roleInUnit || 'Member'}"`,
      `"${m.status || 'ACTIVE'}"`,
      `"${m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TFHC_Members_Registry_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (m.firstName || '').toLowerCase().includes(q) ||
        (m.lastName || '').toLowerCase().includes(q) ||
        (m.memberCode || '').toLowerCase().includes(q) ||
        (m.phoneNumber || '').toLowerCase().includes(q) ||
        (m.approvedMember?.email || m.user?.email || '').toLowerCase().includes(q);

      const matchesSubTeam = selectedSubTeam ? m.subTeamId === selectedSubTeam : true;
      const matchesStatus = selectedStatus ? m.status === selectedStatus : true;

      return matchesSearch && matchesSubTeam && matchesStatus;
    });
  }, [members, search, selectedSubTeam, selectedStatus]);

  // Paginated records
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredMembers.length / pageSize) || 1;

  // Compute active velocity
  const activeMembersCount = members.filter((m) => m.status === 'ACTIVE').length;
  const activeVelocity = members.length > 0 ? `${Math.round((activeMembersCount / members.length) * 1000) / 10}%` : '100%';

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              CAMPUS &amp; CONGREGATIONAL REGISTRY
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Members Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Manage church membership, pastoral records, category groups, and ministry assignments across campus bodies.
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

            {/* Active Attendance Pill */}
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Roster</p>
                <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{activeVelocity}</p>
              </div>
            </div>
          </div>
        </div>

        {pageError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {pageError}
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by name, email, phone, or membership ID (CMD+K)..."
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

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowSubTeamModal(true)}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700 transition-all"
              >
                + Add Sub-Team
              </button>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 shadow-xs transition-all"
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
                  setSubTeamId('');
                  setRoleInUnit('Member');
                  setGender('Male');
                  setFormError('');
                  setShowMemberModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
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
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Member</option>
              <option value="NEW_MEMBER">New Member</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>

            {/* Sub-Team Filter */}
            <select
              value={selectedSubTeam}
              onChange={(e) => {
                setSelectedSubTeam(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="">All Ministries &amp; Sub-Teams</option>
              {subTeams.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st._count?.members ?? 0})
                </option>
              ))}
            </select>

            {/* Reset Filters button */}
            {(selectedStatus || selectedSubTeam || search) && (
              <button
                onClick={() => {
                  setSelectedStatus('');
                  setSelectedSubTeam('');
                  setSearch('');
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-auto"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* High-Density Members Directory Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <thead className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">MEMBER</th>
                  <th className="px-5 py-3.5">CONTACT DETAILS</th>
                  <th className="px-5 py-3.5">MINISTRY &amp; SUB-TEAM</th>
                  <th className="px-5 py-3.5">ECCLESIASTICAL STATUS</th>
                  <th className="px-5 py-3.5">ATTENDANCE (L30D)</th>
                  <th className="px-5 py-3.5">JOINED DATE</th>
                  <th className="px-5 py-3.5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {paginatedMembers.length > 0 ? (
                  paginatedMembers.map((m) => {
                    const statusColors: Record<string, string> = {
                      ACTIVE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60',
                      NEW_MEMBER: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-800/60',
                      ON_LEAVE: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60',
                      INACTIVE: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
                      SUSPENDED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200/60 dark:border-rose-800/60',
                    };

                    const joinedDate = m.createdAt
                      ? new Date(m.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Established';

                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Member Column */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
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
                              <p className="font-extrabold text-slate-900 dark:text-white truncate">
                                {m.firstName} {m.lastName}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                                  {m.memberCode}
                                </span>
                                {m.gender && (
                                  <span className="text-[10px] text-slate-400">{m.gender}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Contact Details Column */}
                        <td className="px-5 py-3.5">
                          <div className="space-y-0.5 min-w-[140px]">
                            {m.phoneNumber && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="font-mono">{m.phoneNumber}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[160px]">
                                {m.approvedMember?.email || m.user?.email || 'No email registered'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Ministry & Sub-Team Column */}
                        <td className="px-5 py-3.5">
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40">
                              <Building2 className="w-3 h-3" />
                              {m.subTeam?.name || 'General Registry'}
                            </span>
                            <p className="text-[10px] font-semibold text-slate-400 mt-1 capitalize">
                              {m.roleInUnit || 'Member'}
                            </p>
                          </div>
                        </td>

                        {/* Ecclesiastical Status Column */}
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

                        {/* Attendance Velocity Column */}
                        <td className="px-5 py-3.5">
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                              <span>92%</span>
                              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                Consistent
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">Last seen: Recent service</p>
                          </div>
                        </td>

                        {/* Joined Date Column */}
                        <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {joinedDate}
                        </td>

                        {/* Actions Column */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Button */}
                            <button
                              onClick={() => {
                                setEditingMember(m);
                                setFirstName(m.firstName);
                                setLastName(m.lastName);
                                setPhoneNumber(m.phoneNumber);
                                setEmail(m.approvedMember?.email || m.user?.email || '');
                                setGender(m.gender || 'Male');
                                setSubTeamId(m.subTeamId || '');
                                setRoleInUnit(m.roleInUnit || 'Member');
                                setStatus(m.status || 'ACTIVE');
                                setDetails(
                                  Object.fromEntries(
                                    [
                                      'middleName',
                                      'preferredName',
                                      'alternatePhoneNumber',
                                      'address',
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
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Edit Member"
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            {/* Google Access Button for Admins */}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setAccessMember(m);
                                  setAccessEmail(m.approvedMember?.email || m.user?.email || '');
                                  setAccessStatus(m.approvedMember?.status || 'ACTIVE');
                                  setAccessError('');
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Manage Google Access"
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      {loading ? (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Loading member registry...</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            No member records found matching criteria
                          </p>
                          <p className="text-xs text-slate-400">
                            Try adjusting your search query or filter selections.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Footer */}
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>
                Showing {filteredMembers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{' '}
                {Math.min(currentPage * pageSize, filteredMembers.length)} of {filteredMembers.length} members
              </span>
              <span className="hidden sm:inline">•</span>
              <label className="hidden sm:flex items-center gap-1.5">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            {/* Page buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 font-bold text-slate-900 dark:text-white">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

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
                  await loadData();
                } catch (error: any) {
                  setAccessError(error.message);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <h2 id="google-access-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Manage Google Sign-In Access
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authorized identity for {accessMember.firstName} {accessMember.lastName} ({accessMember.memberCode})
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="access-email">
                  Google Email Address
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
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
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
                  {editingMember ? 'Edit Congregant Profile' : 'Register New Member'}
                </h2>
                <button
                  onClick={() => setShowMemberModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
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
                      Google Email Address
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Sub-Team / Ministry
                    </label>
                    <select
                      value={subTeamId}
                      onChange={(e) => setSubTeamId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Unassigned</option>
                      {subTeams.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" htmlFor="roleInUnit">
                      Role in Unit
                    </label>
                    <input
                      type="text"
                      id="roleInUnit"
                      value={roleInUnit}
                      onChange={(e) => setRoleInUnit(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

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
                  {editingMember && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select
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
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowMemberModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white shadow-sm shadow-indigo-600/20"
                  >
                    {submitting ? 'Saving...' : 'Save Member Record'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Sub-Team Modal */}
        {showSubTeamModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create New Sub-Team</h2>

              <form onSubmit={handleCreateSubTeam} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sub-Team Name
                  </label>
                  <input
                    type="text"
                    required
                    value={subTeamName}
                    onChange={(e) => setSubTeamName(e.target.value)}
                    placeholder="e.g. Protocol Team B"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSubTeamModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white shadow-sm shadow-indigo-600/20"
                  >
                    {submitting ? 'Saving...' : 'Create Sub-Team'}
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
