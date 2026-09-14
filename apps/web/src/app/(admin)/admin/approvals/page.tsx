'use client';

import React, { useCallback, useEffect, useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Check,
  X,
  Calendar,
  Sparkles,
  Sliders,
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

interface ApprovalWorkflow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  requestType: string;
  active: boolean;
  createdAt: string;
  steps: {
    id: string;
    order: number;
    name: string;
    approverMode: string;
    roleKey: string | null;
    approverUserId: string | null;
    permission: string | null;
  }[];
}

interface AbsenceExcuse {
  id: string;
  reason: string;
  category: string;
  status: string;
  startDate?: string;
  endDate?: string;
  requestType?: string;
  createdAt: string;
  member: { id: string; firstName: string; lastName: string; memberCode: string; subTeam?: { name: string } };
  meeting?: { id: string; title: string; startTime: string };
  reviewNote?: string;
}

interface CorrectionRequest {
  id: string;
  reason: string;
  requestedStatus: string;
  status: string;
  createdAt: string;
  member: { id: string; firstName: string; lastName: string; memberCode: string; subTeam?: { name: string } };
  meeting: { id: string; title: string; startTime: string };
}

const TYPE_LABEL: Record<string, string> = {
  ABSENCE: 'Absence Leave',
  WELFARE_FUND: 'Member Welfare / Assistance',
  EXPENSE: 'Operational Expense',
  DUES_ADJUSTMENT: 'Dues Adjustment',
  GENERIC: 'General Request',
};

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();

  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<'queue' | 'excuses' | 'corrections' | 'workflows' | 'history'>(
    tabParam === 'excuses' || tabParam === 'corrections' || tabParam === 'workflows' || tabParam === 'history'
      ? tabParam
      : 'queue'
  );

  useEffect(() => {
    if (tabParam && ['queue', 'excuses', 'corrections', 'workflows', 'history'].includes(tabParam)) {
      setTab(tabParam as any);
    }
  }, [tabParam]);

  const handleTabChange = (newTab: 'queue' | 'excuses' | 'corrections' | 'workflows' | 'history') => {
    setTab(newTab);
    router.replace(`/admin/approvals?tab=${newTab}`, { scroll: false });
  };

  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [excuses, setExcuses] = useState<AbsenceExcuse[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Action states
  const [acting, setActing] = useState<{ req: ApprovalRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Reviewing Excuses & Corrections
  const [reviewingExcuse, setReviewingExcuse] = useState<{ item: AbsenceExcuse; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewingCorrection, setReviewingCorrection] = useState<{ item: CorrectionRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // Workflow creation state
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowType, setNewWorkflowType] = useState('WELFARE_FUND');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');
  const [workflowSteps, setWorkflowSteps] = useState<Array<{ name: string; approverMode: string; roleKey: string }>>([
    { name: 'Unit Leader Review', approverMode: 'ROLE', roleKey: 'LEADER' },
    { name: 'Executive Leadership Approval', approverMode: 'ROLE', roleKey: 'SUPER_ADMIN' },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, h, wf, exc, corr] = await Promise.all([
        can('approvals.act') || can('approvals.read') ? fetchApi<ApprovalRequest[]>('/approvals/pending').catch(() => []) : Promise.resolve([]),
        can('approvals.read') ? fetchApi<ApprovalRequest[]>('/approvals/history').catch(() => []) : Promise.resolve([]),
        can('approvals.read') || can('approvals.configure') ? fetchApi<ApprovalWorkflow[]>('/approval-workflows').catch(() => []) : Promise.resolve([]),
        can('excuses.review') ? fetchApi<AbsenceExcuse[]>('/excuses/pending').catch(() => []) : Promise.resolve([]),
        can('corrections.review') || can('excuses.review') ? fetchApi<CorrectionRequest[]>('/excuses/corrections/pending').catch(() => []) : Promise.resolve([]),
      ]);
      setQueue(q || []);
      setHistory(h || []);
      setWorkflows(wf || []);
      setExcuses(exc || []);
      setCorrections(corr || []);
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have access to approvals.'
          : 'Could not load approvals queue.',
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
    if (acting.decision === 'REJECTED' && !comment.trim()) {
      notify('A clear reason is required when rejecting a request.', 'error');
      return;
    }
    setBusy(true);
    try {
      await fetchApi(`/approvals/${acting.req.id}/act`, {
        method: 'POST',
        body: JSON.stringify({ decision: acting.decision, comment: comment.trim() || undefined }),
      });
      notify(acting.decision === 'APPROVED' ? 'Request Approved Successfully' : 'Request Rejected', 'success');
      setActing(null);
      setComment('');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReviewExcuse = async () => {
    if (!reviewingExcuse) return;
    if (reviewingExcuse.decision === 'REJECTED' && !reviewNote.trim()) {
      notify('A reason or feedback note is required when rejecting an excuse.', 'error');
      return;
    }
    setBusy(true);
    try {
      await fetchApi(`/excuses/${reviewingExcuse.item.id}/review`, {
        method: 'PUT',
        body: JSON.stringify({ status: reviewingExcuse.decision, reviewNote: reviewNote.trim() || undefined }),
      });
      notify(`Absence Excuse ${reviewingExcuse.decision.toLowerCase()}`, 'success');
      setReviewingExcuse(null);
      setReviewNote('');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Excuse review failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReviewCorrection = async () => {
    if (!reviewingCorrection) return;
    setBusy(true);
    try {
      await fetchApi(`/excuses/corrections/${reviewingCorrection.item.id}/review`, {
        method: 'PUT',
        body: JSON.stringify({ status: reviewingCorrection.decision }),
      });
      notify(`Correction Request ${reviewingCorrection.decision.toLowerCase()}`, 'success');
      setReviewingCorrection(null);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Correction review failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWorkflow = async (wf: ApprovalWorkflow) => {
    try {
      await fetchApi(`/approval-workflows/${wf.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !wf.active }),
      });
      notify(`Workflow "${wf.name}" is now ${!wf.active ? 'active' : 'inactive'}`, 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to update workflow.', 'error');
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this approval workflow?')) return;
    try {
      await fetchApi(`/approval-workflows/${id}`, { method: 'DELETE' });
      notify('Workflow deleted', 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to delete workflow.', 'error');
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkflowName.trim()) {
      notify('Workflow name is required', 'error');
      return;
    }
    if (workflowSteps.length === 0) {
      notify('At least one approval step is required', 'error');
      return;
    }

    setBusy(true);
    try {
      await fetchApi('/approval-workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: newWorkflowName.trim(),
          requestType: newWorkflowType,
          description: newWorkflowDesc.trim() || undefined,
          steps: workflowSteps.map((s, idx) => ({
            order: idx + 1,
            name: s.name,
            approverMode: s.approverMode,
            roleKey: s.roleKey,
          })),
        }),
      });

      notify('New approval workflow created successfully', 'success');
      setCreatingWorkflow(false);
      setNewWorkflowName('');
      setNewWorkflowDesc('');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to create workflow.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    const raw = tab === 'queue' ? queue : history;
    return raw.filter((r) => {
      if (selectedType !== 'ALL' && r.requestType !== selectedType) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.summary.toLowerCase().includes(q) ||
        r.requester?.name.toLowerCase().includes(q) ||
        r.workflow.name.toLowerCase().includes(q)
      );
    });
  }, [tab, queue, history, selectedType, search]);

  const stats = useMemo(() => {
    const pendingGovernanceCount = queue.length;
    const pendingExcusesCount = excuses.length;
    const pendingCorrectionsCount = corrections.length;
    const totalPendingCount = pendingGovernanceCount + pendingExcusesCount + pendingCorrectionsCount;
    const resolvedCount = history.length;
    const approvedAmount = history
      .filter((h) => h.status === 'APPROVED' && h.amount)
      .reduce((acc, h) => acc + (h.amount || 0), 0);
    return {
      pendingGovernanceCount,
      pendingExcusesCount,
      pendingCorrectionsCount,
      totalPendingCount,
      resolvedCount,
      approvedAmount,
    };
  }, [queue, excuses, corrections, history]);

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
              {stats.totalPendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 animate-pulse">
                  {stats.totalPendingCount} Pending Action
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit and authorize benevolence payouts, absence requests, attendance corrections, and configure multi-step approval workflows.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {can('approvals.configure') && (
              <button
                onClick={() => setCreatingWorkflow(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Workflow</span>
              </button>
            )}
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                GOVERNANCE QUEUE
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.pendingGovernanceCount}</span>
              <span className="text-xs font-bold text-amber-600">Awaiting Decision</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Welfare, expenses, adjustments</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ABSENCE &amp; EXCUSES
              </span>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.pendingExcusesCount}</span>
              <span className="text-xs font-bold text-purple-600">Excuses Pending</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Member absence requests</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                AUDIT CORRECTIONS
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.pendingCorrectionsCount}</span>
              <span className="text-xs font-bold text-slate-400">Corrections</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Disputed attendance marks</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                APPROVED DISBURSEMENTS
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">
                ${stats.approvedAmount.toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>{stats.resolvedCount} archived decisions</span>
            </div>
          </div>
        </div>

        {/* Tab Strip & Search Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
              <button
                onClick={() => handleTabChange('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  tab === 'queue' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Governance Queue ({queue.length})
              </button>
              <button
                onClick={() => handleTabChange('excuses')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  tab === 'excuses' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Absence Excuses ({excuses.length})
              </button>
              <button
                onClick={() => handleTabChange('corrections')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  tab === 'corrections' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Corrections ({corrections.length})
              </button>
              <button
                onClick={() => handleTabChange('workflows')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  tab === 'workflows' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Workflows ({workflows.length})
              </button>
              <button
                onClick={() => handleTabChange('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  tab === 'history' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                History ({history.length})
              </button>
            </div>

            {(tab === 'queue' || tab === 'history') && (
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value="ALL">All Request Types</option>
                  <option value="WELFARE_FUND">Member Welfare / Assistance</option>
                  <option value="EXPENSE">Operational Expense</option>
                  <option value="ABSENCE">Absence Leave</option>
                  <option value="DUES_ADJUSTMENT">Dues Adjustment</option>
                  <option value="GENERIC">General Request</option>
                </select>

                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search approvals..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tab 1: Governance Queue */}
        {tab === 'queue' && (
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

                    {can('approvals.act') && (
                      <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                        <button
                          onClick={() => {
                            setActing({ req, decision: 'REJECTED' });
                            setComment('');
                          }}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => {
                            setActing({ req, decision: 'APPROVED' });
                            setComment('');
                          }}
                          className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                        >
                          Approve
                        </button>
                      </div>
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
                No pending governance approval requests in this queue.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Absence Excuses Queue */}
        {tab === 'excuses' && (
          <div className="space-y-4">
            {excuses.length > 0 ? (
              excuses.map((excuse) => (
                <div
                  key={excuse.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-xs">
                        {excuse.member?.firstName?.[0] || 'M'}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white">
                          {excuse.member?.firstName} {excuse.member?.lastName}
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {excuse.member?.memberCode && `ID: ${excuse.member.memberCode} • `}
                          {excuse.meeting?.title || (excuse.startDate ? `Leave: ${new Date(excuse.startDate).toLocaleDateString()} to ${new Date(excuse.endDate!).toLocaleDateString()}` : 'General Leave Period')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {excuse.meeting?.startTime
                          ? new Date(excuse.meeting.startTime).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : excuse.startDate
                          ? `${new Date(excuse.startDate).toLocaleDateString()} – ${new Date(excuse.endDate!).toLocaleDateString()}`
                          : 'Scheduled Service'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase text-slate-400">
                        Absence Justification
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {excuse.category}
                      </span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                      &quot;{excuse.reason}&quot;
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <Link
                      href={`/admin/members/${excuse.member?.id || ''}`}
                      className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                      View Member Profile
                    </Link>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setReviewingExcuse({ item: excuse, decision: 'REJECTED' });
                          setReviewNote('');
                        }}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 transition-colors"
                      >
                        Reject Excuse
                      </button>
                      <button
                        onClick={() => {
                          setReviewingExcuse({ item: excuse, decision: 'APPROVED' });
                          setReviewNote('');
                        }}
                        className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                      >
                        Approve Excuse
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
                No pending absence excuses. All member leaves are up to date.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Attendance Corrections Queue */}
        {tab === 'corrections' && (
          <div className="space-y-4">
            {corrections.length > 0 ? (
              corrections.map((corr) => (
                <div
                  key={corr.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs">
                        {corr.member?.firstName?.[0] || 'M'}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white">
                          {corr.member?.firstName} {corr.member?.lastName}
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {corr.member?.memberCode && `ID: ${corr.member.memberCode} • `}
                          {corr.meeting?.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        Requested: {corr.requestedStatus}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                      Dispute Explanation
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 font-medium">
                      &quot;{corr.reason}&quot;
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setReviewingCorrection({ item: corr, decision: 'REJECTED' })}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 transition-colors"
                    >
                      Reject Correction
                    </button>
                    <button
                      onClick={() => setReviewingCorrection({ item: corr, decision: 'APPROVED' })}
                      className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                    >
                      Approve Correction
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
                No pending attendance corrections in this queue.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Workflows Configuration */}
        {tab === 'workflows' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Active Multi-Step Approval Workflows</h3>
                <p className="text-xs text-slate-500">Configure multi-level chains of authority for welfare disbursements, expenses, and leave.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {TYPE_LABEL[wf.requestType] || wf.requestType}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          wf.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {wf.active ? 'Active Engine' : 'Inactive / Draft'}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-black text-slate-900 dark:text-white">{wf.name}</h4>
                      {wf.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{wf.description}</p>
                      )}
                    </div>

                    {/* Step Sequence */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        Sequential Approval Steps ({wf.steps.length})
                      </span>
                      <div className="space-y-1.5">
                        {wf.steps.map((step, idx) => (
                          <div
                            key={step.id || idx}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-950/70 text-xs border border-slate-100 dark:border-slate-800/80"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-[10px]">
                                {step.order}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{step.name}</span>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {step.approverMode}: {step.roleKey || 'Admin'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {can('approvals.configure') && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <button
                        onClick={() => handleToggleWorkflow(wf)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                      >
                        {wf.active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                        <span>{wf.active ? 'Deactivate' : 'Activate as Active Engine'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteWorkflow(wf.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                        title="Delete Workflow"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Decision History */}
        {tab === 'history' && (
          <div className="space-y-4">
            {rows.length > 0 ? (
              rows.map((req) => (
                <div
                  key={req.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {TYPE_LABEL[req.requestType] || req.requestType}
                      </span>
                      <span className="text-xs font-bold text-slate-400">• {req.workflow.name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {req.status}
                      </span>
                      <span className="text-slate-400">
                        {req.decidedAt ? new Date(req.decidedAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white">{req.summary}</h4>
                      {req.requester && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Requester: <strong className="text-slate-700 dark:text-slate-300">{req.requester.name}</strong> ({req.requester.memberCode})
                        </p>
                      )}
                    </div>
                    {req.amount !== null && (
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        ${req.amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Steps breakdown */}
                  {req.steps && req.steps.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <ApprovalTimeline steps={req.steps} />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
                No resolved decision history found.
              </div>
            )}
          </div>
        )}

        {/* Action Modal for Approving / Rejecting Governance Request */}
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
                  {acting.decision === 'REJECTED' ? 'Reason for Rejection (Required):' : 'Optional Comment or Stipulation:'}
                </label>
                <textarea
                  rows={3}
                  required={acting.decision === 'REJECTED'}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={acting.decision === 'REJECTED' ? 'Specify the policy violation or reason for denial...' : 'Add guidance or disbursement instructions...'}
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
                  onClick={submitDecision}
                  disabled={busy || (acting.decision === 'REJECTED' && !comment.trim())}
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

        {/* Modal for Reviewing Excuse */}
        {reviewingExcuse && (
          <Modal
            open={Boolean(reviewingExcuse)}
            onClose={() => setReviewingExcuse(null)}
            title={reviewingExcuse.decision === 'APPROVED' ? 'Approve Absence Excuse' : 'Reject Absence Excuse'}
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Member: <strong>{reviewingExcuse.item.member?.firstName} {reviewingExcuse.item.member?.lastName}</strong> ({reviewingExcuse.item.meeting?.title})
              </p>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="font-semibold text-slate-700 dark:text-slate-300">&quot;{reviewingExcuse.item.reason}&quot;</p>
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {reviewingExcuse.decision === 'REJECTED' ? 'Feedback Note (Required):' : 'Reviewer Note (Sent to member):'}
                </label>
                <textarea
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={reviewingExcuse.decision === 'REJECTED' ? 'Reason for declining absence...' : 'Optional feedback or blessings...'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviewingExcuse(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReviewExcuse}
                  disabled={busy || (reviewingExcuse.decision === 'REJECTED' && !reviewNote.trim())}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-sm disabled:opacity-50 ${
                    reviewingExcuse.decision === 'APPROVED' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {busy ? 'Submitting...' : `Confirm ${reviewingExcuse.decision}`}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal for Reviewing Correction */}
        {reviewingCorrection && (
          <Modal
            open={Boolean(reviewingCorrection)}
            onClose={() => setReviewingCorrection(null)}
            title={reviewingCorrection.decision === 'APPROVED' ? 'Approve Attendance Correction' : 'Reject Attendance Correction'}
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Update attendance mark for <strong>{reviewingCorrection.item.member?.firstName} {reviewingCorrection.item.member?.lastName}</strong> to{' '}
                <span className="font-extrabold text-indigo-600">{reviewingCorrection.item.requestedStatus}</span>.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="font-medium text-slate-700 dark:text-slate-300">&quot;{reviewingCorrection.item.reason}&quot;</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviewingCorrection(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReviewCorrection}
                  disabled={busy}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-sm ${
                    reviewingCorrection.decision === 'APPROVED' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {busy ? 'Submitting...' : `Confirm ${reviewingCorrection.decision}`}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal for Creating Workflow */}
        {creatingWorkflow && (
          <Modal
            open={creatingWorkflow}
            onClose={() => setCreatingWorkflow(false)}
            title="Design New Multi-Step Approval Workflow"
          >
            <form onSubmit={handleCreateWorkflow} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Workflow Name:
                </label>
                <input
                  type="text"
                  required
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="e.g. Benevolence Review &amp; Executive Authorization"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Request Type:
                  </label>
                  <select
                    value={newWorkflowType}
                    onChange={(e) => setNewWorkflowType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                  >
                    <option value="WELFARE_FUND">Member Welfare &amp; Support</option>
                    <option value="EXPENSE">Operational Expense</option>
                    <option value="ABSENCE">Absence Excuse</option>
                    <option value="DUES_ADJUSTMENT">Dues Adjustment</option>
                    <option value="GENERIC">General Request</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Description (Optional):
                  </label>
                  <input
                    type="text"
                    value={newWorkflowDesc}
                    onChange={(e) => setNewWorkflowDesc(e.target.value)}
                    placeholder="e.g. Standard 2-stage approval"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Steps builder */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold uppercase text-[10px] text-slate-400">
                    Approval Sequence Steps
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setWorkflowSteps([
                        ...workflowSteps,
                        { name: `Stage ${workflowSteps.length + 1} Review`, approverMode: 'ROLE', roleKey: 'SUPER_ADMIN' },
                      ])
                    }
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    + Add Step
                  </button>
                </div>

                {workflowSteps.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  >
                    <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      required
                      value={s.name}
                      onChange={(e) => {
                        const updated = [...workflowSteps];
                        updated[idx].name = e.target.value;
                        setWorkflowSteps(updated);
                      }}
                      placeholder="Step Name"
                      className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                    />
                    <select
                      value={s.roleKey}
                      onChange={(e) => {
                        const updated = [...workflowSteps];
                        updated[idx].roleKey = e.target.value;
                        setWorkflowSteps(updated);
                      }}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                    >
                      <option value="LEADER">Unit Leader</option>
                      <option value="ADMIN">Administrator</option>
                      <option value="SUPER_ADMIN">Executive Super Admin</option>
                    </select>
                    {workflowSteps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setWorkflowSteps(workflowSteps.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreatingWorkflow(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
                >
                  {busy ? 'Creating...' : 'Save & Publish Workflow'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AdminLayoutShell>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading Approvals Center...</div>}>
      <ApprovalsContent />
    </Suspense>
  );
}
