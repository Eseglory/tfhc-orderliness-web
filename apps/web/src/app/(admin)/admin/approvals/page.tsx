'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  DollarSign,
  FileText,
  RefreshCw,
  Search,
  Filter,
  Layers,
  ChevronRight,
  Shield,
  Send,
  MessageSquare,
  ArrowUpRight,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { ApprovalTimeline, ApprovalStepView } from '../../../../components/ApprovalTimeline';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, useToast } from '../../../../components/ui';

interface ApprovalRequest {
  id: string;
  requestType: string;
  summary: string;
  amount: number | null;
  status: string;
  currentStepOrder: number;
  createdAt: string;
  decidedAt: string | null;
  requester: { name: string; memberCode: string } | null;
  workflow: { key: string; name: string };
  steps: ApprovalStepView[];
}

const TYPE_LABEL: Record<string, string> = {
  ABSENCE: 'Absence Leave',
  WELFARE_FUND: 'Welfare / Benevolence',
  EXPENSE: 'Ministry Expense',
  DUES_ADJUSTMENT: 'Dues Adjustment',
  GENERIC: 'General Request',
};

export default function ApprovalsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();

  const [tab, setTab] = useState<'queue' | 'history' | 'workflows'>('queue');
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<{ req: ApprovalRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, h] = await Promise.all([
        can('approvals.act') ? fetchApi<ApprovalRequest[]>('/approvals/pending') : Promise.resolve([]),
        can('approvals.read') ? fetchApi<ApprovalRequest[]>('/approvals/history') : Promise.resolve([]),
      ]);
      setQueue(q);
      setHistory(h);
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have access to approvals.'
          : 'Could not load approvals.',
      );
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const submitDecision = async () => {
    if (!acting) return;
    setBusy(true);
    try {
      await fetchApi(`/approvals/${acting.req.id}/act`, {
        method: 'POST',
        body: JSON.stringify({ decision: acting.decision, comment: comment || undefined }),
      });
      notify(acting.decision === 'APPROVED' ? 'Request Approved' : 'Request Rejected', 'success');
      setActing(null);
      setComment('');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    const raw = tab === 'queue' ? queue : history;
    if (!search.trim()) return raw;
    const q = search.toLowerCase();
    return raw.filter(
      (r) =>
        r.summary.toLowerCase().includes(q) ||
        r.requester?.name.toLowerCase().includes(q) ||
        r.workflow.name.toLowerCase().includes(q),
    );
  }, [tab, queue, history, search]);

  const stats = useMemo(() => {
    const pendingCount = queue.length;
    const resolvedCount = history.length;
    const approvedAmount = history
      .filter((h) => h.status === 'APPROVED' && h.amount)
      .reduce((acc, h) => acc + (h.amount || 0), 0);
    return { pendingCount, resolvedCount, approvedAmount };
  }, [queue, history]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TRACKING &amp; GOVERNANCE</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">APPROVALS CENTER</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Governance &amp; Approvals Center
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit and authorize benevolence payouts, absence requests, ministry expenses, and budget adjustments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Refresh Queue
            </button>
          </div>
        </div>

        {/* 3 Metric KPI Cards */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-3 gap-4 pb-1 sm:pb-0">
          <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                PENDING DECISIONS
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.pendingCount}</span>
              <span className="text-xs font-bold text-slate-400">Pending</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span className="font-bold text-amber-600">Action Required</span> by assigned overseers
            </div>
          </div>

          <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                RESOLVED HISTORY
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.resolvedCount}</span>
              <span className="text-xs font-bold text-slate-400">Archived</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Fully audited and logged</span>
            </div>
          </div>

          <div className="min-w-[240px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                APPROVED DISBURSEMENTS
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                ${stats.approvedAmount.toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Authorized benevolence &amp; expense</span>
            </div>
          </div>
        </div>

        {/* Tab Strip & Search */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setTab('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === 'queue' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                Pending Queue ({queue.length})
              </button>
              <button
                onClick={() => setTab('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === 'history' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                Decision History ({history.length})
              </button>
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter approvals by requester, workflow, or keyword..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Approvals List */}
        <div className="space-y-4">
          {rows.length > 0 ? (
            rows.map((req) => (
              <div
                key={req.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {TYPE_LABEL[req.requestType] || req.requestType}
                    </span>
                    <span className="text-xs font-bold text-slate-400">• {req.workflow.name}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Submitted:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {new Date(req.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <h4 className="text-base font-black text-slate-900 dark:text-white">{req.summary}</h4>
                    {req.requester && (
                      <p className="text-xs text-slate-500">
                        Requester: <strong className="text-slate-800 dark:text-slate-200">{req.requester.name}</strong> ({req.requester.memberCode})
                      </p>
                    )}
                    {req.amount !== null && (
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        Requested Amount: ${req.amount.toLocaleString()}
                      </p>
                    )}
                  </div>

                  {tab === 'queue' && can('approvals.act') && (
                    <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                      <button
                        onClick={() => setActing({ req, decision: 'REJECTED' })}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => setActing({ req, decision: 'APPROVED' })}
                        className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                      >
                        Approve
                      </button>
                    </div>
                  )}

                  {tab === 'history' && (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black ${
                        req.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {req.status}
                    </span>
                  )}
                </div>

                {/* Timeline Step Progression */}
                {req.steps && req.steps.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <ApprovalTimeline steps={req.steps} />
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No approval requests found in this view.
            </div>
          )}
        </div>

        {/* Action Modal */}
        {acting && (
          <Modal
            open={Boolean(acting)}
            onClose={() => setActing(null)}
            title={acting.decision === 'APPROVED' ? 'Confirm Approval' : 'Confirm Rejection'}
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                You are about to <strong className={acting.decision === 'APPROVED' ? 'text-emerald-600' : 'text-rose-600'}>{acting.decision.toLowerCase()}</strong> the request &quot;{acting.req.summary}&quot;.
              </p>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Optional Comment or Stipulation:
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add guidance or reasons..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setActing(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={submitDecision}
                  disabled={busy}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-sm ${
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
