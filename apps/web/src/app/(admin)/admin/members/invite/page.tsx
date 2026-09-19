'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  UserCheck,
  Send,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  RefreshCw,
  Info,
  ArrowLeft,
  Check,
  ShieldCheck,
  Mail,
  UserPlus,
  RotateCcw,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { Badge, Button, ConfirmDialog, EmptyState, Modal, Spinner, useToast } from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

export interface CandidateRow {
  id: string;
  email: string;
  normalizedEmail: string;
  status: string;
  lookupStatus: 'FOUND' | 'REVOKED';
  accountStatus: 'NOT_REGISTERED' | 'REGISTERED_PASSWORD' | 'REGISTERED_GOOGLE';
  isEligible: boolean;
  source: string;
  memberId: string | null;
  member: {
    id: string;
    memberCode: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    roleInUnit: string;
    status: string;
    user: {
      id: string;
      email: string;
      isActive: boolean;
      isRegistered: boolean;
    } | null;
  } | null;
  invitedAt: string | null;
  invitedById: string | null;
  inviteExpiresAt: string | null;
  inviteStatus: 'NOT_INVITED' | 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'FAILED' | 'REVOKED';
  inviteError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidatePageResponse {
  items: CandidateRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: {
    total: number;
    eligible: number;
    notInvited: number;
    pending: number;
    accepted: number;
    expired: number;
    revoked: number;
    failed: number;
  };
}

export interface BulkInviteResultItem {
  id: string;
  email?: string;
  name?: string;
  status: 'INVITED' | 'ALREADY_MEMBER' | 'ALREADY_PENDING' | 'INVALID' | 'FAILED';
  message?: string;
  emailDelivered?: boolean;
  inviteUrl?: string;
}

export interface BulkInviteResponse {
  total?: number;
  eligibleCount?: number;
  invitedCount: number;
  alreadyMemberCount: number;
  alreadyPendingCount: number;
  invalidCount: number;
  failedCount: number;
  results: BulkInviteResultItem[];
  message?: string;
}

export default function InviteMembersPage() {
  const { user, can } = useAuth();
  const { notify } = useToast();

  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [stats, setStats] = useState<CandidatePageResponse['stats']>({
    total: 0,
    eligible: 0,
    notInvited: 0,
    pending: 0,
    accepted: 0,
    expired: 0,
    revoked: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Action loading states
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Result summary modal
  const [showConfirmInviteAll, setShowConfirmInviteAll] = useState(false);
  const [resultModalData, setResultModalData] = useState<BulkInviteResponse | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<CandidatePageResponse>(
        `/members/invite-candidates?pageSize=500${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}${
          search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
        }`,
      );
      setCandidates(data.items || []);
      if (data.stats) setStats(data.stats);
      setError('');
    } catch (e: any) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have permission to view or manage member invitations.'
          : e.message || 'Could not load invite candidates.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Filtered in-memory list for instant responsiveness
  const displayedCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const name = `${c.member?.firstName ?? ''} ${c.member?.lastName ?? ''}`.toLowerCase();
      const email = c.email.toLowerCase();
      const code = (c.member?.memberCode ?? '').toLowerCase();
      const q = search.trim().toLowerCase();
      return !q || name.includes(q) || email.includes(q) || code.includes(q);
    });
  }, [candidates, search]);

  const eligibleDisplayed = useMemo(() => {
    return displayedCandidates.filter((c) => c.isEligible);
  }, [displayedCandidates]);

  const isAllEligibleSelected =
    eligibleDisplayed.length > 0 && eligibleDisplayed.every((c) => selectedIds.has(c.id));

  const toggleSelectAllEligible = () => {
    if (isAllEligibleSelected) {
      const next = new Set(selectedIds);
      eligibleDisplayed.forEach((c) => next.delete(c.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      eligibleDisplayed.forEach((c) => next.add(c.id));
      setSelectedIds(next);
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleInviteSingle = async (row: CandidateRow, resend = false) => {
    setInvitingId(row.id);
    try {
      const res = await fetchApi<BulkInviteResultItem>(`/lookups/approved-members/${row.id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ resend }),
      });

      if (res.status === 'INVITED') {
        notify(`Invitation successfully sent to ${res.email || row.email}.`, 'success');
      } else if (res.status === 'ALREADY_PENDING') {
        notify(`An invitation is already active for ${res.email || row.email}.`, 'info');
      } else if (res.status === 'ALREADY_MEMBER') {
        notify(`${res.email || row.email} is already an active platform user.`, 'info');
      } else {
        notify(res.message || 'Invitation request was not completed.', 'error');
      }

      await loadData();
    } catch (e: any) {
      notify(e.message || 'Failed to send invitation.', 'error');
    } finally {
      setInvitingId(null);
    }
  };

  const handleInviteSelected = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetchApi<BulkInviteResponse>('/members/invite', {
        method: 'POST',
        body: JSON.stringify({ approvedMemberIds: Array.from(selectedIds) }),
      });

      setResultModalData(res);
      setSelectedIds(new Set());
      await loadData();
    } catch (e: any) {
      notify(e.message || 'Failed to process bulk invitations.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleInviteAllEligible = async () => {
    setShowConfirmInviteAll(false);
    setBulkLoading(true);
    try {
      const res = await fetchApi<BulkInviteResponse>('/lookups/approved-members/invite-all-eligible', {
        method: 'POST',
      });

      setResultModalData(res);
      setSelectedIds(new Set());
      await loadData();
    } catch (e: any) {
      notify(e.message || 'Failed to process all eligible invitations.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <AdminLayoutShell activeHref="/admin/members">
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/members" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                MEMBERS DIRECTORY
              </Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">INVITE MEMBERS</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Invite Members
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Eligible church members from the official Lookup Table who have not yet created platform login credentials.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={() => loadData()} disabled={loading} className="text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {stats.eligible > 0 && (
              <Button
                variant="primary"
                onClick={() => setShowConfirmInviteAll(true)}
                disabled={bulkLoading || loading}
                className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Users className="w-3.5 h-3.5 mr-1.5" />
                Invite All Eligible ({stats.eligible})
              </Button>
            )}
          </div>
        </div>

        {/* Informational Guidance Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/90 to-blue-50/70 dark:from-indigo-950/40 dark:to-blue-950/30 border border-indigo-200/70 dark:border-indigo-800/60 flex items-start gap-3.5 text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
          <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-slate-900 dark:text-white">
              Lookup Table Verification &amp; Account Protection
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              The Member Lookup Table is the source of truth for platform registration. Only candidates already present on the approved church roster can receive login activation invitations. Arbitrary external emails cannot be invited.
            </p>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total in Lookup</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-800/60 shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Eligible to Invite</p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.eligible}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/70 dark:border-amber-800/60 shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Invite Pending</p>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.pending}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200/70 dark:border-indigo-800/60 shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Already Registered</p>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{stats.accepted}</p>
          </div>
        </div>

        {/* Filters, Search & Bulk Actions Bar */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          {/* Status Tabs */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'ALL', label: `All Candidates (${stats.total})` },
              { id: 'ELIGIBLE', label: `Eligible (${stats.eligible})` },
              { id: 'PENDING', label: `Pending Invites (${stats.pending})` },
              { id: 'ACCEPTED', label: `Already Registered (${stats.accepted})` },
              { id: 'REVOKED', label: `Revoked (${stats.revoked})` },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setStatusFilter(t.id)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === t.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search and Bulk Selection Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, member code..."
                className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </form>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              {eligibleDisplayed.length > 0 && (
                <button
                  onClick={toggleSelectAllEligible}
                  className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <div
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                      isAllEligibleSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-400 dark:border-slate-600'
                    }`}
                  >
                    {isAllEligibleSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span>{isAllEligibleSelected ? 'Deselect All Eligible' : 'Select All Eligible'}</span>
                </button>
              )}

              <Button
                variant="primary"
                onClick={handleInviteSelected}
                disabled={selectedIds.size === 0 || bulkLoading}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {bulkLoading ? 'Sending...' : `Send Invitations (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        </div>

        {/* Table / List View */}
        {loading ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState
            title="Unable to load candidates"
            description={error}
            action={
              <Button variant="secondary" onClick={loadData}>
                Retry
              </Button>
            }
          />
        ) : displayedCandidates.length === 0 ? (
          <EmptyState
            title="No candidates found"
            description={
              search
                ? `No candidates match "${search}". Try searching with a different name or email.`
                : 'No candidates match the selected status filter.'
            }
            action={
              search ? (
                <Button variant="secondary" onClick={() => setSearch('')}>
                  Clear Search
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllEligibleSelected}
                        onChange={toggleSelectAllEligible}
                        disabled={eligibleDisplayed.length === 0}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Select All Eligible"
                      />
                    </th>
                    <th className="px-4 py-3.5">Name</th>
                    <th className="px-4 py-3.5">Email Address</th>
                    <th className="px-4 py-3.5">Lookup Status</th>
                    <th className="px-4 py-3.5">Account Status</th>
                    <th className="px-4 py-3.5">Invitation</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {displayedCandidates.map((candidate) => {
                    const isSelected = selectedIds.has(candidate.id);
                    const name =
                      candidate.member?.firstName || candidate.member?.lastName
                        ? `${candidate.member.firstName} ${candidate.member.lastName}`.trim()
                        : candidate.email.split('@')[0];

                    return (
                      <tr
                        key={candidate.id}
                        className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                          isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(candidate.id)}
                            disabled={!candidate.isEligible}
                            className={`rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                              candidate.isEligible ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
                            }`}
                          />
                        </td>

                        {/* Name */}
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{name}</span>
                            {candidate.member?.memberCode && (
                              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {candidate.member.memberCode}
                              </span>
                            )}
                          </div>
                          {candidate.member?.roleInUnit && candidate.member.roleInUnit !== 'Member' && (
                            <p className="text-[11px] text-slate-400">{candidate.member.roleInUnit}</p>
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                          {candidate.email}
                        </td>

                        {/* Lookup Status */}
                        <td className="px-4 py-3.5">
                          {candidate.status === 'ACTIVE' ? (
                            <Badge tone="success" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Found (Active)
                            </Badge>
                          ) : (
                            <Badge tone="danger" className="gap-1">
                              <XCircle className="w-3 h-3" />
                              Revoked
                            </Badge>
                          )}
                        </td>

                        {/* Account Status */}
                        <td className="px-4 py-3.5">
                          {candidate.accountStatus === 'NOT_REGISTERED' ? (
                            <Badge tone="neutral">Not Registered</Badge>
                          ) : candidate.accountStatus === 'REGISTERED_PASSWORD' ? (
                            <Badge tone="success">Registered (Password)</Badge>
                          ) : (
                            <Badge tone="info">Registered (Google)</Badge>
                          )}
                        </td>

                        {/* Invitation Status */}
                        <td className="px-4 py-3.5">
                          {candidate.inviteStatus === 'ACCEPTED' ? (
                            <Badge tone="success" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Already Registered
                            </Badge>
                          ) : candidate.inviteStatus === 'PENDING' ? (
                            <Badge tone="warning" className="gap-1">
                              <Clock className="w-3 h-3" />
                              Invitation Pending
                            </Badge>
                          ) : candidate.inviteStatus === 'REVOKED' ? (
                            <Badge tone="danger">Revoked</Badge>
                          ) : candidate.inviteStatus === 'EXPIRED' ? (
                            <Badge tone="warning">Expired (Eligible)</Badge>
                          ) : candidate.inviteStatus === 'FAILED' ? (
                            <Badge tone="danger">Failed (Eligible)</Badge>
                          ) : (
                            <Badge tone="info">Eligible</Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          {candidate.inviteStatus === 'ACCEPTED' ? (
                            <span className="text-[11px] font-semibold text-slate-400">Activated</span>
                          ) : candidate.inviteStatus === 'PENDING' ? (
                            <Button
                              variant="secondary"
                              onClick={() => handleInviteSingle(candidate, true)}
                              disabled={invitingId === candidate.id}
                              className="text-[11px] py-1 px-2.5 h-auto"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              {invitingId === candidate.id ? 'Resending...' : 'Resend Invite'}
                            </Button>
                          ) : candidate.isEligible ? (
                            <Button
                              variant="primary"
                              onClick={() => handleInviteSingle(candidate, false)}
                              disabled={invitingId === candidate.id}
                              className="text-[11px] py-1 px-3 h-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              <Send className="w-3 h-3 mr-1" />
                              {invitingId === candidate.id ? 'Sending...' : 'Send Invite'}
                            </Button>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-400">Ineligible</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Confirmation Modal: Invite All Eligible */}
        <ConfirmDialog
          open={showConfirmInviteAll}
          title="Send Invitations to All Eligible Lookup Members?"
          body={`This will generate secure platform activation invitations for all ${stats.eligible} eligible members in the lookup table who have not yet registered.`}
          confirmLabel={`Yes, Invite All (${stats.eligible})`}
          tone="primary"
          onConfirm={handleInviteAllEligible}
          onCancel={() => setShowConfirmInviteAll(false)}
        />

        {/* Result Summary Breakdown Modal */}
        {resultModalData && (
          <Modal
            open={Boolean(resultModalData)}
            onClose={() => setResultModalData(null)}
            title="Invitation Dispatch Summary"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Processed</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">
                    {resultModalData.results?.length ?? resultModalData.invitedCount}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-center border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Invites Sent</p>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {resultModalData.invitedCount}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-center border border-amber-200 dark:border-amber-800">
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Already Pending</p>
                  <p className="text-lg font-black text-amber-600 dark:text-amber-400">
                    {resultModalData.alreadyPendingCount}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-center border border-indigo-200 dark:border-indigo-800">
                  <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Already Active</p>
                  <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                    {resultModalData.alreadyMemberCount}
                  </p>
                </div>
              </div>

              {resultModalData.results && resultModalData.results.length > 0 && (
                <div className="max-h-60 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  {resultModalData.results.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 text-xs border border-slate-100 dark:border-slate-700"
                    >
                      <div className="truncate mr-2">
                        <span className="font-bold text-slate-800 dark:text-white">{r.name || r.email}</span>
                        {r.email && r.name && <span className="text-slate-400 ml-1.5 font-mono text-[11px]">({r.email})</span>}
                      </div>
                      <Badge
                        tone={
                          r.status === 'INVITED'
                            ? 'success'
                            : r.status === 'ALREADY_PENDING'
                            ? 'warning'
                            : r.status === 'ALREADY_MEMBER'
                            ? 'info'
                            : 'danger'
                        }
                      >
                        {r.status === 'INVITED'
                          ? 'Sent'
                          : r.status === 'ALREADY_PENDING'
                          ? 'Already Pending'
                          : r.status === 'ALREADY_MEMBER'
                          ? 'Already Member'
                          : 'Failed'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={() => setResultModalData(null)}>
                  Done
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminLayoutShell>
  );
}
