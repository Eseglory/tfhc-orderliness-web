'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  RefreshCw,
  Search,
  Calendar,
  Building2,
  Check,
  X,
  MessageSquare,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  CheckSquare,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, useToast } from '../../../../components/ui';

export default function AbsenceRequestsPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [kind, setKind] = useState<'absence' | 'correction'>('absence');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Review state
  const [acting, setActing] = useState<{ item: any; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);

  const endpoint = kind === 'absence' ? '/excuses' : '/excuses/corrections';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<any[]>(`${endpoint}/pending`);
      setRequests(data || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load requests.');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async () => {
    if (!acting) return;
    if (acting.decision === 'REJECTED' && !reviewNote.trim()) {
      notify('A reason or feedback note is required when rejecting a request.', 'error');
      return;
    }

    setBusy(true);
    try {
      await fetchApi(`${endpoint}/${acting.item.id}/review`, {
        method: 'PUT',
        body: JSON.stringify({
          status: acting.decision,
          reviewNote: reviewNote.trim() || undefined,
        }),
      });

      notify(`${kind === 'absence' ? 'Absence Excuse' : 'Attendance Correction'} ${acting.decision.toLowerCase()}`, 'success');
      setActing(null);
      setReviewNote('');
      await load();
    } catch (err: any) {
      notify(err.message || 'Could not save decision.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (kind === 'absence' && categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.member?.firstName?.toLowerCase().includes(q) ||
        r.member?.lastName?.toLowerCase().includes(q) ||
        r.member?.memberCode?.toLowerCase().includes(q) ||
        r.meeting?.title?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
      );
    });
  }, [requests, kind, categoryFilter, search]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TRACKING &amp; GOVERNANCE</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">ABSENCE &amp; EXCUSES</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Absence &amp; Correction Requests
              </h1>
              {requests.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                  {requests.length} Pending
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review member-submitted absence excuses, sickness leaves, and retroactive attendance mark adjustments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/approvals"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition-all"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Approvals Center</span>
            </Link>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                PENDING QUEUE
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{requests.length}</span>
              <span className="text-xs font-bold text-amber-600">
                {kind === 'absence' ? 'Absence Excuses' : 'Attendance Corrections'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Requiring administrative review</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                AUDIT IMPACT
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-black text-slate-900 dark:text-white capitalize">
                {kind === 'absence' ? 'Exempts Penalty' : 'Updates Points'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Automatic point &amp; consistency score recalculation</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                GOVERNANCE SLA
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-black text-emerald-600">48h Target SLA</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Instant member notification upon review</span>
            </div>
          </div>
        </div>

        {/* Type Switcher Bar & Filters */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setKind('absence')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                kind === 'absence'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Absence Requests
            </button>
            <button
              onClick={() => setKind('correction')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                kind === 'correction'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Attendance Corrections
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            {kind === 'absence' && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="SICKNESS">Medical / Sickness</option>
                <option value="WORK">Work Conflict</option>
                <option value="TRAVEL">Travel / Relocation</option>
                <option value="FAMILY">Family Emergency</option>
                <option value="ACADEMIC">Academic / Exams</option>
                <option value="PERSONAL">Personal / Bereavement</option>
                <option value="OTHER">Other</option>
              </select>
            )}

            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, reason, or service..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Requests Feed */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading pending requests...</div>
          ) : filteredRequests.length > 0 ? (
            filteredRequests.map((request) => (
              <div
                key={request.id}
                data-testid="absence-request-card"
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs">
                      {request.member?.firstName?.[0] || 'M'}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">
                        {request.member?.firstName} {request.member?.lastName}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {request.member?.memberCode && `ID: ${request.member.memberCode} • `}
                        {request.meeting?.title || (request.startDate ? `Leave: ${new Date(request.startDate).toLocaleDateString()} to ${new Date(request.endDate).toLocaleDateString()}` : 'General Leave Period')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {request.meeting?.startTime
                        ? new Date(request.meeting.startTime).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : request.startDate
                        ? `${new Date(request.startDate).toLocaleDateString()} – ${new Date(request.endDate).toLocaleDateString()}`
                        : 'Scheduled Service'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                      Member Reason / Justification
                    </span>
                    {request.category && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {request.category}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                    &quot;{request.reason}&quot;
                  </p>
                  {request.requestedStatus && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      Requested Status: {request.requestedStatus}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Link
                    href={`/admin/members/${request.member?.id || ''}`}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                  >
                    View Member Profile
                  </Link>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActing({ item: request, decision: 'REJECTED' });
                        setReviewNote('');
                      }}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 transition-colors"
                    >
                      Reject {kind === 'absence' ? 'Excuse' : 'Correction'}
                    </button>
                    <button
                      onClick={() => {
                        setActing({ item: request, decision: 'APPROVED' });
                        setReviewNote('');
                      }}
                      className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                    >
                      Approve Request
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No pending requests in this queue.
            </div>
          )}
        </div>

        {/* Review Action Modal */}
        {acting && (
          <Modal
            open={Boolean(acting)}
            onClose={() => setActing(null)}
            title={acting.decision === 'APPROVED' ? `Approve ${kind === 'absence' ? 'Absence Excuse' : 'Correction'}` : `Reject ${kind === 'absence' ? 'Absence Excuse' : 'Correction'}`}
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                You are about to <strong className={acting.decision === 'APPROVED' ? 'text-emerald-600' : 'text-rose-600'}>{acting.decision.toLowerCase()}</strong> the request for{' '}
                <strong>{acting.item.member?.firstName} {acting.item.member?.lastName}</strong> ({acting.item.meeting?.title}).
              </p>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="font-medium text-slate-700 dark:text-slate-300">&quot;{acting.item.reason}&quot;</p>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {acting.decision === 'REJECTED' ? 'Feedback Reason (Required):' : 'Reviewer Note (Sent to member):'}
                </label>
                <textarea
                  rows={3}
                  required={acting.decision === 'REJECTED'}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={acting.decision === 'REJECTED' ? 'Reason for declining request...' : 'Optional feedback or blessings...'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActing(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReview}
                  disabled={busy || (acting.decision === 'REJECTED' && !reviewNote.trim())}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-sm disabled:opacity-50 ${
                    acting.decision === 'APPROVED' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {busy ? 'Submitting...' : `Confirm ${acting.decision}`}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminLayoutShell>
  );
}
