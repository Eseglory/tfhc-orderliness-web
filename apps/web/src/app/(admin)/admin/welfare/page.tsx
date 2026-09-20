'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HeartHandshake,
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
  Plus,
  ArrowUpRight,
  Send,
  Calendar,
  Sparkles,
  Shield,
  CreditCard,
  Building2,
  ExternalLink,
  ChevronRight,
  Receipt,
  FileCheck,
  Check,
  X,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { ApprovalTimeline, ApprovalStepView } from '../../../../components/ApprovalTimeline';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth, isDaniel, isLoveth, isEseosaGlory, canCreateWelfare, canDisburseWelfare } from '../../../../lib/auth';
import { Modal, useToast } from '../../../../components/ui';

interface WelfareRequestItem {
  id: string;
  reference: string;
  title: string;
  amount: number;
  currency: string;
  purpose: string;
  description: string | null;
  requestedFor: string | null;
  beneficiaryName: string | null;
  requiredByDate: string | null;
  supportingDocUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  stageStatus: string;
  isDisbursed: boolean;
  disbursedAt: string | null;
  disbursedByUserId: string | null;
  disbursementRef: string | null;
  disbursementNotes: string | null;
  disbursementChannel: string | null;
  createdAt: string;
  decidedAt: string | null;
  requester: string;
  memberCode: string;
  approval: {
    id: string;
    currentStepOrder: number;
    status: string;
    steps: ApprovalStepView[];
    actions?: {
      stepOrder: number;
      stepName: string;
      decision: 'APPROVED' | 'REJECTED';
      comment: string | null;
      actorName: string;
      createdAt: string;
    }[];
  } | null;
}

function WelfareAdminContent() {
  const searchParams = useSearchParams();
  const { user, can } = useAuth();
  const { notify } = useToast();

  const [requests, setRequests] = useState<WelfareRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'pending_my_action' | 'pending' | 'approved' | 'disbursed' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<WelfareRequestItem | null>(null);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [disburseModalOpen, setDisburseModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewComment, setReviewComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // New Request Form
  const [createForm, setCreateForm] = useState({
    title: '',
    purpose: '',
    amount: '',
    currency: 'NGN',
    requestedFor: '',
    beneficiaryName: '',
    requiredByDate: '',
    description: '',
    supportingDocUrl: '',
  });

  // Disbursement Form
  const [disburseForm, setDisburseForm] = useState({
    disbursementRef: '',
    disbursementChannel: 'BANK_TRANSFER',
    disbursementNotes: '',
  });

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<WelfareRequestItem[]>('/welfare-requests');
      setRequests(data);
      if (selectedRequest) {
        const refreshed = data.find((r) => r.id === selectedRequest.id);
        if (refreshed) setSelectedRequest(refreshed);
      }
    } catch (err) {
      notify({
        variant: 'destructive',
        title: 'Error loading requests',
        description: err instanceof Error ? err.message : 'Could not fetch welfare requests.',
      });
    } finally {
      setLoading(false);
    }
  }, [notify, selectedRequest]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  // Metrics
  const metrics = useMemo(() => {
    const total = requests.length;
    const pendingDaniel = requests.filter(
      (r) => r.status === 'PENDING' && r.approval?.currentStepOrder === 1
    ).length;
    const pendingSuperAdmin = requests.filter(
      (r) => r.status === 'PENDING' && r.approval?.currentStepOrder === 2
    ).length;
    const approvedPendingDisbursement = requests.filter(
      (r) => r.status === 'APPROVED' && !r.isDisbursed
    ).length;
    const disbursedRequests = requests.filter((r) => r.isDisbursed);
    const totalDisbursedAmount = disbursedRequests.reduce((sum, r) => sum + r.amount, 0);

    return {
      total,
      pendingDaniel,
      pendingSuperAdmin,
      approvedPendingDisbursement,
      totalDisbursedCount: disbursedRequests.length,
      totalDisbursedAmount,
    };
  }, [requests]);

  // Filtering
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Search
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        r.reference.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term) ||
        r.purpose.toLowerCase().includes(term) ||
        r.requester.toLowerCase().includes(term) ||
        r.memberCode.toLowerCase().includes(term) ||
        (r.beneficiaryName && r.beneficiaryName.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      // Tab filter
      if (filterTab === 'pending') return r.status === 'PENDING';
      if (filterTab === 'approved') return r.status === 'APPROVED' && !r.isDisbursed;
      if (filterTab === 'disbursed') return r.isDisbursed;
      if (filterTab === 'rejected') return r.status === 'REJECTED';
      if (filterTab === 'pending_my_action') {
        if (!user) return false;
        if (isDaniel(user) && r.status === 'PENDING' && r.approval?.currentStepOrder === 1) return true;
        if (
          isEseosaGlory(user) &&
          ((r.status === 'PENDING' && r.approval?.currentStepOrder === 2) || (r.status === 'APPROVED' && !r.isDisbursed))
        ) {
          return true;
        }
        return false;
      }
      return true;
    });
  }, [requests, filterTab, searchTerm, user]);

  // Handle Submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(createForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify({ variant: 'destructive', title: 'Invalid Amount', description: 'Enter a valid amount.' });
      return;
    }
    if (createForm.purpose.trim().length < 3) {
      notify({ variant: 'destructive', title: 'Purpose Required', description: 'Please describe the purpose of this request.' });
      return;
    }

    setActionLoading(true);
    try {
      const created = await fetchApi<WelfareRequestItem>('/welfare-requests', {
        method: 'POST',
        body: JSON.stringify({
          title: createForm.title.trim() || undefined,
          purpose: createForm.purpose.trim(),
          amount,
          currency: createForm.currency,
          requestedFor: createForm.requestedFor.trim() || undefined,
          beneficiaryName: createForm.beneficiaryName.trim() || undefined,
          requiredByDate: createForm.requiredByDate || undefined,
          description: createForm.description.trim() || undefined,
          supportingDocUrl: createForm.supportingDocUrl.trim() || undefined,
        }),
      });

      notify({
        variant: 'default',
        title: 'Welfare Request Submitted',
        description: `Request ${created.reference} has been submitted for Stage 1 (Daniel) review.`,
      });

      setCreateForm({
        title: '',
        purpose: '',
        amount: '',
        currency: 'NGN',
        requestedFor: '',
        beneficiaryName: '',
        requiredByDate: '',
        description: '',
        supportingDocUrl: '',
      });
      setCreateModalOpen(false);
      void loadRequests();
    } catch (err) {
      notify({
        variant: 'destructive',
        title: 'Submission Failed',
        description: err instanceof Error ? err.message : 'Could not submit request.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Review (Approve/Reject)
  const handleReviewAction = async () => {
    if (!selectedRequest?.approval?.id) return;
    if (reviewDecision === 'REJECTED' && !reviewComment.trim()) {
      notify({ variant: 'destructive', title: 'Reason Required', description: 'A rejection comment is required.' });
      return;
    }

    setActionLoading(true);
    try {
      await fetchApi(`/approvals/${selectedRequest.approval.id}/act`, {
        method: 'POST',
        body: JSON.stringify({
          decision: reviewDecision,
          comment: reviewComment.trim() || undefined,
        }),
      });

      notify({
        variant: 'default',
        title: `Request ${reviewDecision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
        description: `Action recorded for ${selectedRequest.reference}.`,
      });

      setReviewModalOpen(false);
      setReviewComment('');
      void loadRequests();
    } catch (err) {
      notify({
        variant: 'destructive',
        title: 'Review Action Failed',
        description: err instanceof Error ? err.message : 'Could not process review.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Disbursement
  const handleDisburseAction = async () => {
    if (!selectedRequest) return;

    setActionLoading(true);
    try {
      await fetchApi(`/welfare-requests/${selectedRequest.id}/disburse`, {
        method: 'POST',
        body: JSON.stringify({
          disbursementRef: disburseForm.disbursementRef.trim() || undefined,
          disbursementChannel: disburseForm.disbursementChannel,
          disbursementNotes: disburseForm.disbursementNotes.trim() || undefined,
        }),
      });

      notify({
        variant: 'default',
        title: 'Funds Disbursed',
        description: `Welfare Request ${selectedRequest.reference} has been marked as DISBURSED.`,
      });

      setDisburseModalOpen(false);
      setDisburseForm({ disbursementRef: '', disbursementChannel: 'BANK_TRANSFER', disbursementNotes: '' });
      void loadRequests();
    } catch (err) {
      notify({
        variant: 'destructive',
        title: 'Disbursement Failed',
        description: err instanceof Error ? err.message : 'Could not disburse funds.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Helper check for can act on selected
  const canActOnSelected = useMemo(() => {
    if (!selectedRequest || !user || selectedRequest.status !== 'PENDING' || !selectedRequest.approval) return false;
    // Self-approval block on frontend: requester cannot act
    if (isLoveth(user)) return false;
    const currentOrder = selectedRequest.approval.currentStepOrder;
    if (currentOrder === 1 && (isDaniel(user) || user.isSuperAdmin)) return true;
    if (currentOrder === 2 && (isEseosaGlory(user) || user.isSuperAdmin)) return true;
    return false;
  }, [selectedRequest, user]);

  return (
    <AdminLayoutShell activeHref="/admin/welfare">
      <div className="space-y-6 pb-20">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              <HeartHandshake className="w-4 h-4" />
              <span>Welfare &amp; Financial Assistance</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
              Welfare Fund Requests
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Managed workflow: Loveth submits → Daniel reviews (Stage 1) → Super Admin reviews (Stage 2) → Super Admin disburses.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => void loadRequests()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {canCreateWelfare(user) && (
              <button
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-sm shadow-rose-500/20 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>New Welfare Request</span>
              </button>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Requests</span>
              <FileText className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.total}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">All tracked records</p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Stage 1: Daniel</span>
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{metrics.pendingDaniel}</p>
            <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">Awaiting initial review</p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/30">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Stage 2: Super Admin</span>
              <Shield className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{metrics.pendingSuperAdmin}</p>
            <p className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">Awaiting final approval</p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Approved (Ready)</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{metrics.approvedPendingDisbursement}</p>
            <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Ready for disbursement</p>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/30 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Disbursed Funds</span>
              <DollarSign className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 truncate">
              ₦{metrics.totalDisbursedAmount.toLocaleString()}
            </p>
            <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">{metrics.totalDisbursedCount} requests paid</p>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'all', label: 'All Requests' },
              { key: 'pending_my_action', label: 'Pending My Action' },
              { key: 'pending', label: 'Pending' },
              { key: 'approved', label: 'Approved (Pending Disb.)' },
              { key: 'disbursed', label: 'Disbursed' },
              { key: 'rejected', label: 'Rejected' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key as any)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors ${
                  filterTab === tab.key
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reference, person, purpose..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* Table / List View */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Requester</th>
                  <th className="py-3 px-4">Purpose / For</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Stage / Status</th>
                  <th className="py-3 px-4 text-center">Date</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <HeartHandshake className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                      <p className="font-medium text-sm text-slate-600 dark:text-slate-300">No welfare requests found</p>
                      <p className="text-xs text-slate-400 mt-0.5">Try adjusting your filter or search query.</p>
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => (
                    <tr
                      key={req.id}
                      onClick={() => setSelectedRequest(req)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {req.reference}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{req.requester}</p>
                        <p className="text-[10px] text-slate-400">{req.memberCode}</p>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{req.title || req.purpose}</p>
                        {req.requestedFor && (
                          <p className="text-[10px] text-slate-400 truncate">For: {req.requestedFor}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        ₦{req.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {req.isDisbursed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            <Check className="w-3 h-3" /> Disbursed
                          </span>
                        ) : req.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <FileCheck className="w-3 h-3" /> Approved (Pending Disb.)
                          </span>
                        ) : req.status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <X className="w-3 h-3" /> Rejected
                          </span>
                        ) : req.approval?.currentStepOrder === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Clock className="w-3 h-3" /> Stage 1: Daniel
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            <Shield className="w-3 h-3" /> Stage 2: Super Admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500 whitespace-nowrap">
                        {new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRequest(req);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Drawer Modal */}
        {selectedRequest && (
          <Modal
            open={Boolean(selectedRequest)}
            onClose={() => setSelectedRequest(null)}
            title={`Welfare Request: ${selectedRequest.reference}`}
            size="lg"
          >
            <div className="space-y-5">
              {/* Header card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Requested Amount</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">
                    ₦{selectedRequest.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Submitted by <strong className="text-slate-800 dark:text-slate-200">{selectedRequest.requester}</strong> ({selectedRequest.memberCode})
                  </p>
                </div>
                <div>
                  {selectedRequest.isDisbursed ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      <Check className="w-3.5 h-3.5" /> DISBURSED
                    </span>
                  ) : selectedRequest.status === 'APPROVED' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <FileCheck className="w-3.5 h-3.5" /> APPROVED (Pending Disb.)
                    </span>
                  ) : selectedRequest.status === 'REJECTED' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      <X className="w-3.5 h-3.5" /> REJECTED
                    </span>
                  ) : selectedRequest.approval?.currentStepOrder === 1 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <Clock className="w-3.5 h-3.5" /> PENDING DANIEL REVIEW
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      <Shield className="w-3.5 h-3.5" /> PENDING SUPER ADMIN REVIEW
                    </span>
                  )}
                </div>
              </div>

              {/* Request Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Purpose</span>
                  <p className="text-slate-900 dark:text-white font-medium mt-0.5">{selectedRequest.purpose}</p>
                </div>
                {selectedRequest.requestedFor && (
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase text-[10px]">Requested For / Target</span>
                    <p className="text-slate-900 dark:text-white font-medium mt-0.5">{selectedRequest.requestedFor}</p>
                  </div>
                )}
                {selectedRequest.beneficiaryName && (
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase text-[10px]">Beneficiary / Institution</span>
                    <p className="text-slate-900 dark:text-white font-medium mt-0.5">{selectedRequest.beneficiaryName}</p>
                  </div>
                )}
                {selectedRequest.requiredByDate && (
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase text-[10px]">Required By Date</span>
                    <p className="text-slate-900 dark:text-white font-medium mt-0.5">
                      {new Date(selectedRequest.requiredByDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>

              {selectedRequest.description && (
                <div className="text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Detailed Description</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">
                    {selectedRequest.description}
                  </p>
                </div>
              )}

              {selectedRequest.supportingDocUrl && (
                <div className="text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Supporting Document</span>
                  <a
                    href={selectedRequest.supportingDocUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold mt-1 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Document / Receipt</span>
                  </a>
                </div>
              )}

              {/* Disbursement record if disbursed */}
              {selectedRequest.isDisbursed && (
                <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-200">
                    <Receipt className="w-4 h-4" />
                    <span>Disbursement Record</span>
                  </div>
                  <p className="text-blue-800 dark:text-blue-300">
                    Disbursed on <strong>{new Date(selectedRequest.disbursedAt!).toLocaleString()}</strong> via{' '}
                    <strong>{selectedRequest.disbursementChannel}</strong>.
                  </p>
                  {selectedRequest.disbursementRef && (
                    <p className="font-mono text-blue-700 dark:text-blue-400 text-[11px]">
                      Reference: {selectedRequest.disbursementRef}
                    </p>
                  )}
                  {selectedRequest.disbursementNotes && (
                    <p className="text-blue-800 dark:text-blue-300 italic text-[11px]">
                      Notes: {selectedRequest.disbursementNotes}
                    </p>
                  )}
                </div>
              )}

              {/* Approval Timeline */}
              {selectedRequest.approval?.steps && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                  <span className="text-slate-400 block font-semibold uppercase text-[10px] mb-2">Approval Chain</span>
                  <ApprovalTimeline steps={selectedRequest.approval.steps} />
                </div>
              )}

              {/* Action Buttons */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Close
                </button>

                {/* Review button for approver */}
                {canActOnSelected && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewDecision('REJECTED');
                        setReviewModalOpen(true);
                      }}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                    >
                      Reject Request
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewDecision('APPROVED');
                        setReviewModalOpen(true);
                      }}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
                    >
                      Approve Request
                    </button>
                  </>
                )}

                {/* Disburse button for Super Admin */}
                {selectedRequest.status === 'APPROVED' && !selectedRequest.isDisbursed && canDisburseWelfare(user) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDisburseForm({
                        disbursementRef: `DISB-${selectedRequest.reference.replace('WFR-', '')}`,
                        disbursementChannel: 'BANK_TRANSFER',
                        disbursementNotes: '',
                      });
                      setDisburseModalOpen(true);
                    }}
                    className="px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-sm shadow-blue-500/20 transition-all active:scale-95"
                  >
                    Disburse Funds
                  </button>
                )}
              </div>
            </div>
          </Modal>
        )}

        {/* Create Modal */}
        {createModalOpen && (
          <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="New Welfare Fund Request" size="lg">
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <p className="text-slate-500 dark:text-slate-400">
                Submit an official fund request on behalf of the Welfare Unit. Requests undergo two-stage review before release.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Request Title / Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Medical Assistance for Sister Mary"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Amount (₦) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    placeholder="e.g. 50000"
                    value={createForm.amount}
                    onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Currency
                  </label>
                  <input
                    type="text"
                    disabled
                    value="NGN (₦)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Purpose / Reason *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Short reason for the welfare disbursement"
                  value={createForm.purpose}
                  onChange={(e) => setCreateForm({ ...createForm, purpose: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Requested For (Person / Project)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Hospital bill, bereavement support"
                    value={createForm.requestedFor}
                    onChange={(e) => setCreateForm({ ...createForm, requestedFor: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Beneficiary / Unit
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Saint Nicholas Hospital"
                    value={createForm.beneficiaryName}
                    onChange={(e) => setCreateForm({ ...createForm, beneficiaryName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Required By Date
                </label>
                <input
                  type="date"
                  value={createForm.requiredByDate}
                  onChange={(e) => setCreateForm({ ...createForm, requiredByDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Detailed Description &amp; Justification
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide background, verification notes, or details..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supporting Document URL (Receipt / Medical report / Invoice)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={createForm.supportingDocUrl}
                  onChange={(e) => setCreateForm({ ...createForm, supportingDocUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-sm transition-all"
                >
                  {actionLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Review Modal (Approve/Reject) */}
        {reviewModalOpen && (
          <Modal
            open={reviewModalOpen}
            onClose={() => setReviewModalOpen(false)}
            title={`${reviewDecision === 'APPROVED' ? 'Approve' : 'Reject'} Request: ${selectedRequest?.reference}`}
            size="md"
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                {reviewDecision === 'APPROVED'
                  ? 'Confirm your approval for this request. It will progress to the next review or disbursement stage.'
                  : 'Specify the reason for rejecting this request. This decision is final and will be audited.'}
              </p>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Decision Comment / Reason {reviewDecision === 'REJECTED' && '*'}
                </label>
                <textarea
                  rows={3}
                  required={reviewDecision === 'REJECTED'}
                  placeholder={reviewDecision === 'REJECTED' ? 'Explain why this request is rejected...' : 'Optional comment...'}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReviewAction}
                  disabled={actionLoading}
                  className={`px-5 py-2 text-xs font-semibold rounded-xl text-white shadow-sm transition-all ${
                    reviewDecision === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {actionLoading ? 'Processing...' : `Confirm ${reviewDecision === 'APPROVED' ? 'Approval' : 'Rejection'}`}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Disbursement Modal */}
        {disburseModalOpen && selectedRequest && (
          <Modal
            open={disburseModalOpen}
            onClose={() => setDisburseModalOpen(false)}
            title={`Disburse Funds: ${selectedRequest.reference}`}
            size="md"
          >
            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40">
                <p className="text-blue-900 dark:text-blue-200 font-bold text-sm">
                  Amount to Disburse: ₦{selectedRequest.amount.toLocaleString()}
                </p>
                <p className="text-blue-700 dark:text-blue-400 text-[11px] mt-0.5">
                  Beneficiary: {selectedRequest.beneficiaryName || selectedRequest.requester}
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment / Disbursement Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. TRF-2026-99120"
                  value={disburseForm.disbursementRef}
                  onChange={(e) => setDisburseForm({ ...disburseForm, disbursementRef: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Disbursement Channel
                </label>
                <select
                  value={disburseForm.disbursementChannel}
                  onChange={(e) => setDisburseForm({ ...disburseForm, disbursementChannel: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                >
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CASH">Cash Voucher</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other Official Channel</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Disbursement Notes / Audit Memo
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional reference details, bank narration, or authorization notes..."
                  value={disburseForm.disbursementNotes}
                  onChange={(e) => setDisburseForm({ ...disburseForm, disbursementNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDisburseModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDisburseAction}
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                >
                  {actionLoading ? 'Disbursing...' : 'Confirm Disbursement'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminLayoutShell>
  );
}

export default function WelfareAdminPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-400">Loading Welfare Portal...</div>}>
      <WelfareAdminContent />
    </Suspense>
  );
}
