'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoIcon } from '../../../../components/LogoIcon';
import { ApprovalTimeline, ApprovalStepView } from '../../../../components/ApprovalTimeline';
import { fetchApi } from '../../../../lib/api';

interface WelfareRequest {
  id: string;
  reference?: string;
  title?: string;
  amount: number;
  currency?: string;
  purpose: string;
  description: string | null;
  requestedFor?: string | null;
  beneficiaryName?: string | null;
  requiredByDate?: string | null;
  supportingDocUrl?: string | null;
  status: string;
  stageStatus?: string;
  isDisbursed?: boolean;
  disbursedAt?: string | null;
  disbursementRef?: string | null;
  createdAt: string;
  approval: { steps: ApprovalStepView[]; status: string; currentStepOrder?: number } | null;
}

const getStageBadge = (r: WelfareRequest) => {
  if (r.isDisbursed) {
    return {
      label: 'Disbursed',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    };
  }
  if (r.status === 'APPROVED') {
    return {
      label: 'Approved (Pending Disb.)',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    };
  }
  if (r.status === 'REJECTED') {
    return {
      label: 'Rejected',
      className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    };
  }
  if (r.approval?.currentStepOrder === 1) {
    return {
      label: 'Stage 1: Daniel Review',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    };
  }
  if (r.approval?.currentStepOrder === 2) {
    return {
      label: 'Stage 2: Super Admin Review',
      className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    };
  }
  return {
    label: r.status,
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
};

export default function MemberWelfarePage() {
  const router = useRouter();
  const [rows, setRows] = useState<WelfareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    amount: '',
    currency: 'NGN',
    purpose: '',
    requestedFor: '',
    beneficiaryName: '',
    requiredByDate: '',
    description: '',
    supportingDocUrl: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      setRows(await fetchApi<WelfareRequest[]>('/welfare-requests/mine'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setMessage('');
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('Enter a valid amount.');
    if (form.purpose.trim().length < 3) return setFormError('Describe the purpose of the request.');
    setSubmitting(true);
    try {
      const created = await fetchApi<WelfareRequest>('/welfare-requests', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim() || undefined,
          amount,
          currency: form.currency,
          purpose: form.purpose.trim(),
          requestedFor: form.requestedFor.trim() || undefined,
          beneficiaryName: form.beneficiaryName.trim() || undefined,
          requiredByDate: form.requiredByDate || undefined,
          description: form.description.trim() || undefined,
          supportingDocUrl: form.supportingDocUrl.trim() || undefined,
        }),
      });
      setForm({
        title: '',
        amount: '',
        currency: 'NGN',
        purpose: '',
        requestedFor: '',
        beneficiaryName: '',
        requiredByDate: '',
        description: '',
        supportingDocUrl: '',
      });
      setMessage(`Request ${created.reference || ''} submitted successfully! Awaiting Daniel review.`);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit the request.');
    } finally {
      setSubmitting(false);
    }
  };

  const field =
    'w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-xs sm:text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <div className="min-h-screen bg-background pb-28 text-on-background">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-4 h-16 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-base sm:text-lg font-bold text-primary">Welfare &amp; Requests</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center overflow-hidden border border-outline-variant p-1">
          <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4 pb-28 sm:pb-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-primary">Welfare Support Portal</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Submit assistance requests on behalf of the Welfare Unit. Requests undergo two-stage leadership review.
          </p>
        </div>

        {/* Submission Form */}
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-xs">
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">New Welfare Fund Request</h2>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-on-surface">Request Title</span>
            <input
              className={field}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Medical Assistance for Sister Mary"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-on-surface">Amount (₦) <span className="text-error">*</span></span>
              <input
                className={field}
                type="number"
                min="1"
                step="any"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="50000"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-on-surface">Required By Date</span>
              <input
                className={field}
                type="date"
                value={form.requiredByDate}
                onChange={(e) => setForm({ ...form, requiredByDate: e.target.value })}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-on-surface">Purpose / Reason <span className="text-error">*</span></span>
            <input
              className={field}
              required
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              maxLength={300}
              placeholder="e.g. Hospital admission and emergency drugs"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-on-surface">Requested For (Target)</span>
              <input
                className={field}
                value={form.requestedFor}
                onChange={(e) => setForm({ ...form, requestedFor: e.target.value })}
                placeholder="e.g. Patient or Bereaved family"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-on-surface">Beneficiary / Institution</span>
              <input
                className={field}
                value={form.beneficiaryName}
                onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })}
                maxLength={160}
                placeholder="e.g. Saint Nicholas Hospital"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-on-surface">Detailed Description</span>
            <textarea
              className={field}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={4000}
              placeholder="Add relevant verification details or medical context..."
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-on-surface">Supporting Document URL (Invoice / Receipt)</span>
            <input
              className={field}
              type="url"
              value={form.supportingDocUrl}
              onChange={(e) => setForm({ ...form, supportingDocUrl: e.target.value })}
              placeholder="https://..."
            />
          </label>

          {formError && <p role="alert" className="text-xs font-medium text-error">{formError}</p>}
          {message && <p role="status" className="text-xs font-medium text-tertiary">{message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-xs sm:text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Submitting Request…' : 'Submit Welfare Request'}
          </button>
        </form>

        {/* Requests List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">My Submitted Requests</h2>
          {loading ? (
            <p className="text-xs text-on-surface-variant">Loading requests…</p>
          ) : error ? (
            <p role="alert" className="text-xs text-error">{error}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-outline-variant/40 p-6 text-center text-xs text-on-surface-variant">
              No requests submitted yet.
            </p>
          ) : (
            rows.map((r) => {
              const badgeInfo = getStageBadge(r);
              return (
                <article key={r.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-mono font-bold text-primary block">{r.reference || 'WFR'}</span>
                      <span className="font-bold text-sm text-on-surface">₦{r.amount.toLocaleString()}</span>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badgeInfo.className}`}>
                      {badgeInfo.label}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-on-surface">{r.title || r.purpose}</p>

                  {r.requestedFor && (
                    <p className="text-[11px] text-on-surface-variant">For: {r.requestedFor}</p>
                  )}

                  <p className="text-[10px] text-on-surface-variant">
                    Submitted: {new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>

                  {r.approval && (
                    <div className="mt-2 border-t border-outline-variant/15 pt-2">
                      <ApprovalTimeline steps={r.approval.steps} />
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
