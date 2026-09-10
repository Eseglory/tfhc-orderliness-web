'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Search,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { Badge, Button, EmptyState, Field, Modal, Spinner, inputClass, useToast } from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

interface Payment {
  id: string;
  reference: string;
  member: string;
  memberCode: string;
  purpose: string;
  amount: number;
  method: string;
  payerReference: string | null;
  description: string | null;
  paidOn: string;
  status: string;
  rejectionReason: string | null;
  duesPeriod: string | null;
  createdAt: string;
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  CONFIRMED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  REFUNDED: 'neutral',
};

export default function PaymentsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const manage = can('payments.manage');

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      setRows(await fetchApi<Payment[]>(`/finance/payments?${q}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to payments.' : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, status]);

  const confirm = async (p: Payment) => {
    setBusy(p.id);
    try {
      await fetchApi(`/finance/payments/${p.id}/confirm`, { method: 'POST', body: '{}' });
      notify('Payment confirmed', 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not confirm', 'error');
    } finally {
      setBusy('');
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (p) =>
        p.member.toLowerCase().includes(q) ||
        p.memberCode.toLowerCase().includes(q) ||
        p.reference.toLowerCase().includes(q) ||
        (p.payerReference && p.payerReference.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const totalAmount = filtered.reduce((acc, p) => acc + p.amount, 0);
    const confirmedCount = filtered.filter((p) => p.status === 'CONFIRMED').length;
    const pendingCount = filtered.filter((p) => p.status === 'PENDING').length;
    return { totalAmount, confirmedCount, pendingCount };
  }, [filtered]);

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/finance" className="hover:text-indigo-600 transition-colors">FINANCE</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">PAYMENTS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Member Payments Verification
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review, verify and confirm member-declared bank transfers, dues receipts, and contributions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Refresh
            </button>
          </div>
        </div>

        {/* 3 Metric KPI Cards */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-3 gap-4 pb-1 sm:pb-0">
          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Awaiting Confirmation</span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.pendingCount}</p>
            <p className="mt-1 text-xs text-slate-500">Unverified declared payments</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Confirmed (View)</span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.confirmedCount}</p>
            <p className="mt-1 text-xs text-slate-500">Verified &amp; recorded</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Total Value (View)</span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{naira(stats.totalAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">Filtered set sum</p>
          </div>
        </div>

        {/* Tab Strip & Search Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {['PENDING', 'CONFIRMED', 'REJECTED', ''].map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  status === s
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {s ? s.toLowerCase() : 'All'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              placeholder="Search by member, reference, or payer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No Payments Found"
            description={status === 'PENDING' ? 'No transactions currently awaiting confirmation.' : 'No records match your filter.'}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Member</th>
                    <th className="px-4 py-3.5">Purpose &amp; Period</th>
                    <th className="px-4 py-3.5">Amount</th>
                    <th className="px-4 py-3.5">Reference</th>
                    <th className="px-4 py-3.5">Status</th>
                    {manage && <th className="px-4 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{p.member}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{p.memberCode} · {new Date(p.paidOn).toLocaleDateString()}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                        <span className="font-semibold capitalize">{p.purpose.replace('_', ' ').toLowerCase()}</span>
                        {p.duesPeriod && <span className="block text-[11px] text-slate-400">{p.duesPeriod}</span>}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white text-sm">{naira(p.amount)}</td>
                      <td className="px-4 py-3.5 text-slate-500">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{p.reference}</span>
                        {p.payerReference && <span className="block text-[11px] text-slate-400">Payer: {p.payerReference}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={TONE[p.status] ?? 'neutral'}>{p.status}</Badge>
                        {p.rejectionReason && <span className="block text-[11px] text-rose-500 font-semibold mt-0.5">{p.rejectionReason}</span>}
                      </td>
                      {manage && (
                        <td className="px-4 py-3.5 text-right">
                          {p.status === 'PENDING' && (
                            <div className="flex justify-end gap-1.5">
                              <button
                                className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                                onClick={() => setRejecting(p)}
                              >
                                Reject
                              </button>
                              <button
                                disabled={busy === p.id}
                                className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-xs"
                                onClick={() => confirm(p)}
                              >
                                Confirm
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {rejecting && (
        <RejectModal
          payment={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            notify('Payment rejected', 'success');
            load();
          }}
        />
      )}
    </AdminLayoutShell>
  );
}

function RejectModal({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${payment.reference}?`}
      description={`${payment.member} — ₦${payment.amount.toLocaleString()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={async () => {
              if (!reason.trim()) return;
              setSaving(true);
              try {
                await fetchApi(`/finance/payments/${payment.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
                onDone();
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Could not reject', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            Reject payment
          </Button>
        </>
      }
    >
      <Field label="Reason" required>
        <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
    </Modal>
  );
}
