'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
} from 'lucide-react';
import { Badge, Button, ConfirmDialog, EmptyState, Modal, Spinner, useToast } from '../ui';
import { fetchApi, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export interface ApprovedMemberRow {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: string | null;
  subTeam: string | null;
  status: string;
  invitedAt: string | null;
  invitedById: string | null;
  inviteExpiresAt: string | null;
  inviteStatus: 'NOT_INVITED' | 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'FAILED';
  inviteError: string | null;
  isMember: boolean;
  memberId: string | null;
  createdAt: string;
}

interface ApprovedMemberPage {
  items: (Omit<ApprovedMemberRow, 'firstName' | 'lastName' | 'memberCode' | 'gender' | 'subTeam' | 'isMember'> & {
    member: { firstName: string; lastName: string; memberCode: string; user: { isRegistered: boolean } | null } | null;
  })[];
  totalPages: number;
}

export interface BulkInviteResultItem {
  id: string;
  email: string;
  name: string;
  status: 'INVITED' | 'ALREADY_MEMBER' | 'ALREADY_PENDING' | 'INVALID_RECORD' | 'FAILED';
  message: string;
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
}

export function ApprovedMemberLookupTable() {
  const { user } = useAuth();
  const { notify } = useToast();
  const isSuperOwner = user?.email?.toLowerCase() === 'engreseglory@gmail.com';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || isSuperOwner;

  const [rows, setRows] = useState<ApprovedMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selection state for Option B
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Loading states for actions
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Dialogs and Modals
  const [showConfirmInviteAll, setShowConfirmInviteAll] = useState(false);
  const [resultModalData, setResultModalData] = useState<BulkInviteResponse | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const items: ApprovedMemberPage['items'] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const data = await fetchApi<ApprovedMemberPage>(`/lookups/approved-members?page=${page}&pageSize=500`);
        items.push(...data.items);
        totalPages = data.totalPages;
        page++;
      } while (page <= totalPages);
      setRows(items.map(item => ({ ...item, firstName: item.member?.firstName ?? '',
        lastName: item.member?.lastName ?? '', memberCode: item.member?.memberCode ?? '',
        gender: null, subTeam: null, isMember: item.member?.user?.isRegistered ?? false })));
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have permission to access the member lookup table.'
          : 'Could not load approved members lookup table.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const name = `${r.firstName} ${r.lastName}`.toLowerCase();
      const email = r.email.toLowerCase();
      const code = r.memberCode.toLowerCase();
      const query = search.trim().toLowerCase();

      const matchesSearch = !query || name.includes(query) || email.includes(query) || code.includes(query);
      const matchesStatus = statusFilter === 'ALL' || r.inviteStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  // Handle select all checkbox
  const isAllSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      filteredRows.forEach((r) => next.add(r.id));
      setSelectedIds(next);
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Option A — Invite single user
  const handleInviteSingle = async (row: ApprovedMemberRow) => {
    setInvitingId(row.id);
    try {
      const res = await fetchApi<{ ok: boolean; message: string }>(
        `/lookups/approved-members/${row.id}/invite`,
        { method: 'POST' },
      );
      notify(res.message || `Invitation sent to ${row.email}`, 'success');
      await loadData();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to send invitation', 'error');
    } finally {
      setInvitingId(null);
    }
  };

  // Option B — Invite selected users
  const handleInviteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBulkLoading(true);
    try {
      const res = await fetchApi<BulkInviteResponse>(
        '/lookups/approved-members/invite-selected',
        {
          method: 'POST',
          body: JSON.stringify({ ids }),
        },
      );
      setSelectedIds(new Set());
      setResultModalData(res);
      await loadData();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to process selected invitations', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  // Option C — Invite all eligible users
  const handleInviteAllEligible = async () => {
    setShowConfirmInviteAll(false);
    setBulkLoading(true);
    try {
      const res = await fetchApi<BulkInviteResponse>(
        '/lookups/approved-members/invite-all-eligible',
        { method: 'POST' },
      );
      setResultModalData(res);
      await loadData();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to process eligible invitations', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  // Helper to render Invite Status badge
  const renderInviteBadge = (status: ApprovedMemberRow['inviteStatus'], row: ApprovedMemberRow) => {
    switch (status) {
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Accepted
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300" title={`Invited: ${row.invitedAt ? new Date(row.invitedAt).toLocaleString() : ''}`}>
            <Clock className="w-3.5 h-3.5" />
            Invitation Pending
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300">
            <AlertCircle className="w-3.5 h-3.5" />
            Expired
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300" title={row.inviteError || 'Delivery failed'}>
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            Not Invited
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or member code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Invite Statuses</option>
            <option value="NOT_INVITED">Not Invited</option>
            <option value="PENDING">Invitation Pending</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="EXPIRED">Expired</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        {/* Global / Selection Actions */}
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {selectedIds.size > 0 && (
              <button
                onClick={handleInviteSelected}
                disabled={bulkLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Invite Selected ({selectedIds.size})
              </button>
            )}

            <button
              onClick={() => setShowConfirmInviteAll(true)}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white shadow-sm transition-all disabled:opacity-50"
            >
              <Users className="w-3.5 h-3.5" />
              Invite All Eligible Users
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      {loading || bulkLoading ? (
        <div className="flex justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <Spinner />
        </div>
      ) : error ? (
        <EmptyState
          title="Unavailable"
          description={error}
          action={<Button variant="secondary" onClick={loadData}>Retry</Button>}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title="No eligible records found"
          description="Try broadening your search query or invite status filter."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <tr>
                  {isAdmin && (
                    <th className="px-4 py-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3.5">Name &amp; Code</th>
                  <th className="px-4 py-3.5">Email</th>
                  <th className="px-4 py-3.5">Sub-team / Details</th>
                  <th className="px-4 py-3.5">Invitation Status</th>
                  <th className="px-4 py-3.5">Platform Account</th>
                  {isAdmin && <th className="px-4 py-3.5 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRows.map((row) => {
                  const isSelected = selectedIds.has(row.id);
                  const isPending = row.inviteStatus === 'PENDING';
                  const isAccepted = row.inviteStatus === 'ACCEPTED';
                  const isInvitingThis = invitingId === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                        isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      {isAdmin && (
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(row.id)}
                            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                      )}

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {row.firstName} {row.lastName}
                        </div>
                        <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                          {row.memberCode}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                        {row.email}
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                        <div>{row.subTeam || '—'}</div>
                        <div className="text-[11px] text-slate-400">{row.gender || ''}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {renderInviteBadge(row.inviteStatus, row)}
                      </td>

                      <td className="px-4 py-3.5">
                        {row.isMember ? (
                          <Badge tone="success">Registered Member</Badge>
                        ) : (
                          <Badge tone="neutral">Lookup Record Only</Badge>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="px-4 py-3.5 text-right">
                          {isAccepted ? (
                            <span className="text-[11px] font-bold text-slate-400">Active</span>
                          ) : (
                            <button
                              onClick={() => handleInviteSingle(row)}
                              disabled={isInvitingThis || bulkLoading}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 transition-colors disabled:opacity-50"
                            >
                              {isInvitingThis ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              {isPending ? 'Resend Invite' : 'Invite to Become Member'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Option C Confirmation Dialog */}
      <ConfirmDialog
        open={showConfirmInviteAll}
        title="Invite All Eligible Users?"
        body="This will create and deliver member invitation links to everyone currently in the lookup table who is NOT already a member and does NOT have an active pending invitation."
        confirmLabel="Invite Everyone"
        onCancel={() => setShowConfirmInviteAll(false)}
        onConfirm={handleInviteAllEligible}
      />

      {/* Bulk Result Summary Modal */}
      {resultModalData && (
        <Modal
          open
          onClose={() => setResultModalData(null)}
          title="Invitation Processing Results"
          footer={
            <Button onClick={() => setResultModalData(null)}>Done</Button>
          }
        >
          <div className="space-y-4">
            {/* Stat Cards */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-lg font-black text-slate-900 dark:text-white">{resultModalData.total ?? resultModalData.eligibleCount ?? 0}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Processed</div>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{resultModalData.invitedCount}</div>
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Invited</div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="text-lg font-black text-blue-600 dark:text-blue-400">{resultModalData.alreadyMemberCount}</div>
                <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Member</div>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800">
                <div className="text-lg font-black text-amber-600 dark:text-amber-400">{resultModalData.alreadyPendingCount}</div>
                <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Pending</div>
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-lg font-black text-slate-600 dark:text-slate-400">{resultModalData.invalidCount}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">Invalid</div>
              </div>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800">
                <div className="text-lg font-black text-rose-600 dark:text-rose-400">{resultModalData.failedCount}</div>
                <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Failed</div>
              </div>
            </div>

            {/* Itemized Results List */}
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {resultModalData.results.map((res) => (
                <div key={res.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{res.name}</div>
                    <div className="text-[11px] text-slate-500">{res.email}</div>
                  </div>
                  <div className="text-right">
                    {res.status === 'INVITED' && <Badge tone="success">Invited</Badge>}
                    {res.status === 'ALREADY_MEMBER' && <Badge tone="info">Already Member</Badge>}
                    {res.status === 'ALREADY_PENDING' && <Badge tone="warning">Pending</Badge>}
                    {res.status === 'INVALID_RECORD' && <Badge tone="neutral">Invalid Record</Badge>}
                    {res.status === 'FAILED' && <Badge tone="danger">Failed</Badge>}
                    <div className="text-[10px] text-slate-400 mt-0.5">{res.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
