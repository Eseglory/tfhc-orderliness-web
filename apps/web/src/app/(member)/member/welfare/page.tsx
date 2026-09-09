'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import { BottomNav } from '../../../../components/BottomNav';
import { ApprovalTimeline, ApprovalStepView } from '../../../../components/ApprovalTimeline';
import { fetchApi } from '../../../../lib/api';

interface WelfareRequest {
  id: string;
  amount: number;
  purpose: string;
  description: string | null;
  status: string;
  createdAt: string;
  approval: { steps: ApprovalStepView[]; status: string } | null;
}

const badge = (s: string) =>
  s === 'APPROVED'
    ? 'bg-tertiary-container text-on-tertiary-container'
    : s === 'REJECTED'
      ? 'bg-error-container text-on-error-container'
      : 'bg-secondary-container/40 text-on-secondary-container';

export default function MemberWelfarePage() {
  const [rows, setRows] = useState<WelfareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ amount: '', purpose: '', description: '', beneficiaryName: '' });
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
    if (form.purpose.trim().length < 3) return setFormError('Describe the purpose.');
    setSubmitting(true);
    try {
      await fetchApi('/welfare-requests', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          purpose: form.purpose.trim(),
          description: form.description.trim() || undefined,
          beneficiaryName: form.beneficiaryName.trim() || undefined,
        }),
      });
      setForm({ amount: '', purpose: '', description: '', beneficiaryName: '' });
      setMessage('Request submitted. You can track its progress below.');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit the request.');
    } finally {
      setSubmitting(false);
    }
  };

  const field = 'w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <div className="min-h-screen bg-background pb-24">
      <Navbar />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/member" className="hover:text-primary">Home</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Welfare fund</span>
        </nav>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Welfare Fund</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Request support from the unit welfare fund. Each request is reviewed by leadership.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="text-base font-bold text-on-surface">New request</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-on-surface">Amount (₦) <span className="text-error">*</span></span>
            <input className={field} type="number" min="1" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-on-surface">Purpose <span className="text-error">*</span></span>
            <input className={field} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} maxLength={300} placeholder="e.g. Medical bill support" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-on-surface">Beneficiary (if not you)</span>
            <input className={field} value={form.beneficiaryName} onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })} maxLength={160} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-on-surface">Details</span>
            <textarea className={field} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} />
          </label>
          {formError && <p role="alert" className="text-sm font-medium text-error">{formError}</p>}
          {message && <p role="status" className="text-sm font-medium text-tertiary">{message}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </form>

        <div className="space-y-3">
          <h2 className="text-base font-bold text-on-surface">My requests</h2>
          {loading ? (
            <p className="text-sm text-on-surface-variant">Loading…</p>
          ) : error ? (
            <p role="alert" className="text-sm text-error">{error}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-outline-variant/40 p-6 text-center text-sm text-on-surface-variant">No requests yet.</p>
          ) : (
            rows.map((r) => (
              <article key={r.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-on-surface">₦{r.amount.toLocaleString()}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge(r.status)}`}>{r.status}</span>
                </div>
                <p className="mt-1 text-sm text-on-surface">{r.purpose}</p>
                <p className="text-xs text-on-surface-variant">{new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                {r.approval && (
                  <div className="mt-3 border-t border-outline-variant/15 pt-3">
                    <ApprovalTimeline steps={r.approval.steps} />
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
